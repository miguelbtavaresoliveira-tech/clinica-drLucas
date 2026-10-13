//! `ServicoDeAcessoLocal`: configurar, desbloquear com senha e bloquear (UL-01, UL-02, UL-04).
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration as DuracaoStd, Instant};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use rand::rngs::OsRng;
use zeroize::Zeroizing;

use super::armazenamento::{self, EstadoPersistido, Kdf, RegistroPendente};
use super::auditoria::{self, Detalhe, TIPOS_DE_AUDITORIA_DO_APP, ValorDeDetalhe};
use super::banco_local::{BancoLocal, NOME_DO_BANCO};
use super::biometria::{BiometriaIndisponivel, BiometriaLocal};
use super::cofre_so::{CHAVE_AUDITORIA, CHAVE_BIOMETRIA, CHAVE_REFRESH, CofreDeChavesDoSo};
use super::cripto::{self, Chave, ParametrosArgon2};
use super::erros::ErroDeAcesso;
use super::estado::{EstadoDoAcesso, MotivoDeBloqueio, Situacao, UsuarioResumo};
use super::modo_offline::{self, PoliticaLocal};
use super::relogio::Relogio;
use super::sessao_remota::{DadosDoLogin, ProximoPasso};

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
    biometria: Arc<dyn BiometriaLocal>,
    parametros_novos: ParametrosArgon2,
    dek: Option<Chave>,
    banco: Option<BancoLocal>,
    situacao_desbloqueada: Situacao,
    reautenticado_em: Option<DateTime<Utc>>,
    ultima_atividade: Instant,
    login_pendente: Option<DadosDoLogin>,
    checkin_pendente: Option<(PoliticaLocal, DateTime<Utc>)>,
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
            biometria: Arc::new(BiometriaIndisponivel),
            parametros_novos,
            dek: None,
            banco: None,
            situacao_desbloqueada: Situacao::Normal,
            reautenticado_em: None,
            ultima_atividade: Instant::now(),
            login_pendente: None,
            checkin_pendente: None,
            sessao_online: false,
            usuario: None,
        }
    }

    /// Troca a implementação de biometria (por padrão, indisponível: plano B do spike).
    pub fn com_biometria(mut self, biometria: Arc<dyn BiometriaLocal>) -> Self {
        self.biometria = biometria;
        self
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
            biometria_disponivel: self.biometria.disponivel(),
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
        self.aplicar_pendencias()?;
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

        self.concluir_desbloqueio(dek, persistido, agora, "senha")
    }

    /// Parte comum do desbloqueio (senha ou biometria): registra, abre o banco e aplica o que estava pendente.
    /// Só a senha zera o contador de falhas: a biometria não pode apagar o histórico de tentativas de senha.
    fn concluir_desbloqueio(
        &mut self,
        dek: Chave,
        mut persistido: EstadoPersistido,
        agora: DateTime<Utc>,
        metodo: &str,
    ) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        if metodo == "senha" {
            persistido.falhas_consecutivas = 0;
            persistido.ultima_falha_em = None;
        }
        persistido.auditoria_pendente.push(RegistroPendente {
            tipo: "desbloqueio-local-ok".to_owned(),
            ocorrido_em: agora,
            detalhe: [("metodo".to_owned(), serde_json::json!(metodo))].into(),
        });
        armazenamento::salvar(&self.diretorio, &persistido)?;

        let banco = BancoLocal::abrir(&self.diretorio, &dek)?;
        self.dek = Some(dek);
        self.banco = Some(banco);
        self.situacao_desbloqueada = Situacao::Normal;
        self.ultima_atividade = Instant::now();
        self.aplicar_pendencias()?;
        self.carregar_usuario();
        self.reavaliar_modo()?;
        // Melhor esforço: o que não for descarregado continua no arquivo e sai no próximo desbloqueio.
        let _ = self.descarregar_pendentes();
        self.estado()
    }

    /// UL-03: desbloqueio por biometria. Qualquer falha devolve `BiometriaIndisponivel` e a interface
    /// volta para a senha mestre, que sempre funciona (RN-25).
    pub fn desbloquear_com_biometria(&mut self) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        let persistido = armazenamento::ler(&self.diretorio)?;
        if persistido.kdf.is_none() {
            return Err(ErroDeAcesso::NaoConfigurado);
        }
        if persistido.revogado {
            return Err(ErroDeAcesso::DispositivoRevogado);
        }
        if persistido.exige_login_completo {
            return Err(ErroDeAcesso::ExigeLoginCompleto);
        }
        if self.esta_desbloqueado() {
            return Ok(self.montar_estado(&persistido));
        }
        let embrulhada = persistido
            .dek_por_biometria
            .clone()
            .ok_or(ErroDeAcesso::BiometriaIndisponivel)?;
        if !self.biometria.disponivel() {
            return Err(ErroDeAcesso::BiometriaIndisponivel);
        }
        let reconhecido = self
            .biometria
            .autenticar("Desbloquear a EVO Clínica")
            .map_err(|_| ErroDeAcesso::BiometriaIndisponivel)?;
        if !reconhecido {
            return Err(ErroDeAcesso::BiometriaIndisponivel);
        }
        let guardada = self
            .cofre
            .ler(CHAVE_BIOMETRIA)?
            .ok_or(ErroDeAcesso::BiometriaIndisponivel)?;
        let chave = Zeroizing::new(
            <[u8; 32]>::try_from(guardada.as_slice()).map_err(|_| ErroDeAcesso::Interno)?,
        );
        let dek =
            cripto::desembrulhar(&embrulhada, &chave).ok_or(ErroDeAcesso::BiometriaIndisponivel)?;
        let agora = self.relogio.agora();
        self.concluir_desbloqueio(dek, persistido, agora, "biometria")
    }

    /// UL-05: ativa a biometria. Exige a senha mestre.
    pub fn ativar_biometria(&mut self, senha: &str) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        if !self.esta_desbloqueado() {
            return Err(ErroDeAcesso::Bloqueado);
        }
        if !self.biometria.disponivel() {
            return Err(ErroDeAcesso::BiometriaIndisponivel);
        }
        self.reautenticar_com_senha(senha)?;
        let mut chave = Zeroizing::new([0u8; 32]);
        OsRng.fill_bytes(chave.as_mut());
        let dek = self.dek.as_ref().ok_or(ErroDeAcesso::Bloqueado)?;
        let embrulhada = cripto::embrulhar(dek, &chave)?;
        self.cofre.guardar(CHAVE_BIOMETRIA, chave.as_slice())?;
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        persistido.dek_por_biometria = Some(embrulhada);
        armazenamento::salvar(&self.diretorio, &persistido)?;
        self.auditar("biometria-ativada", Detalhe::new())?;
        self.estado()
    }

    pub fn desativar_biometria(&mut self) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        if !self.esta_desbloqueado() {
            return Err(ErroDeAcesso::Bloqueado);
        }
        self.cofre.remover(CHAVE_BIOMETRIA)?;
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        persistido.dek_por_biometria = None;
        armazenamento::salvar(&self.diretorio, &persistido)?;
        self.auditar("biometria-desativada", Detalhe::new())?;
        self.estado()
    }

    /// Quantos eventos locais ainda não enviados seriam descartados por uma redefinição.
    pub fn previa_redefinicao_local(&self) -> Result<u64, ErroDeAcesso> {
        Ok(armazenamento::ler(&self.diretorio)?.eventos_pendentes)
    }

    /// UL-10 (RN-35): esqueceu a senha mestre. Descarta o banco local, mantém o vínculo do computador
    /// com a conta. Só por ação explícita, com `DESCARTAR` digitado e login completo nesta execução.
    pub fn redefinir_desbloqueio_local(
        &mut self,
        confirmacao: &str,
    ) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        if confirmacao != "DESCARTAR" {
            return Err(ErroDeAcesso::ConfirmacaoInvalida);
        }
        let persistido = armazenamento::ler(&self.diretorio)?;
        if persistido.revogado {
            return Err(ErroDeAcesso::DispositivoRevogado);
        }
        if !self.sessao_online {
            return Err(ErroDeAcesso::ExigeLoginCompleto);
        }
        let agora = self.relogio.agora();
        // O login desta execução (ou o usuário já conhecido) é reaplicado quando a nova senha for definida.
        let dados = self.login_pendente.clone().or_else(|| {
            let usuario = self.usuario.clone()?;
            Some(DadosDoLogin {
                usuario,
                politica: self.politica(),
                dispositivo_id: persistido.dispositivo_id.clone()?,
                ocorrido_em: agora,
            })
        });

        self.apagar_banco()?;
        self.cofre.remover(CHAVE_BIOMETRIA)?;
        let novo = EstadoPersistido {
            dispositivo_id: persistido.dispositivo_id,
            max_falhas_desbloqueio_local: persistido.max_falhas_desbloqueio_local,
            auditoria_pendente: vec![RegistroPendente {
                tipo: "desbloqueio-local-redefinido".to_owned(),
                ocorrido_em: agora,
                detalhe: Default::default(),
            }],
            ..EstadoPersistido::default()
        };
        armazenamento::salvar(&self.diretorio, &novo)?;

        self.usuario = None;
        self.reautenticado_em = None;
        self.login_pendente = dados;
        self.checkin_pendente = None;
        self.situacao_desbloqueada = Situacao::Normal;
        self.estado()
    }

    /// Computador revogado pelo servidor: o usuário descarta tudo para poder entrar de novo como
    /// um computador novo (nova chave de auditoria, novo registro de dispositivo).
    pub fn redefinir_computador_revogado(
        &mut self,
        confirmacao: &str,
    ) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        if confirmacao != "DESCARTAR" {
            return Err(ErroDeAcesso::ConfirmacaoInvalida);
        }
        if !armazenamento::ler(&self.diretorio)?.revogado {
            return Err(ErroDeAcesso::ConfirmacaoInvalida);
        }
        self.apagar_banco()?;
        match fs::remove_file(self.diretorio.join(armazenamento::NOME_DO_ARQUIVO)) {
            Ok(()) => {}
            Err(erro) if erro.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(ErroDeAcesso::Interno),
        }
        for nome in [CHAVE_REFRESH, CHAVE_BIOMETRIA, CHAVE_AUDITORIA] {
            self.cofre.remover(nome)?;
        }
        self.usuario = None;
        self.sessao_online = false;
        self.reautenticado_em = None;
        self.login_pendente = None;
        self.checkin_pendente = None;
        self.situacao_desbloqueada = Situacao::Normal;
        self.estado()
    }

    /// Fecha o banco, zera a DEK da memória e apaga `dados.db`, `-wal` e `-shm`.
    fn apagar_banco(&mut self) -> Result<(), ErroDeAcesso> {
        if let Some(banco) = self.banco.take() {
            let _ = banco.fechar();
        }
        self.dek = None;
        for nome in [
            NOME_DO_BANCO.to_owned(),
            format!("{NOME_DO_BANCO}-wal"),
            format!("{NOME_DO_BANCO}-shm"),
        ] {
            match fs::remove_file(self.diretorio.join(nome)) {
                Ok(()) => {}
                Err(erro) if erro.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(ErroDeAcesso::Interno),
            }
        }
        Ok(())
    }

    pub fn dispositivo_id(&self) -> Result<Option<String>, ErroDeAcesso> {
        Ok(armazenamento::ler(&self.diretorio)?.dispositivo_id)
    }

    pub fn definir_sessao_online(&mut self, online: bool) {
        self.sessao_online = online;
    }

    /// Login completo concluído no servidor. Desbloqueado: grava já no banco. Bloqueado ou sem senha mestre:
    /// guarda em memória e grava quando `configurar` ou `desbloquear_com_senha` abrirem o banco.
    pub fn aplicar_login(&mut self, dados: DadosDoLogin) -> Result<ProximoPasso, ErroDeAcesso> {
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        persistido.dispositivo_id = Some(dados.dispositivo_id.clone());
        persistido.falhas_consecutivas = 0;
        persistido.ultima_falha_em = None;
        persistido.exige_login_completo = false;
        persistido.max_falhas_desbloqueio_local = dados.politica.max_falhas_desbloqueio_local;
        armazenamento::salvar(&self.diretorio, &persistido)?;
        self.sessao_online = true;

        let proximo_passo = if persistido.kdf.is_none() {
            ProximoPasso::ConfigurarDesbloqueio
        } else if !self.esta_desbloqueado() {
            ProximoPasso::Desbloquear
        } else {
            ProximoPasso::Pronto
        };
        if self.esta_desbloqueado() {
            self.gravar_login(&dados)?;
            self.reavaliar_modo()?;
            let _ = self.descarregar_pendentes();
        } else {
            self.login_pendente = Some(dados);
        }
        Ok(proximo_passo)
    }

    /// Renovação de sessão bem-sucedida: é o "check-in" que zera o prazo offline.
    pub fn registrar_checkin(
        &mut self,
        politica: PoliticaLocal,
        quando: DateTime<Utc>,
    ) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        if persistido.max_falhas_desbloqueio_local != politica.max_falhas_desbloqueio_local {
            persistido.max_falhas_desbloqueio_local = politica.max_falhas_desbloqueio_local;
            armazenamento::salvar(&self.diretorio, &persistido)?;
        }
        self.sessao_online = true;
        if self.esta_desbloqueado() {
            self.gravar_checkin(&politica, quando)?;
            self.reavaliar_modo()
        } else {
            self.checkin_pendente = Some((politica, quando));
            self.estado()
        }
    }

    /// UL-09: o servidor revogou este computador. Marca o arquivo, remove o refresh e bloqueia.
    /// Nenhum dado é apagado.
    pub fn processar_revogacao(&mut self) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        persistido.revogado = true;
        armazenamento::salvar(&self.diretorio, &persistido)?;
        self.cofre.remover(CHAVE_REFRESH)?;
        self.sessao_online = false;
        self.login_pendente = None;
        self.checkin_pendente = None;
        self.bloquear(MotivoDeBloqueio::Revogacao)
    }

    fn aplicar_pendencias(&mut self) -> Result<(), ErroDeAcesso> {
        if let Some(dados) = self.login_pendente.clone() {
            self.gravar_login(&dados)?;
            self.login_pendente = None;
        }
        if let Some((politica, quando)) = self.checkin_pendente.clone() {
            self.gravar_checkin(&politica, quando)?;
            self.checkin_pendente = None;
        }
        Ok(())
    }

    fn gravar_login(&mut self, dados: &DadosDoLogin) -> Result<(), ErroDeAcesso> {
        let usuario = serde_json::to_string(&dados.usuario).map_err(|_| ErroDeAcesso::Interno)?;
        self.banco()?.gravar_valor("usuario", &usuario)?;
        self.gravar_checkin(&dados.politica, dados.ocorrido_em)?;
        self.usuario = Some(dados.usuario.clone());
        Ok(())
    }

    fn gravar_checkin(
        &self,
        politica: &PoliticaLocal,
        quando: DateTime<Utc>,
    ) -> Result<(), ErroDeAcesso> {
        let banco = self.banco()?;
        let politica_json = serde_json::to_string(politica).map_err(|_| ErroDeAcesso::Interno)?;
        banco.gravar_valor(CHAVE_POLITICA, &politica_json)?;
        banco.gravar_valor(CHAVE_ULTIMO_CHECKIN, &quando.to_rfc3339())
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
    pub fn atualizar_eventos_pendentes(&self) -> Result<(), ErroDeAcesso> {
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

    /// UL-07: confirma a identidade com a senha mestre e abre a janela de reautenticação (RN-29).
    /// Usa a mesma proteção contra força bruta do desbloqueio.
    pub fn reautenticar_com_senha(&mut self, senha: &str) -> Result<(), ErroDeAcesso> {
        if !self.esta_desbloqueado() {
            return Err(ErroDeAcesso::Bloqueado);
        }
        let mut persistido = armazenamento::ler(&self.diretorio)?;
        let Some(kdf) = persistido.kdf.clone() else {
            return Err(ErroDeAcesso::NaoConfigurado);
        };
        if persistido.exige_login_completo {
            return Err(ErroDeAcesso::ExigeLoginCompleto);
        }
        let agora = self.relogio.agora();
        let restantes = armazenamento::segundos_restantes(&persistido, agora);
        if restantes > 0 {
            return Err(ErroDeAcesso::AguardeAntesDeTentar {
                segundos_restantes: restantes,
            });
        }

        // Pré-incrementa e grava antes de derivar, como no desbloqueio.
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
        let confere = match (cripto::desembrulhar(&embrulhada, &kek), self.dek.as_ref()) {
            (Some(candidata), Some(em_memoria)) => {
                iguais_em_tempo_constante(&candidata, em_memoria)
            }
            _ => false,
        };

        if !confere {
            if persistido.falhas_consecutivas >= persistido.max_falhas_desbloqueio_local {
                persistido.exige_login_completo = true;
                armazenamento::salvar(&self.diretorio, &persistido)?;
                self.bloquear(MotivoDeBloqueio::Manual)?;
                return Err(ErroDeAcesso::ExigeLoginCompleto);
            }
            return Err(ErroDeAcesso::SenhaMestreIncorreta);
        }

        persistido.falhas_consecutivas = 0;
        persistido.ultima_falha_em = None;
        armazenamento::salvar(&self.diretorio, &persistido)?;
        self.reautenticado_em = Some(agora);
        self.auditar(
            "reautenticacao-sensivel",
            [(
                "metodo".to_owned(),
                ValorDeDetalhe::Texto("senha".to_owned()),
            )]
            .into(),
        )
    }

    /// Troca a senha mestre: só o embrulho da DEK muda; o banco não é recifrado (DT-07).
    pub fn alterar_senha_mestre(&mut self, atual: &str, nova: &str) -> Result<(), ErroDeAcesso> {
        self.reautenticar_com_senha(atual)?;
        let tamanho = nova.chars().count();
        if !(MIN_CARACTERES_SENHA..=MAX_CARACTERES_SENHA).contains(&tamanho) || nova == atual {
            return Err(ErroDeAcesso::SenhaMestreFraca);
        }
        let dek = self.dek.as_ref().ok_or(ErroDeAcesso::Bloqueado)?;
        let salt = cripto::gerar_salt();
        let kek = cripto::derivar_kek(nova, &salt, self.parametros_novos)?;
        let embrulhada = cripto::embrulhar(dek, &kek)?;

        let mut persistido = armazenamento::ler(&self.diretorio)?;
        persistido.kdf = Some(Kdf {
            algoritmo: "argon2id".to_owned(),
            parametros: self.parametros_novos,
            salt_b64: STANDARD.encode(salt),
        });
        persistido.dek_por_senha = Some(embrulhada);
        armazenamento::salvar(&self.diretorio, &persistido)?;
        self.auditar("senha-mestre-alterada", Detalhe::new())
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

/// Compara sem interromper no primeiro byte diferente.
fn iguais_em_tempo_constante(a: &[u8; 32], b: &[u8; 32]) -> bool {
    let mut diferenca = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diferenca |= x ^ y;
    }
    diferenca == 0
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

    fn dados_do_login(ambiente: &Ambiente) -> DadosDoLogin {
        DadosDoLogin {
            usuario: UsuarioResumo {
                id: "11111111-1111-4111-8111-111111111111".to_owned(),
                nome: "Lucas".to_owned(),
                email: "lucas@clinica.com".to_owned(),
            },
            politica: PoliticaLocal {
                max_falhas_desbloqueio_local: 7,
                ..PoliticaLocal::default()
            },
            dispositivo_id: "22222222-2222-4222-8222-222222222222".to_owned(),
            ocorrido_em: ambiente.relogio.agora(),
        }
    }

    #[test]
    fn login_antes_da_senha_mestre_e_aplicado_ao_configurar() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        let passo = servico.aplicar_login(dados_do_login(&ambiente)).unwrap();
        assert_eq!(passo, ProximoPasso::ConfigurarDesbloqueio);
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(
            disco.dispositivo_id.as_deref(),
            Some("22222222-2222-4222-8222-222222222222")
        );
        assert_eq!(disco.max_falhas_desbloqueio_local, 7);
        assert!(servico.estado().unwrap().sessao_online);

        let estado = servico.configurar(SENHA).unwrap();
        assert_eq!(estado.usuario.unwrap().nome, "Lucas");
        assert!(
            servico
                .banco()
                .unwrap()
                .ler_valor("usuario")
                .unwrap()
                .is_some()
        );
        assert!(
            servico
                .banco()
                .unwrap()
                .ler_valor("politica")
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn login_com_o_app_desbloqueado_grava_direto_e_libera() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        let passo = servico.aplicar_login(dados_do_login(&ambiente)).unwrap();
        assert_eq!(passo, ProximoPasso::Pronto);
        assert_eq!(servico.estado().unwrap().usuario.unwrap().nome, "Lucas");
        assert_eq!(servico.politica().max_falhas_desbloqueio_local, 7);
    }

    #[test]
    fn login_com_o_app_bloqueado_pede_desbloqueio_e_zera_o_contador() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        ambiente.errar(&mut servico);
        assert_eq!(
            servico.aplicar_login(dados_do_login(&ambiente)).unwrap(),
            ProximoPasso::Desbloquear
        );
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(disco.falhas_consecutivas, 0);
        assert!(!disco.exige_login_completo);
        servico.desbloquear_com_senha(SENHA).unwrap();
        assert_eq!(servico.estado().unwrap().usuario.unwrap().nome, "Lucas");
    }

    #[test]
    fn checkin_com_o_app_bloqueado_vale_no_proximo_desbloqueio() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        ambiente.relogio.avancar(Duration::days(7));
        servico
            .registrar_checkin(PoliticaLocal::default(), ambiente.relogio.agora())
            .unwrap();
        let estado = servico.desbloquear_com_senha(SENHA).unwrap();
        assert_eq!(estado.situacao, Situacao::Normal);
    }

    #[test]
    fn sem_checkin_a_mesma_espera_deixa_somente_leitura() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        ambiente.relogio.avancar(Duration::days(7));
        let estado = servico.desbloquear_com_senha(SENHA).unwrap();
        assert_eq!(estado.situacao, Situacao::SomenteLeitura);
    }

    #[test]
    fn revogacao_marca_o_arquivo_remove_o_refresh_e_preserva_os_dados() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        ambiente
            .cofre
            .guardar(CHAVE_REFRESH, b"refresh-secreto")
            .unwrap();
        let estado = servico.processar_revogacao().unwrap();
        assert_eq!(estado.situacao, Situacao::Revogado);
        assert!(ambiente.cofre.ler(CHAVE_REFRESH).unwrap().is_none());
        assert!(ambiente.pasta.path().join(NOME_DO_BANCO).exists());
        assert!(!servico.esta_desbloqueado());
    }

    #[test]
    fn reautenticar_certo_abre_a_janela_e_ela_fecha_depois_de_cinco_minutos() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.reautenticar_com_senha(SENHA).unwrap();
        assert!(servico.garantir_reautenticacao_recente(5).is_ok());
        ambiente.relogio.avancar(Duration::seconds(5 * 60 + 1));
        assert!(matches!(
            servico.garantir_reautenticacao_recente(5),
            Err(ErroDeAcesso::ReautenticacaoNecessaria)
        ));
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert!(
            disco
                .auditoria_pendente
                .iter()
                .any(|r| r.tipo == "reautenticacao-sensivel")
        );
    }

    #[test]
    fn reautenticar_errado_incrementa_o_contador_persistido() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        assert!(matches!(
            servico.reautenticar_com_senha("senha-errada-123"),
            Err(ErroDeAcesso::SenhaMestreIncorreta)
        ));
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(disco.falhas_consecutivas, 1);
        assert!(matches!(
            servico.garantir_reautenticacao_recente(5),
            Err(ErroDeAcesso::ReautenticacaoNecessaria)
        ));
        servico.reautenticar_com_senha(SENHA).unwrap();
        assert_eq!(
            armazenamento::ler(ambiente.pasta.path())
                .unwrap()
                .falhas_consecutivas,
            0
        );
    }

    #[test]
    fn reautenticar_bloqueado_devolve_bloqueado() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        assert!(matches!(
            servico.reautenticar_com_senha(SENHA),
            Err(ErroDeAcesso::Bloqueado)
        ));
    }

    #[test]
    fn reautenticar_respeita_o_atraso_progressivo() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        for _ in 0..3 {
            let _ = servico.reautenticar_com_senha("senha-errada-123");
        }
        assert!(matches!(
            servico.reautenticar_com_senha(SENHA),
            Err(ErroDeAcesso::AguardeAntesDeTentar {
                segundos_restantes: 5
            })
        ));
    }

    #[test]
    fn dez_falhas_na_reautenticacao_bloqueiam_e_exigem_login_completo() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        for _ in 0..9 {
            assert!(matches!(
                servico.reautenticar_com_senha("senha-errada-123"),
                Err(ErroDeAcesso::SenhaMestreIncorreta)
            ));
            ambiente.relogio.avancar(Duration::seconds(700));
        }
        assert!(matches!(
            servico.reautenticar_com_senha("senha-errada-123"),
            Err(ErroDeAcesso::ExigeLoginCompleto)
        ));
        assert!(!servico.esta_desbloqueado());
        assert!(servico.estado().unwrap().exige_login_completo);
        assert!(ambiente.pasta.path().join(NOME_DO_BANCO).exists());
    }

    #[test]
    fn trocar_a_senha_mestre_nao_recifra_o_banco() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico
            .banco()
            .unwrap()
            .gravar_valor("marcador", "ainda-aqui")
            .unwrap();
        let nova = "outra-senha-mestre-forte";

        servico.alterar_senha_mestre(SENHA, nova).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        assert!(matches!(
            servico.desbloquear_com_senha(SENHA),
            Err(ErroDeAcesso::SenhaMestreIncorreta)
        ));
        ambiente.relogio.avancar(Duration::seconds(700));
        servico.desbloquear_com_senha(nova).unwrap();
        assert_eq!(
            servico
                .banco()
                .unwrap()
                .ler_valor("marcador")
                .unwrap()
                .as_deref(),
            Some("ainda-aqui")
        );
        let versao: i64 = servico
            .banco()
            .unwrap()
            .conexao()
            .query_row("PRAGMA user_version", [], |l| l.get(0))
            .unwrap();
        assert_eq!(versao, 1);
        let tipos: Vec<String> = armazenamento::ler(ambiente.pasta.path())
            .unwrap()
            .auditoria_pendente
            .into_iter()
            .map(|r| r.tipo)
            .collect();
        assert!(tipos.contains(&"senha-mestre-alterada".to_owned()));
    }

    #[test]
    fn trocar_a_senha_gera_novo_salt_e_novo_embrulho() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        let antes = armazenamento::ler(ambiente.pasta.path()).unwrap();
        servico
            .alterar_senha_mestre(SENHA, "outra-senha-mestre-forte")
            .unwrap();
        let depois = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_ne!(antes.kdf.unwrap().salt_b64, depois.kdf.unwrap().salt_b64);
        assert_ne!(antes.dek_por_senha, depois.dek_por_senha);
    }

    #[test]
    fn nova_senha_igual_a_atual_ou_curta_demais_e_recusada() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        assert!(matches!(
            servico.alterar_senha_mestre(SENHA, SENHA),
            Err(ErroDeAcesso::SenhaMestreFraca)
        ));
        assert!(matches!(
            servico.alterar_senha_mestre(SENHA, "curta"),
            Err(ErroDeAcesso::SenhaMestreFraca)
        ));
        // A senha antiga continua valendo.
        ambiente.relogio.avancar(Duration::seconds(700));
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        assert!(servico.desbloquear_com_senha(SENHA).is_ok());
    }

    #[test]
    fn trocar_com_a_senha_atual_errada_falha_sem_alterar_nada() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        let antes = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert!(matches!(
            servico.alterar_senha_mestre("senha-errada-123", "outra-senha-mestre-forte"),
            Err(ErroDeAcesso::SenhaMestreIncorreta)
        ));
        let depois = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(antes.kdf, depois.kdf);
        assert_eq!(antes.dek_por_senha, depois.dek_por_senha);
    }

    #[test]
    fn comparacao_em_tempo_constante() {
        assert!(iguais_em_tempo_constante(&[7u8; 32], &[7u8; 32]));
        let mut outra = [7u8; 32];
        outra[31] = 8;
        assert!(!iguais_em_tempo_constante(&[7u8; 32], &outra));
        outra[31] = 7;
        outra[0] = 0;
        assert!(!iguais_em_tempo_constante(&[7u8; 32], &outra));
    }

    use crate::acesso_local::biometria::BiometriaFalsa;

    fn servico_com_biometria(
        ambiente: &Ambiente,
        biometria: Arc<BiometriaFalsa>,
    ) -> ServicoDeAcessoLocal {
        ambiente.servico().com_biometria(biometria)
    }

    #[test]
    fn sem_biometria_ativar_e_desbloquear_devolvem_indisponivel() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        assert!(!servico.estado().unwrap().biometria_disponivel);
        assert!(matches!(
            servico.ativar_biometria(SENHA),
            Err(ErroDeAcesso::BiometriaIndisponivel)
        ));
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        assert!(matches!(
            servico.desbloquear_com_biometria(),
            Err(ErroDeAcesso::BiometriaIndisponivel)
        ));
    }

    #[test]
    fn ativar_exige_a_senha_certa_e_depois_a_biometria_abre_o_mesmo_banco() {
        let ambiente = Ambiente::novo();
        let biometria = Arc::new(BiometriaFalsa::nova(true, true));
        let mut servico = servico_com_biometria(&ambiente, biometria);
        servico.configurar(SENHA).unwrap();
        servico
            .banco()
            .unwrap()
            .gravar_valor("marcador", "ainda-aqui")
            .unwrap();

        assert!(matches!(
            servico.ativar_biometria("senha-errada-123"),
            Err(ErroDeAcesso::SenhaMestreIncorreta)
        ));
        assert!(!servico.estado().unwrap().biometria_habilitada);

        ambiente.relogio.avancar(Duration::seconds(700));
        let estado = servico.ativar_biometria(SENHA).unwrap();
        assert!(estado.biometria_habilitada && estado.biometria_disponivel);
        assert!(ambiente.cofre.ler(CHAVE_BIOMETRIA).unwrap().is_some());

        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        let aberto = servico.desbloquear_com_biometria().unwrap();
        assert_eq!(aberto.situacao, Situacao::Normal);
        assert_eq!(
            servico
                .banco()
                .unwrap()
                .ler_valor("marcador")
                .unwrap()
                .as_deref(),
            Some("ainda-aqui")
        );
        let tipos: Vec<(String, Option<String>)> = armazenamento::ler(ambiente.pasta.path())
            .unwrap()
            .auditoria_pendente
            .into_iter()
            .map(|r| {
                (
                    r.tipo,
                    r.detalhe
                        .get("metodo")
                        .and_then(|v| v.as_str())
                        .map(str::to_owned),
                )
            })
            .collect();
        assert!(tipos.contains(&("biometria-ativada".to_owned(), None)));
        assert!(tipos.contains(&(
            "desbloqueio-local-ok".to_owned(),
            Some("biometria".to_owned())
        )));
    }

    #[test]
    fn biometria_cancelada_falha_e_a_senha_mestre_continua_funcionando() {
        let ambiente = Ambiente::novo();
        let biometria = Arc::new(BiometriaFalsa::nova(true, true));
        let mut servico = servico_com_biometria(&ambiente, biometria.clone());
        servico.configurar(SENHA).unwrap();
        servico.ativar_biometria(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();

        biometria.definir_aprovacao(false);
        assert!(matches!(
            servico.desbloquear_com_biometria(),
            Err(ErroDeAcesso::BiometriaIndisponivel)
        ));
        assert!(!servico.esta_desbloqueado());
        assert_eq!(
            servico.desbloquear_com_senha(SENHA).unwrap().situacao,
            Situacao::Normal
        );
    }

    #[test]
    fn biometria_nao_zera_o_contador_de_falhas_de_senha() {
        let ambiente = Ambiente::novo();
        let biometria = Arc::new(BiometriaFalsa::nova(true, true));
        let mut servico = servico_com_biometria(&ambiente, biometria);
        servico.configurar(SENHA).unwrap();
        servico.ativar_biometria(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        ambiente.errar(&mut servico);
        servico.desbloquear_com_biometria().unwrap();
        assert_eq!(
            armazenamento::ler(ambiente.pasta.path())
                .unwrap()
                .falhas_consecutivas,
            1
        );
    }

    #[test]
    fn desativar_remove_a_chave_e_o_embrulho() {
        let ambiente = Ambiente::novo();
        let biometria = Arc::new(BiometriaFalsa::nova(true, true));
        let mut servico = servico_com_biometria(&ambiente, biometria);
        servico.configurar(SENHA).unwrap();
        servico.ativar_biometria(SENHA).unwrap();
        let estado = servico.desativar_biometria().unwrap();
        assert!(!estado.biometria_habilitada);
        assert!(ambiente.cofre.ler(CHAVE_BIOMETRIA).unwrap().is_none());
        assert!(
            armazenamento::ler(ambiente.pasta.path())
                .unwrap()
                .dek_por_biometria
                .is_none()
        );
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        assert!(matches!(
            servico.desbloquear_com_biometria(),
            Err(ErroDeAcesso::BiometriaIndisponivel)
        ));
    }

    #[test]
    fn redefinir_desbloqueio_local_exige_a_confirmacao_e_nao_apaga_nada_sem_ela() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.aplicar_login(dados_do_login(&ambiente)).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        for errada in ["descartar", "", "SIM"] {
            assert!(matches!(
                servico.redefinir_desbloqueio_local(errada),
                Err(ErroDeAcesso::ConfirmacaoInvalida)
            ));
        }
        assert!(ambiente.pasta.path().join(NOME_DO_BANCO).exists());
        assert!(
            armazenamento::ler(ambiente.pasta.path())
                .unwrap()
                .kdf
                .is_some()
        );
    }

    #[test]
    fn redefinir_desbloqueio_local_sem_sessao_online_exige_login_completo() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        assert!(matches!(
            servico.redefinir_desbloqueio_local("DESCARTAR"),
            Err(ErroDeAcesso::ExigeLoginCompleto)
        ));
        assert!(ambiente.pasta.path().join(NOME_DO_BANCO).exists());
    }

    #[test]
    fn redefinir_desbloqueio_local_apaga_o_banco_mantem_o_dispositivo_e_permite_nova_senha() {
        let ambiente = Ambiente::novo();
        let biometria = Arc::new(BiometriaFalsa::nova(true, true));
        let mut servico = servico_com_biometria(&ambiente, biometria);
        servico.configurar(SENHA).unwrap();
        servico.aplicar_login(dados_do_login(&ambiente)).unwrap();
        servico.ativar_biometria(SENHA).unwrap();
        servico.bloquear(MotivoDeBloqueio::Manual).unwrap();
        ambiente
            .cofre
            .guardar(CHAVE_REFRESH, b"refresh-fica")
            .unwrap();
        ambiente.cofre.guardar(CHAVE_AUDITORIA, &[3u8; 32]).unwrap();

        let estado = servico.redefinir_desbloqueio_local("DESCARTAR").unwrap();

        assert_eq!(estado.situacao, Situacao::SemConfiguracao);
        assert!(!ambiente.pasta.path().join(NOME_DO_BANCO).exists());
        let disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(
            disco.dispositivo_id.as_deref(),
            Some("22222222-2222-4222-8222-222222222222")
        );
        assert_eq!(disco.max_falhas_desbloqueio_local, 7);
        assert!(
            disco.kdf.is_none()
                && disco.dek_por_senha.is_none()
                && disco.dek_por_biometria.is_none()
        );
        assert!(
            disco
                .auditoria_pendente
                .iter()
                .any(|r| r.tipo == "desbloqueio-local-redefinido")
        );
        assert!(ambiente.cofre.ler(CHAVE_BIOMETRIA).unwrap().is_none());
        assert!(ambiente.cofre.ler(CHAVE_REFRESH).unwrap().is_some());
        assert!(ambiente.cofre.ler(CHAVE_AUDITORIA).unwrap().is_some());

        // Define uma nova senha: o usuário volta e o registro da redefinição vai para a auditoria.
        let novo = servico.configurar("nova-senha-mestre-forte").unwrap();
        assert_eq!(novo.situacao, Situacao::Normal);
        assert_eq!(novo.usuario.unwrap().nome, "Lucas");
        let gravados = auditoria::pendentes(servico.banco().unwrap(), 100).unwrap();
        assert!(
            gravados
                .iter()
                .any(|r| r.tipo == "desbloqueio-local-redefinido")
        );
    }

    #[test]
    fn redefinir_computador_revogado_apaga_tudo_inclusive_as_chaves() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        servico.aplicar_login(dados_do_login(&ambiente)).unwrap();
        ambiente.cofre.guardar(CHAVE_REFRESH, b"r").unwrap();
        ambiente.cofre.guardar(CHAVE_BIOMETRIA, b"b").unwrap();
        ambiente.cofre.guardar(CHAVE_AUDITORIA, &[3u8; 32]).unwrap();
        servico.processar_revogacao().unwrap();

        assert!(matches!(
            servico.redefinir_computador_revogado("descartar"),
            Err(ErroDeAcesso::ConfirmacaoInvalida)
        ));
        assert!(ambiente.pasta.path().join(NOME_DO_BANCO).exists());

        let estado = servico.redefinir_computador_revogado("DESCARTAR").unwrap();
        assert_eq!(estado.situacao, Situacao::SemConfiguracao);
        assert!(!estado.sessao_online);
        assert!(!ambiente.pasta.path().join(NOME_DO_BANCO).exists());
        assert!(
            !ambiente
                .pasta
                .path()
                .join(armazenamento::NOME_DO_ARQUIVO)
                .exists()
        );
        for nome in [CHAVE_REFRESH, CHAVE_BIOMETRIA, CHAVE_AUDITORIA] {
            assert!(
                ambiente.cofre.ler(nome).unwrap().is_none(),
                "{nome} deveria ter sido removida"
            );
        }
    }

    #[test]
    fn redefinir_computador_nao_revogado_e_recusado() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        assert!(matches!(
            servico.redefinir_computador_revogado("DESCARTAR"),
            Err(ErroDeAcesso::ConfirmacaoInvalida)
        ));
        assert!(ambiente.pasta.path().join(NOME_DO_BANCO).exists());
    }

    #[test]
    fn previa_da_redefinicao_informa_os_eventos_pendentes() {
        let ambiente = Ambiente::novo();
        let mut servico = ambiente.servico();
        servico.configurar(SENHA).unwrap();
        let mut disco = armazenamento::ler(ambiente.pasta.path()).unwrap();
        disco.eventos_pendentes = 4;
        armazenamento::salvar(ambiente.pasta.path(), &disco).unwrap();
        assert_eq!(servico.previa_redefinicao_local().unwrap(), 4);
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
