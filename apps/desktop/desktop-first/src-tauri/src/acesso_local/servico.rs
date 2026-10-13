//! `ServicoDeAcessoLocal`: configurar, desbloquear com senha e bloquear (UL-01, UL-02, UL-04).
use std::path::PathBuf;
use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{DateTime, Duration, Utc};

use super::armazenamento::{self, EstadoPersistido, Kdf, RegistroPendente};
use super::banco_local::BancoLocal;
use super::cofre_so::CofreDeChavesDoSo;
use super::cripto::{self, Chave, ParametrosArgon2};
use super::erros::ErroDeAcesso;
use super::estado::{EstadoDoAcesso, MotivoDeBloqueio, Situacao, UsuarioResumo};

const MIN_CARACTERES_SENHA: usize = 12;
const MAX_CARACTERES_SENHA: usize = 128;

/// Provisório: a TASK-066 move este trait para `relogio.rs`.
pub trait Relogio: Send + Sync {
    fn agora(&self) -> DateTime<Utc>;
}

pub struct RelogioDoSistema;

impl Relogio for RelogioDoSistema {
    fn agora(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

pub struct ServicoDeAcessoLocal {
    diretorio: PathBuf,
    #[allow(dead_code)]
    // usado a partir da TASK-068 (chave de auditoria) e da TASK-069 (refresh token)
    cofre: Arc<dyn CofreDeChavesDoSo>,
    relogio: Arc<dyn Relogio>,
    parametros_novos: ParametrosArgon2,
    dek: Option<Chave>,
    banco: Option<BancoLocal>,
    situacao_desbloqueada: Situacao,
    reautenticado_em: Option<DateTime<Utc>>,
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
        Ok(self.montar_estado(&persistido))
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
        Ok(self.montar_estado(&persistido))
    }

    /// UL-04: descarta banco e DEK da memória. Idempotente. Não apaga nenhum arquivo.
    pub fn bloquear(&mut self, _motivo: MotivoDeBloqueio) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        if let Some(banco) = self.banco.take() {
            // Mesmo que o fechamento falhe, a conexão é descartada e a DEK sai da memória.
            let _ = banco.fechar();
        }
        self.dek = None;
        self.reautenticado_em = None;
        self.estado()
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

#[cfg(test)]
mod testes {
    use super::*;
    use crate::acesso_local::banco_local::NOME_DO_BANCO;
    use crate::acesso_local::cofre_so::CofreEmMemoria;
    use std::sync::Mutex;
    use tempfile::{TempDir, tempdir};

    const SENHA: &str = "senha-mestre-bem-forte";
    const PARAMETROS_DE_TESTE: ParametrosArgon2 = ParametrosArgon2 {
        m_kib: 8192,
        t: 1,
        p: 1,
    };

    struct RelogioDeTeste(Mutex<DateTime<Utc>>);

    impl RelogioDeTeste {
        fn avancar(&self, segundos: i64) {
            if let Ok(mut agora) = self.0.lock() {
                *agora += Duration::seconds(segundos);
            }
        }
    }

    impl Relogio for RelogioDeTeste {
        fn agora(&self) -> DateTime<Utc> {
            *self.0.lock().unwrap()
        }
    }

    struct Ambiente {
        pasta: TempDir,
        relogio: Arc<RelogioDeTeste>,
        cofre: Arc<CofreEmMemoria>,
    }

    impl Ambiente {
        fn novo() -> Self {
            use chrono::TimeZone;
            Self {
                pasta: tempdir().unwrap(),
                relogio: Arc::new(RelogioDeTeste(Mutex::new(
                    Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap(),
                ))),
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
            self.relogio.avancar(700);
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

        ambiente.relogio.avancar(5);
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
        ambiente.relogio.avancar(5 * 60 + 1);
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
    fn dek_nao_aparece_no_estado_serializado() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        let estado = servico.configurar(SENHA).unwrap();
        let json = serde_json::to_string(&estado).unwrap();
        assert!(!json.contains("dek"));
        assert!(!json.contains("senha"));
    }
}
