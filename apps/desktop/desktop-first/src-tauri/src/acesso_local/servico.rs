//! `ServicoDeAcessoLocal`: configurar, desbloquear com senha e bloquear (UL-01, UL-02, UL-04).
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration as DuracaoStd, Instant};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{DateTime, Duration, Utc};

use super::armazenamento::{self, EstadoPersistido, Kdf, RegistroPendente};
use super::auditoria::{self, Detalhe, TIPOS_DE_AUDITORIA_DO_APP, ValorDeDetalhe};
use super::banco_local::BancoLocal;
use super::cofre_so::CofreDeChavesDoSo;
use super::cripto::{self, Chave, ParametrosArgon2};
use super::erros::ErroDeAcesso;
use super::estado::{EstadoDoAcesso, MotivoDeBloqueio, Situacao, UsuarioResumo};
use super::modo_offline::{self, PoliticaLocal};
use super::relogio::Relogio;

const MIN_CARACTERES_SENHA: usize = 12;
const MAX_CARACTERES_SENHA: usize = 128;
const CHAVE_ULTIMO_CHECKIN: &str = "ultimo_checkin";
const CHAVE_MARCA_DAGUA: &str = "marca_dagua";
const CHAVE_POLITICA: &str = "politica";

pub struct ServicoDeAcessoLocal {
    diretorio: PathBuf,
    // usado a partir da TASK-068 (chave de auditoria) e da TASK-069 (refresh token)
    cofre: Arc<dyn CofreDeChavesDoSo>,
    relogio: Arc<dyn Relogio>,
    parametros_novos: ParametrosArgon2,
    dek: Option<Chave>,
    banco: Option<BancoLocal>,
    situacao_desbloqueada: Situacao,
    reautenticado_em: Option<DateTime<Utc>>,
    ultima_atividade: Instant,
    sessao_online: bool,
    usuario: Option<UsuarioResumo>,
}

impl ServicoDeAcessoLocal {
    pub fn novo(
        diretorio: PathBuf,
        cofre: Arc<dyn CofreDeChavesDoSo>,
        relogio: Arc<dyn Relogio>,
        parametros_novos: ParametrosArgon2,
    ) -> Self {
        Self {
            diretorio,
            cofre,
            relogio,
            parametros_novos,
            dek: None,
            banco: None,
            situacao_desbloqueada: Situacao::Normal,
            reautenticado_em: None,
            ultima_atividade: Instant::now(),
            sessao_online: false,
            usuario: None,
        }
    }

    /// Define os parâmetros do Argon2id usados na próxima `configurar` (resultado de `calibrar`).
    pub fn definir_parametros_novos(&mut self, parametros: ParametrosArgon2) {
        self.parametros_novos = parametros;
    }

    pub fn estado(&self) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        let persistido = armazenamento::ler(&self.diretorio)?;
        Ok(self.montar_estado(&persistido))
    }

    fn montar_estado(&self, persistido: &EstadoPersistido) -> EstadoDoAcesso {
        let situacao = if persistido.revogado {
            Situacao::Revogado
        } else if persistido.kdf.is_none() {
            Situacao::SemConfiguracao
        } else if self.dek.is_none() {
            Situacao::Bloqueado
        } else {
            self.situacao_desbloqueada
        };
        EstadoDoAcesso {
            situacao,
            exige_login_completo: persistido.exige_login_completo,
            biometria_disponivel: false,
            biometria_habilitada: persistido.dek_por_biometria.is_some(),
            segundos_ate_nova_tentativa: armazenamento::segundos_restantes(
                persistido,
                self.relogio.agora(),
            ),
            sessao_online: self.sessao_online,
            usuario: self.usuario.clone(),
            eventos_pendentes: persistido.eventos_pendentes,
        }
    }

    /// UL-01: define a senha mestre. A senha nunca sai deste computador (RN-24).
    pub fn configurar(&mut self, senha: &str) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        if persistido.kdf.is_some() {
            return Err(ErroDeAcesso::JaConfigurado);
        }
        let tamanho = senha.chars().count();
        if !(MIN_CARACTERES_SENHA..=MAX_CARACTERES_SENHA).contains(&tamanho) {
            return Err(ErroDeAcesso::SenhaMestreFraca);
        }

        let dek = cripto::gerar_dek();
        let salt = cripto::gerar_salt();
        let kek = cripto::derivar_kek(senha, &salt, self.parametros_novos)?;
        let embrulhada = cripto::embrulhar(&dek, &kek)?;

        persistido.kdf = Some(Kdf {
            algoritmo: "argon2id".to_owned(),
            parametros: self.parametros_novos,
            salt_b64: STANDARD.encode(salt),
        });
        persistido.dek_por_senha = Some(embrulhada);
        // O arquivo é gravado antes de criar o banco: se o processo cair, a DEK embrulhada já existe.
        armazenamento::salvar(&self.diretorio, &persistido)?;

        let banco = BancoLocal::abrir(&self.diretorio, &dek)?;
        self.dek = Some(dek);
        self.banco = Some(banco);
        self.situacao_desbloqueada = Situacao::Normal;
        self.ultima_atividade = Instant::now();
        self.carregar_usuario();
        self.reavaliar_modo()?;
        // Melhor esforço: o que não for descarregado continua no arquivo e sai no próximo desbloqueio.
        let _ = self.descarregar_pendentes();
        self.estado()
    }

    /// UL-02: desbloqueio com atraso persistido (RN-27). Nunca apaga dados por falha (RN-28).
    pub fn desbloquear_com_senha(&mut self, senha: &str) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        let Some(kdf) = persistido.kdf.clone() else {
            return Err(ErroDeAcesso::NaoConfigurado);
        };
        if persistido.revogado {
            return Err(ErroDeAcesso::DispositivoRevogado);
        }
        if persistido.exige_login_completo {
            return Err(ErroDeAcesso::ExigeLoginCompleto);
        }
        if self.esta_desbloqueado() {
            return Ok(self.montar_estado(&persistido));
        }
        let agora = self.relogio.agora();
        let restantes = armazenamento::segundos_restantes(&persistido, agora);
        if restantes > 0 {
            return Err(ErroDeAcesso::AguardeAntesDeTentar {
                segundos_restantes: restantes,
            });
        }

        // Pré-incrementa e grava antes de derivar: matar o processo não burla o contador.
        persistido.falhas_consecutivas = persistido.falhas_consecutivas.saturating_add(1);
        persistido.ultima_falha_em = Some(agora);
        armazenamento::salvar(&self.diretorio, &persistido)?;

        let salt = STANDARD
            .decode(&kdf.salt_b64)
            .map_err(|_| ErroDeAcesso::Interno)?;
        let kek = cripto::derivar_kek(senha, &salt, kdf.parametros)?;
        let embrulhada = persistido
            .dek_por_senha
            .clone()
            .ok_or(ErroDeAcesso::Interno)?;

        let Some(dek) = cripto::desembrulhar(&embrulhada, &kek) else {
            let tentativa = persistido.falhas_consecutivas;
            let atingiu_o_limite = tentativa >= persistido.max_falhas_desbloqueio_local;
            if atingiu_o_limite {
                persistido.exige_login_completo = true;
            }
            persistido.auditoria_pendente.push(RegistroPendente {
                tipo: "desbloqueio-local-falhou".to_owned(),
                ocorrido_em: agora,
                detalhe: [("tentativa".to_owned(), serde_json::json!(tentativa))].into(),
            });
            armazenamento::salvar(&self.diretorio, &persistido)?;
            return Err(if atingiu_o_limite {
                ErroDeAcesso::ExigeLoginCompleto
            } else {
                ErroDeAcesso::SenhaMestreIncorreta
            });
        };

        persistido.falhas_consecutivas = 0;
        persistido.ultima_falha_em = None;
        persistido.auditoria_pendente.push(RegistroPendente {
            tipo: "desbloqueio-local-ok".to_owned(),
            ocorrido_em: agora,
            detalhe: [("metodo".to_owned(), serde_json::json!("senha"))].into(),
        });
        armazenamento::salvar(&self.diretorio, &persistido)?;

        let banco = BancoLocal::abrir(&self.diretorio, &dek)?;
        self.dek = Some(dek);
        self.banco = Some(banco);
        self.situacao_desbloqueada = Situacao::Normal;
        self.ultima_atividade = Instant::now();
        self.carregar_usuario();
        self.reavaliar_modo()?;
        // Melhor esforço: o que não for descarregado continua no arquivo e sai no próximo desbloqueio.
        let _ = self.descarregar_pendentes();
        self.estado()
    }

    /// Política vinda do banco (gravada no login) ou o padrão.
    pub fn politica(&self) -> PoliticaLocal {
        self.banco
            .as_ref()
            .and_then(|banco| banco.ler_valor(CHAVE_POLITICA).ok().flatten())
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    /// Reavalia o modo offline: avalia primeiro e só depois avança a marca d'água (DT-12).
    pub fn reavaliar_modo(&mut self) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        let agora = self.relogio.agora();
        let politica = self.politica();
        let banco = self.banco.as_ref().ok_or(ErroDeAcesso::Bloqueado)?;
        let ultimo_checkin = match ler_instante(banco, CHAVE_ULTIMO_CHECKIN)? {
            Some(instante) => instante,
            None => {
                // Primeiro acesso: o login acabou de acontecer. Gravar para que o prazo passe a correr.
                banco.gravar_valor(CHAVE_ULTIMO_CHECKIN, &agora.to_rfc3339())?;
                agora
            }
        };
        let marca_dagua = ler_instante(banco, CHAVE_MARCA_DAGUA)?;
        let nova = modo_offline::avaliar(agora, ultimo_checkin, marca_dagua, &politica);
        banco.gravar_valor(
            CHAVE_MARCA_DAGUA,
            &modo_offline::nova_marca_dagua(marca_dagua, agora).to_rfc3339(),
        )?;

        let entrou_em_restricao =
            nova != Situacao::Normal && self.situacao_desbloqueada == Situacao::Normal;
        self.situacao_desbloqueada = nova;
        if entrou_em_restricao {
            let mut persistido = armazenamento::ler(&self.diretorio)?;
            persistido.auditoria_pendente.push(RegistroPendente {
                tipo: "modo-somente-leitura".to_owned(),
                ocorrido_em: agora,
                detalhe: Default::default(),
            });
            armazenamento::salvar(&self.diretorio, &persistido)?;
        }
        self.estado()
    }

    /// UL-04: descarta banco e DEK da memória. Idempotente. Não apaga nenhum arquivo.
    pub fn bloquear(&mut self, motivo: MotivoDeBloqueio) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        if self.esta_desbloqueado() {
            // Melhor esforço: a falha em registrar o evento nunca impede o bloqueio.
            let _ = self.registrar_bloqueio(motivo);
        }
        if let Some(banco) = self.banco.take() {
            // Mesmo que o fechamento falhe, a conexão é descartada e a DEK sai da memória.
            let _ = banco.fechar();
        }
        self.dek = None;
        self.reautenticado_em = None;
        self.estado()
    }

    fn registrar_bloqueio(&mut self, motivo: MotivoDeBloqueio) -> Result<(), ErroDeAcesso> {
        let detalhe: Detalhe = [(
            "motivo".to_owned(),
            ValorDeDetalhe::Texto(motivo.como_texto().to_owned()),
        )]
        .into();
        self.auditar("app-bloqueado", detalhe)?;
        self.atualizar_eventos_pendentes()
    }

    /// Grava o registro assinado direto no banco quando é possível (desbloqueado, com usuário e
    /// dispositivo conhecidos); senão guarda em `auditoria_pendente` para gravar no próximo desbloqueio.
    pub fn auditar(&mut self, tipo: &str, detalhe: Detalhe) -> Result<(), ErroDeAcesso> {
        if !TIPOS_DE_AUDITORIA_DO_APP.contains(&tipo) {
            return Err(ErroDeAcesso::Interno);
        }
        let agora = self.relogio.agora();
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        if let (Some(banco), Some(usuario), Some(dispositivo)) = (
            self.banco.as_ref(),
            self.usuario.as_ref(),
            persistido.dispositivo_id.as_deref(),
        ) {
            let chave = auditoria::chave_de_assinatura(self.cofre.as_ref())?;
            auditoria::registrar(
                banco,
                &chave,
                tipo,
                detalhe,
                agora,
                &usuario.id,
                dispositivo,
            )?;
            return Ok(());
        }
        persistido.auditoria_pendente.push(RegistroPendente {
            tipo: tipo.to_owned(),
            ocorrido_em: agora,
            detalhe: detalhe
                .iter()
                .map(|(chave, valor)| {
                    (
                        chave.clone(),
                        serde_json::to_value(valor).unwrap_or(serde_json::Value::Null),
                    )
                })
                .collect(),
        });
        armazenamento::salvar(&self.diretorio, &persistido)
    }

    /// Passa para o banco, na ordem, o que foi gerado com o app bloqueado. Tudo ou nada.
    fn descarregar_pendentes(&mut self) -> Result<(), ErroDeAcesso> {
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        let (Some(banco), Some(usuario), Some(dispositivo)) = (
            self.banco.as_ref(),
            self.usuario.as_ref(),
            persistido.dispositivo_id.clone(),
        ) else {
            return Ok(());
        };
        if persistido.auditoria_pendente.is_empty() {
            return Ok(());
        }
        let chave = auditoria::chave_de_assinatura(self.cofre.as_ref())?;
        let transacao = banco
            .conexao()
            .unchecked_transaction()
            .map_err(|_| ErroDeAcesso::Interno)?;
        for pendente in &persistido.auditoria_pendente {
            let detalhe: Detalhe = pendente
                .detalhe
                .iter()
                .map(|(chave, valor)| (chave.clone(), ValorDeDetalhe::from(valor)))
                .collect();
            auditoria::registrar(
                banco,
                &chave,
                &pendente.tipo,
                detalhe,
                pendente.ocorrido_em,
                &usuario.id,
                &dispositivo,
            )?;
        }
        transacao.commit().map_err(|_| ErroDeAcesso::Interno)?;
        persistido.auditoria_pendente.clear();
        persistido.eventos_pendentes = auditoria::contar_pendentes(banco)?;
        armazenamento::salvar(&self.diretorio, &persistido)
    }

    /// Mantém no arquivo o total de eventos ainda não enviados, visível mesmo com o app bloqueado.
    fn atualizar_eventos_pendentes(&self) -> Result<(), ErroDeAcesso> {
        let banco = self.banco.as_ref().ok_or(ErroDeAcesso::Bloqueado)?;
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        let no_arquivo = u64::try_from(persistido.auditoria_pendente.len()).unwrap_or(0);
        persistido.eventos_pendentes =
            auditoria::contar_pendentes(banco)?.saturating_add(no_arquivo);
        armazenamento::salvar(&self.diretorio, &persistido)
    }

    fn carregar_usuario(&mut self) {
        let gravado = self
            .banco
            .as_ref()
            .and_then(|banco| banco.ler_valor("usuario").ok().flatten())
            .and_then(|json| serde_json::from_str::<UsuarioResumo>(&json).ok());
        if gravado.is_some() {
            self.usuario = gravado;
        }
    }

    /// Sinal de atividade do usuário. Sem efeito com o app bloqueado: nunca desbloqueia.
    pub fn registrar_atividade(&mut self) {
        if self.esta_desbloqueado() {
            self.ultima_atividade = Instant::now();
        }
    }

    pub fn ociosidade(&self) -> DuracaoStd {
        self.ultima_atividade.elapsed()
    }

    pub fn limite_inatividade(&self) -> DuracaoStd {
        let minutos = u64::try_from(self.politica().inatividade_min.max(1)).unwrap_or(1);
        DuracaoStd::from_secs(minutos.saturating_mul(60))
    }

    pub fn esta_desbloqueado(&self) -> bool {
        self.dek.is_some() && self.banco.is_some()
    }

    pub fn banco(&self) -> Result<&BancoLocal, ErroDeAcesso> {
        self.banco.as_ref().ok_or(ErroDeAcesso::Bloqueado)
    }

    pub fn garantir_escrita(&self) -> Result<(), ErroDeAcesso> {
        if !self.esta_desbloqueado() {
            return Err(ErroDeAcesso::Bloqueado);
        }
        match self.situacao_desbloqueada {
            Situacao::SomenteLeitura | Situacao::OfflineExpirado => {
                Err(ErroDeAcesso::SomenteLeitura)
            }
            _ => Ok(()),
        }
    }

    /// Registra que o usuário acabou de confirmar a identidade (usado pela TASK-071).
    pub fn marcar_reautenticado(&mut self) {
        self.reautenticado_em = Some(self.relogio.agora());
    }

    pub fn garantir_reautenticacao_recente(&self, janela_min: i64) -> Result<(), ErroDeAcesso> {
        match self.reautenticado_em {
            Some(quando) if self.relogio.agora() - quando <= Duration::minutes(janela_min) => {
                Ok(())
            }
            _ => Err(ErroDeAcesso::ReautenticacaoNecessaria),
        }
    }
}

fn ler_instante(banco: &BancoLocal, chave: &str) -> Result<Option<DateTime<Utc>>, ErroDeAcesso> {
    match banco.ler_valor(chave)? {
        Some(texto) => DateTime::parse_from_rfc3339(&texto)
            .map(|instante| Some(instante.with_timezone(&Utc)))
            .map_err(|_| ErroDeAcesso::Interno),
        None => Ok(None),
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::acesso_local::banco_local::NOME_DO_BANCO;
    use crate::acesso_local::cofre_so::CofreEmMemoria;
    use crate::acesso_local::relogio::RelogioFixo;
    use tempfile::{TempDir, tempdir};

    const SENHA: &str = "senha-mestre-bem-forte";
    const PARAMETROS_DE_TESTE: ParametrosArgon2 = ParametrosArgon2 {
        m_kib: 8192,
        t: 1,
        p: 1,
    };

    struct Ambiente {
        pasta: TempDir,
        relogio: Arc<RelogioFixo>,
        cofre: Arc<CofreEmMemoria>,
    }

    impl Ambiente {
        fn novo() -> Self {
            use chrono::TimeZone;
            Self {
                pasta: tempdir().unwrap(),
                relogio: Arc::new(RelogioFixo::novo(
                    Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap(),
                )),
                cofre: Arc::new(CofreEmMemoria::novo()),
            }
        }

        fn servico(&self) -> ServicoDeAcessoLocal {
            ServicoDeAcessoLocal::novo(
                self.pasta.path().to_path_buf(),
                self.cofre.clone(),
                self.relogio.clone(),
                PARAMETROS_DE_TESTE,
            )
        }

        /// Falha de propósito; avança o relógio além de qualquer atraso antes da próxima.
        fn errar(&self, servico: &mut ServicoDeAcessoLocal) -> ErroDeAcesso {
            let erro = servico
                .desbloquear_com_senha("senha-errada-123")
                .unwrap_err();
            self.relogio.avancar(Duration::seconds(700));
            erro
        }
    }

    #[test]
    fn sempre_abre_bloqueado() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        assert_eq!(
            servico.estado().unwrap().situacao,
            Situacao::SemConfiguracao
        );
        assert_eq!(
            servico.configurar(SENHA).unwrap().situacao,
            Situacao::Normal
        );
        assert!(servico.esta_desbloqueado());

        let reaberto = ambiente.servico();
        assert_eq!(reaberto.estado().unwrap().situacao, Situacao::Bloqueado);
        assert!(!reaberto.esta_desbloqueado());
    }

    #[test]
    fn senha_certa_desbloqueia_e_le_valor_gravado_antes() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico
            .banco()
            .unwrap()
            .gravar_valor("usuario", "lucas")
            .unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        let estado = servico.desbloquear_com_senha(SENHA).unwrap();
        assert_eq!(estado.situacao, Situacao::Normal);
        assert_eq!(
            servico
                .banco()
                .unwrap()
                .ler_valor("usuario")
                .unwrap()
                .as_deref(),
            Some("lucas")
        );
    }

    #[test]
    fn senha_errada_conta_a_falha_no_disco() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        assert!(matches!(
            servico.desbloquear_com_senha("senha-errada-123"),
            Err(ErroDeAcesso::SenhaMestreIncorreta)
        ));
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(disco.falhas_consecutivas, 1);
        assert_eq!(
            disco.auditoria_pendente.last().unwrap().tipo,
            "desbloqueio-local-falhou"
        );
    }

    #[test]
    fn tres_falhas_impoem_espera_de_cinco_segundos() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        for _ in 0..3 {
            assert!(matches!(
                ambiente.errar_sem_avancar(&mut servico),
                ErroDeAcesso::SenhaMestreIncorreta
            ));
        }
        assert!(matches!(
            servico.desbloquear_com_senha(SENHA),
            Err(ErroDeAcesso::AguardeAntesDeTentar {
                segundos_restantes: 5
            })
        ));
        assert_eq!(servico.estado().unwrap().segundos_ate_nova_tentativa, 5);

        ambiente.relogio.avancar(Duration::seconds(5));
        assert!(servico.desbloquear_com_senha(SENHA).is_ok());
    }

    #[test]
    fn dez_falhas_exigem_login_completo_e_nao_apagam_dados() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        for _ in 0..9 {
            assert!(matches!(
                ambiente.errar(&mut servico),
                ErroDeAcesso::SenhaMestreIncorreta
            ));
        }
        assert!(matches!(
            ambiente.errar(&mut servico),
            ErroDeAcesso::ExigeLoginCompleto
        ));
        assert!(matches!(
            servico.desbloquear_com_senha(SENHA),
            Err(ErroDeAcesso::ExigeLoginCompleto)
        ));
        assert!(ambiente.pasta.path().join(NOME_DO_BANCO).exists());
        assert!(
            ambiente
                .pasta
                .path()
                .join(armazenamento::NOME_DO_ARQUIVO)
                .exists()
        );
        assert!(servico.estado().unwrap().exige_login_completo);
    }

    #[test]
    fn contador_persiste_apos_reinicio() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        ambiente.errar(&mut servico);
        ambiente.errar(&mut servico);

        let reiniciado = ambiente.servico();
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(disco.falhas_consecutivas, 2);
        assert_eq!(reiniciado.estado().unwrap().situacao, Situacao::Bloqueado);
    }

    #[test]
    fn bloquear_descarta_o_banco_e_e_idempotente() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        assert_eq!(
            servico
                .bloquear(MotivoDeBloqueio::Inatividade)
                .unwrap()
                .situacao,
            Situacao::Bloqueado
        );
        assert!(matches!(servico.banco(), Err(ErroDeAcesso::Bloqueado)));
        assert!(!servico.esta_desbloqueado());
        assert!(servico.bloquear(MotivoDeBloqueio::Manual).is_ok());
        assert!(matches!(
            servico.garantir_escrita(),
            Err(ErroDeAcesso::Bloqueado)
        ));
    }

    #[test]
    fn senha_curta_e_configuracao_duplicada_sao_recusadas() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        assert!(matches!(
            servico.configurar("12345678901"),
            Err(ErroDeAcesso::SenhaMestreFraca)
        ));
        let longa = "a".repeat(129);
        assert!(matches!(
            servico.configurar(&longa),
            Err(ErroDeAcesso::SenhaMestreFraca)
        ));
        assert!(servico.configurar("123456789012").is_ok());
        assert!(matches!(
            servico.configurar(SENHA),
            Err(ErroDeAcesso::JaConfigurado)
        ));
    }

    #[test]
    fn senha_com_acentos_conta_caracteres_e_nao_bytes() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        // 11 caracteres, mas mais de 12 bytes
        assert!(matches!(
            servico.configurar("ççççççççççç"),
            Err(ErroDeAcesso::SenhaMestreFraca)
        ));
    }

    #[test]
    fn sucesso_zera_o_contador() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        ambiente.errar(&mut servico);
        ambiente.errar(&mut servico);
        servico.desbloquear_com_senha(SENHA).unwrap();
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(disco.falhas_consecutivas, 0);
        assert!(disco.ultima_falha_em.is_none());
        assert_eq!(
            disco.auditoria_pendente.last().unwrap().tipo,
            "desbloqueio-local-ok"
        );
    }

    #[test]
    fn desbloquear_sem_configurar_e_com_dispositivo_revogado() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        assert!(matches!(
            servico.desbloquear_com_senha(SENHA),
            Err(ErroDeAcesso::NaoConfigurado)
        ));

        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        let mut disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        disco.revogado = true;
        armazenamento::salvar(ambiente.pasta.path(), &disco).unwrap();
        assert!(matches!(
            servico.desbloquear_com_senha(SENHA),
            Err(ErroDeAcesso::DispositivoRevogado)
        ));
        assert_eq!(servico.estado().unwrap().situacao, Situacao::Revogado);
    }

    #[test]
    fn reautenticacao_recente_exige_confirmacao_dentro_da_janela() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        assert!(matches!(
            servico.garantir_reautenticacao_recente(5),
            Err(ErroDeAcesso::ReautenticacaoNecessaria)
        ));
        servico.marcar_reautenticado();
        assert!(servico.garantir_reautenticacao_recente(5).is_ok());
        ambiente.relogio.avancar(Duration::seconds(5 * 60 + 1));
        assert!(matches!(
            servico.garantir_reautenticacao_recente(5),
            Err(ErroDeAcesso::ReautenticacaoNecessaria)
        ));
    }

    impl Ambiente {
        /// Falha de propósito sem avançar o relógio (para exercitar o atraso).
        fn errar_sem_avancar(&self, servico: &mut ServicoDeAcessoLocal) -> ErroDeAcesso {
            servico
                .desbloquear_com_senha("senha-errada-123")
                .unwrap_err()
        }
    }

    #[test]
    fn checkin_antigo_ao_desbloquear_vira_somente_leitura() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        let antigo = ambiente.relogio.agora() - Duration::days(6);
        servico
            .banco()
            .unwrap()
            .gravar_valor("ultimo_checkin", &antigo.to_rfc3339())
            .unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        let estado = servico.desbloquear_com_senha(SENHA).unwrap();
        assert_eq!(estado.situacao, Situacao::SomenteLeitura);
        assert!(matches!(
            servico.garantir_escrita(),
            Err(ErroDeAcesso::SomenteLeitura)
        ));
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(
            disco.auditoria_pendente.last().unwrap().tipo,
            "modo-somente-leitura"
        );
    }

    #[test]
    fn politica_sem_leitura_apos_limite_expira_o_acesso() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        let banco = servico.banco().unwrap();
        let politica = PoliticaLocal {
            leitura_permitida_apos_limite: false,
            ..PoliticaLocal::default()
        };
        banco
            .gravar_valor("politica", &serde_json::to_string(&politica).unwrap())
            .unwrap();
        let antigo = ambiente.relogio.agora() - Duration::days(6);
        banco
            .gravar_valor("ultimo_checkin", &antigo.to_rfc3339())
            .unwrap();
        assert_eq!(servico.politica(), politica);
        assert_eq!(
            servico.reavaliar_modo().unwrap().situacao,
            Situacao::OfflineExpirado
        );
        assert!(matches!(
            servico.garantir_escrita(),
            Err(ErroDeAcesso::SomenteLeitura)
        ));
    }

    #[test]
    fn relogio_retrocedido_vira_somente_leitura_e_a_marca_nao_diminui() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        let marca = ambiente.relogio.agora();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        ambiente.relogio.definir(marca - Duration::minutes(1));
        let estado = servico.desbloquear_com_senha(SENHA).unwrap();
        assert_eq!(estado.situacao, Situacao::SomenteLeitura);
        let gravada = servico
            .banco()
            .unwrap()
            .ler_valor("marca_dagua")
            .unwrap()
            .unwrap();
        assert_eq!(
            DateTime::parse_from_rfc3339(&gravada)
                .unwrap()
                .with_timezone(&Utc),
            marca
        );
    }

    #[test]
    fn primeiro_acesso_grava_o_checkin_e_fica_normal() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        assert_eq!(
            servico.configurar(SENHA).unwrap().situacao,
            Situacao::Normal
        );
        assert!(
            servico
                .banco()
                .unwrap()
                .ler_valor("ultimo_checkin")
                .unwrap()
                .is_some()
        );
        assert_eq!(servico.politica(), PoliticaLocal::default());
        assert!(servico.garantir_escrita().is_ok());
    }

    #[test]
    fn atividade_com_o_app_bloqueado_nao_desbloqueia() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        servico.registrar_atividade();
        assert!(!servico.esta_desbloqueado());
        assert_eq!(servico.estado().unwrap().situacao, Situacao::Bloqueado);
    }

    #[test]
    fn limite_de_inatividade_vem_da_politica() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        assert_eq!(servico.limite_inatividade(), DuracaoStd::from_secs(600));
        let politica = PoliticaLocal {
            inatividade_min: 1,
            ..PoliticaLocal::default()
        };
        servico
            .banco()
            .unwrap()
            .gravar_valor("politica", &serde_json::to_string(&politica).unwrap())
            .unwrap();
        assert_eq!(servico.limite_inatividade(), DuracaoStd::from_secs(60));
    }

    #[test]
    fn bloquear_registra_o_motivo_so_quando_estava_desbloqueado() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Inatividade).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        let bloqueios: Vec<_> = disco
            .auditoria_pendente
            .iter()
            .filter(|r| r.tipo == "app-bloqueado")
            .collect();
        assert_eq!(bloqueios.len(), 1);
        assert_eq!(bloqueios[0].detalhe["motivo"], "inatividade");
    }

    fn conhecer_dispositivo(ambiente: &Ambiente) {
        let mut disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        disco.dispositivo_id = Some("22222222-2222-4222-8222-222222222222".to_owned());
        armazenamento::salvar(ambiente.pasta.path(), &disco).unwrap();
    }

    fn gravar_usuario(servico: &ServicoDeAcessoLocal) {
        let usuario = UsuarioResumo {
            id: "11111111-1111-4111-8111-111111111111".to_owned(),
            nome: "Lucas".to_owned(),
            email: "lucas@clinica.com".to_owned(),
        };
        servico
            .banco()
            .unwrap()
            .gravar_valor("usuario", &serde_json::to_string(&usuario).unwrap())
            .unwrap();
    }

    #[test]
    fn registros_com_o_app_bloqueado_sao_gravados_no_banco_na_ordem_ao_desbloquear() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        gravar_usuario(&servico);
        conhecer_dispositivo(&ambiente);
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        servico
            .auditar(
                "biometria-ativada",
                [(
                    "origem".to_owned(),
                    ValorDeDetalhe::Texto("teste".to_owned()),
                )]
                .into(),
            )
            .unwrap();
        let antes = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(antes.auditoria_pendente.len(), 2);

        servico.desbloquear_com_senha(SENHA).unwrap();

        let depois = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert!(depois.auditoria_pendente.is_empty());
        assert_eq!(depois.eventos_pendentes, 3);
        let gravados = auditoria::pendentes(servico.banco().unwrap(), 100).unwrap();
        let tipos: Vec<&str> = gravados.iter().map(|r| r.tipo.as_str()).collect();
        assert_eq!(
            tipos,
            ["app-bloqueado", "biometria-ativada", "desbloqueio-local-ok"]
        );
        assert_eq!(gravados[0].hash_anterior, None);
        assert_eq!(
            gravados[1].hash_anterior.as_deref(),
            Some(gravados[0].hash.as_str())
        );
        assert_eq!(
            gravados[2].hash_anterior.as_deref(),
            Some(gravados[1].hash.as_str())
        );
    }

    #[test]
    fn sem_usuario_conhecido_os_registros_ficam_no_arquivo() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        servico.desbloquear_com_senha(SENHA).unwrap();
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(disco.auditoria_pendente.len(), 2);
        assert_eq!(
            auditoria::contar_pendentes(servico.banco().unwrap()).unwrap(),
            0
        );
    }

    #[test]
    fn auditar_desbloqueado_com_usuario_grava_direto_no_banco() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        gravar_usuario(&servico);
        conhecer_dispositivo(&ambiente);
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        servico.desbloquear_com_senha(SENHA).unwrap();

        servico
            .auditar("reautenticacao-sensivel", Detalhe::new())
            .unwrap();
        let gravados = auditoria::pendentes(servico.banco().unwrap(), 100).unwrap();
        assert_eq!(gravados.last().unwrap().tipo, "reautenticacao-sensivel");
        assert_eq!(servico.estado().unwrap().usuario.unwrap().nome, "Lucas");
    }

    #[test]
    fn tipo_de_auditoria_fora_da_lista_e_recusado() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        assert!(matches!(
            servico.auditar("tipo-inventado", Detalhe::new()),
            Err(ErroDeAcesso::Interno)
        ));
    }

    #[test]
    fn nenhum_detalhe_contem_a_senha() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        let senha = "senha-mestre-de-teste";
        servico.configurar(senha).unwrap();
        gravar_usuario(&servico);
        conhecer_dispositivo(&ambiente);
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        ambiente.errar(&mut servico);
        servico.desbloquear_com_senha(senha).unwrap();

        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert!(
            !serde_json::to_string(&disco.auditoria_pendente)
                .unwrap()
                .contains(senha)
        );
        for registro in auditoria::pendentes(servico.banco().unwrap(), 100).unwrap() {
            assert!(!serde_json::to_string(&registro).unwrap().contains(senha));
        }
    }

    #[test]
    fn dek_nao_aparece_no_estado_serializado() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        let estado = servico.configurar(SENHA).unwrap();
        let json = serde_json::to_string(&estado).unwrap();
        assert!(!json.contains("dek"));
        assert!(!json.contains("senha"));
    }
}
