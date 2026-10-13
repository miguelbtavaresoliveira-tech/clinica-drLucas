//! Sessão com a API feita pelo Rust (D-005, DT-05, UL-09, RN-20): o refresh token fica no cofre do SO,
//! o access token só em memória, e nenhum token chega ao JavaScript.
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use chrono::{DateTime, Duration as DuracaoChrono, Utc};
use regex::Regex;
use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use url::Url;
use zeroize::Zeroizing;

use super::auditoria;
use super::cofre_so::{CHAVE_REFRESH, CofreDeChavesDoSo};
use super::erros::ErroDeAcesso;
use super::estado::{EstadoDoAcesso, UsuarioResumo};
use super::modo_offline::PoliticaLocal;
use super::relogio::Relogio;
use super::servico::ServicoDeAcessoLocal;

const MARGEM_DO_ACCESS: i64 = 10;
const MENSAGEM_GENERICA: &str = "Não foi possível concluir.";

pub struct ConfiguracaoDaApi {
    pub base: Url,
}

impl ConfiguracaoDaApi {
    /// `EVO_API_URL` é definida no build. Sem ela: `http://localhost:3000` em debug; erro em release.
    pub fn do_ambiente() -> Result<Self, ErroDeAcesso> {
        Self::validar(option_env!("EVO_API_URL"), !cfg!(debug_assertions))
    }

    pub fn validar(valor: Option<&str>, release: bool) -> Result<Self, ErroDeAcesso> {
        let texto = match valor {
            Some(texto) => texto,
            None if !release => "http://localhost:3000",
            None => return Err(ErroDeAcesso::Interno),
        };
        let base = Url::parse(texto).map_err(|_| ErroDeAcesso::Interno)?;
        let esquema_valido = if release {
            base.scheme() == "https"
        } else {
            matches!(base.scheme(), "http" | "https")
        };
        if !esquema_valido {
            return Err(ErroDeAcesso::Interno);
        }
        Ok(Self { base })
    }

    fn url(&self, caminho: &str) -> Result<Url, ErroDeAcesso> {
        let base = self.base.as_str().trim_end_matches('/');
        Url::parse(&format!("{base}{caminho}")).map_err(|_| ErroDeAcesso::Interno)
    }
}

#[derive(Clone)]
pub struct DadosDoLogin {
    pub usuario: UsuarioResumo,
    pub politica: PoliticaLocal,
    pub dispositivo_id: String,
    pub ocorrido_em: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProximoPasso {
    ConfigurarDesbloqueio,
    Desbloquear,
    Pronto,
}

/// O que o frontend recebe do login: nenhum token.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumoDoLogin {
    pub usuario: UsuarioResumo,
    pub usou_codigo_de_recuperacao: bool,
    pub codigos_restantes: u32,
    pub proximo_passo: ProximoPasso,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RespostaDeLogin {
    access_token: String,
    access_expira_em: DateTime<Utc>,
    refresh_token: String,
    dispositivo_id: String,
    politica: PoliticaLocal,
    usuario: UsuarioResumo,
    usou_codigo_de_recuperacao: bool,
    codigos_restantes: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RespostaDeRenovacao {
    access_token: String,
    access_expira_em: DateTime<Utc>,
    refresh_token: String,
    politica: PoliticaLocal,
}

#[derive(Deserialize)]
struct EnvelopeDeErro {
    erro: CorpoDoErro,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorpoDoErro {
    codigo: String,
    mensagem: String,
    tentar_apos: Option<String>,
}

struct Regra {
    metodo: &'static str,
    padrao: Regex,
    exige_reautenticacao: bool,
}

/// Lista permitida (regex ancorada): qualquer outro caminho é recusado.
fn regras() -> &'static [Regra] {
    static REGRAS: OnceLock<Vec<Regra>> = OnceLock::new();
    REGRAS.get_or_init(|| {
        let tabela: [(&str, &str, bool); 7] = [
            ("GET", r"^/dispositivos$", false),
            ("POST", r"^/dispositivos/[0-9a-f-]{36}/revogar$", true),
            ("POST", r"^/auth/senha/trocar$", true),
            ("POST", r"^/auth/mfa/codigos$", true),
            ("POST", r"^/auth/mfa/reconfigurar$", true),
            ("POST", r"^/auth/mfa/reconfigurar/confirmar$", true),
            ("POST", r"^/usuarios/[0-9a-f-]{36}/desativar$", true),
        ];
        tabela
            .iter()
            .filter_map(|(metodo, padrao, exige)| {
                Regex::new(padrao).ok().map(|padrao| Regra {
                    metodo,
                    padrao,
                    exige_reautenticacao: *exige,
                })
            })
            .collect()
    })
}

fn regra_para(metodo: &str, caminho: &str) -> Option<&'static Regra> {
    regras()
        .iter()
        .find(|regra| regra.metodo == metodo && regra.padrao.is_match(caminho))
}

fn com_servico<T>(
    acesso: &Mutex<ServicoDeAcessoLocal>,
    trabalho: impl FnOnce(&mut ServicoDeAcessoLocal) -> Result<T, ErroDeAcesso>,
) -> Result<T, ErroDeAcesso> {
    let mut servico = acesso.lock().map_err(|_| ErroDeAcesso::Interno)?;
    trabalho(&mut servico)
}

fn erro_de_resposta(status: StatusCode, corpo: &[u8]) -> ErroDeAcesso {
    match serde_json::from_slice::<EnvelopeDeErro>(corpo) {
        Ok(envelope) => ErroDeAcesso::Api {
            status: status.as_u16(),
            codigo: envelope.erro.codigo,
            mensagem: envelope.erro.mensagem,
            tentar_apos: envelope.erro.tentar_apos,
        },
        Err(_) => ErroDeAcesso::Api {
            status: status.as_u16(),
            codigo: "ERRO_HTTP".to_owned(),
            mensagem: MENSAGEM_GENERICA.to_owned(),
            tentar_apos: None,
        },
    }
}

fn corpo_como_json(status: StatusCode, corpo: &[u8]) -> Result<Value, ErroDeAcesso> {
    if !status.is_success() {
        return Err(erro_de_resposta(status, corpo));
    }
    if status == StatusCode::NO_CONTENT || corpo.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(corpo).map_err(|_| ErroDeAcesso::Api {
        status: status.as_u16(),
        codigo: "ERRO_HTTP".to_owned(),
        mensagem: MENSAGEM_GENERICA.to_owned(),
        tentar_apos: None,
    })
}

fn apelido_do_computador() -> String {
    let nome = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_default();
    let nome: String = nome.trim().chars().take(60).collect();
    if nome.is_empty() {
        "Computador EVO".to_owned()
    } else {
        nome
    }
}

fn plataforma() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else {
        "windows"
    }
}

pub struct SessaoRemota {
    cliente: reqwest::Client,
    api: ConfiguracaoDaApi,
    cofre: Arc<dyn CofreDeChavesDoSo>,
    relogio: Arc<dyn Relogio>,
    access: Option<Zeroizing<String>>,
    access_expira_em: Option<DateTime<Utc>>,
}

impl SessaoRemota {
    pub fn novo(
        api: ConfiguracaoDaApi,
        cofre: Arc<dyn CofreDeChavesDoSo>,
        relogio: Arc<dyn Relogio>,
    ) -> Result<Self, ErroDeAcesso> {
        let cliente = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .https_only(!cfg!(debug_assertions))
            .user_agent(format!("EVO-Clinica-Desktop/{}", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| ErroDeAcesso::Interno)?;
        Ok(Self {
            cliente,
            api,
            cofre,
            relogio,
            access: None,
            access_expira_em: None,
        })
    }

    async fn chamar(
        &self,
        metodo: Method,
        caminho: &str,
        corpo: Option<&Value>,
        com_bearer: bool,
    ) -> Result<(StatusCode, Vec<u8>), ErroDeAcesso> {
        let mut requisicao = self.cliente.request(metodo, self.api.url(caminho)?);
        if com_bearer {
            let access = self.access.as_ref().ok_or(ErroDeAcesso::SessaoExpirada)?;
            requisicao = requisicao.bearer_auth(access.as_str());
        }
        if let Some(corpo) = corpo {
            requisicao = requisicao.json(corpo);
        }
        let resposta = requisicao
            .send()
            .await
            .map_err(|_| ErroDeAcesso::SemConexao)?;
        let status = resposta.status();
        let bytes = resposta
            .bytes()
            .await
            .map_err(|_| ErroDeAcesso::SemConexao)?;
        Ok((status, bytes.to_vec()))
    }

    async fn publica(&self, caminho: &str, corpo: &Value) -> Result<Value, ErroDeAcesso> {
        let (status, bytes) = self
            .chamar(Method::POST, caminho, Some(corpo), false)
            .await?;
        corpo_como_json(status, &bytes)
    }

    pub async fn iniciar_login(&self, email: &str, senha: &str) -> Result<Value, ErroDeAcesso> {
        self.publica("/auth/login", &json!({ "email": email, "senha": senha }))
            .await
    }

    pub async fn gerar_segredo_mfa(&self, desafio: &str) -> Result<Value, ErroDeAcesso> {
        self.publica("/auth/mfa/segredo", &json!({ "desafio": desafio }))
            .await
    }

    pub async fn confirmar_mfa(&self, desafio: &str, codigo: &str) -> Result<Value, ErroDeAcesso> {
        self.publica(
            "/auth/mfa/confirmar",
            &json!({ "desafio": desafio, "codigo": codigo }),
        )
        .await
    }

    pub async fn solicitar_redefinicao(&self, email: &str) -> Result<(), ErroDeAcesso> {
        self.publica("/auth/senha/esqueci", &json!({ "email": email }))
            .await
            .map(|_| ())
    }

    pub async fn concluir_redefinicao(
        &self,
        token: &str,
        nova_senha: &str,
        codigo: &Value,
    ) -> Result<(), ErroDeAcesso> {
        self.publica(
            "/auth/senha/redefinir",
            &json!({ "token": token, "novaSenha": nova_senha, "codigo": codigo }),
        )
        .await
        .map(|_| ())
    }

    pub async fn concluir_login(
        &mut self,
        acesso: &Mutex<ServicoDeAcessoLocal>,
        desafio: &str,
        codigo: &Value,
    ) -> Result<ResumoDoLogin, ErroDeAcesso> {
        let chave_publica = auditoria::chave_publica_b64(self.cofre.as_ref())?;
        let dispositivo_id = com_servico(acesso, |servico| servico.dispositivo_id())?;
        let corpo = json!({
            "desafio": desafio,
            "codigo": codigo,
            "dispositivo": {
                "id": dispositivo_id,
                "apelido": apelido_do_computador(),
                "plataforma": plataforma(),
                "chavePublicaAuditoria": chave_publica,
            },
        });
        let (status, bytes) = self
            .chamar(Method::POST, "/auth/login/concluir", Some(&corpo), false)
            .await?;
        if !status.is_success() {
            return Err(erro_de_resposta(status, &bytes));
        }
        let resposta: RespostaDeLogin =
            serde_json::from_slice(&bytes).map_err(|_| ErroDeAcesso::Interno)?;

        self.cofre
            .guardar(CHAVE_REFRESH, resposta.refresh_token.as_bytes())?;
        self.access = Some(Zeroizing::new(resposta.access_token));
        self.access_expira_em = Some(resposta.access_expira_em);

        let dados = DadosDoLogin {
            usuario: resposta.usuario.clone(),
            politica: resposta.politica,
            dispositivo_id: resposta.dispositivo_id,
            ocorrido_em: self.relogio.agora(),
        };
        let proximo_passo = com_servico(acesso, |servico| servico.aplicar_login(dados))?;
        Ok(ResumoDoLogin {
            usuario: resposta.usuario,
            usou_codigo_de_recuperacao: resposta.usou_codigo_de_recuperacao,
            codigos_restantes: resposta.codigos_restantes,
            proximo_passo,
        })
    }

    pub async fn renovar(
        &mut self,
        acesso: &Mutex<ServicoDeAcessoLocal>,
    ) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        self.renovar_interno(acesso).await
    }

    async fn renovar_interno(
        &mut self,
        acesso: &Mutex<ServicoDeAcessoLocal>,
    ) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        let refresh = self
            .cofre
            .ler(CHAVE_REFRESH)?
            .ok_or(ErroDeAcesso::SessaoExpirada)?;
        let refresh =
            Zeroizing::new(String::from_utf8(refresh.to_vec()).map_err(|_| ErroDeAcesso::Interno)?);
        let dispositivo = com_servico(acesso, |servico| servico.dispositivo_id())?
            .ok_or(ErroDeAcesso::SessaoExpirada)?;
        let corpo = json!({ "refreshToken": refresh.as_str(), "dispositivoId": dispositivo });

        let (status, bytes) = match self
            .chamar(Method::POST, "/auth/refresh", Some(&corpo), false)
            .await
        {
            Ok(resposta) => resposta,
            Err(erro) => {
                if matches!(erro, ErroDeAcesso::SemConexao) {
                    // O refresh é preservado: a rede pode voltar.
                    com_servico(acesso, |servico| {
                        servico.definir_sessao_online(false);
                        Ok(())
                    })?;
                }
                return Err(erro);
            }
        };

        if status.is_success() {
            let resposta: RespostaDeRenovacao =
                serde_json::from_slice(&bytes).map_err(|_| ErroDeAcesso::Interno)?;
            self.cofre
                .guardar(CHAVE_REFRESH, resposta.refresh_token.as_bytes())?;
            self.access = Some(Zeroizing::new(resposta.access_token));
            self.access_expira_em = Some(resposta.access_expira_em);
            let agora = self.relogio.agora();
            return com_servico(acesso, |servico| {
                servico.registrar_checkin(resposta.politica, agora)
            });
        }
        if status == StatusCode::UNAUTHORIZED {
            self.cofre.remover(CHAVE_REFRESH)?;
            self.limpar_access();
            com_servico(acesso, |servico| {
                servico.definir_sessao_online(false);
                Ok(())
            })?;
            return Err(ErroDeAcesso::SessaoExpirada);
        }
        Err(self.tratar_revogacao(acesso, erro_de_resposta(status, &bytes)))
    }

    /// UL-09: o servidor revogou este computador. Nada é apagado; o app bloqueia e mostra a tela de revogação.
    fn tratar_revogacao(
        &mut self,
        acesso: &Mutex<ServicoDeAcessoLocal>,
        erro: ErroDeAcesso,
    ) -> ErroDeAcesso {
        let revogado =
            matches!(&erro, ErroDeAcesso::Api { codigo, .. } if codigo == "DISPOSITIVO_REVOGADO");
        if !revogado {
            return erro;
        }
        self.limpar_access();
        match com_servico(acesso, |servico| servico.processar_revogacao().map(|_| ())) {
            Ok(()) => ErroDeAcesso::DispositivoRevogado,
            Err(falha) => falha,
        }
    }

    fn limpar_access(&mut self) {
        self.access = None;
        self.access_expira_em = None;
    }

    fn access_valido(&self) -> bool {
        let limite = self.relogio.agora() + DuracaoChrono::seconds(MARGEM_DO_ACCESS);
        self.access.is_some() && self.access_expira_em.is_some_and(|expira| expira > limite)
    }

    /// Sempre remove o refresh e o access localmente, mesmo se a rede falhar.
    pub async fn encerrar(
        &mut self,
        acesso: &Mutex<ServicoDeAcessoLocal>,
    ) -> Result<EstadoDoAcesso, ErroDeAcesso> {
        if !self.access_valido() && self.cofre.ler(CHAVE_REFRESH)?.is_some() {
            // Um access novo permite encerrar também a sessão no servidor.
            let _ = self.renovar_interno(acesso).await;
        }
        if self.access.is_some() {
            let _ = self.chamar(Method::POST, "/auth/logout", None, true).await;
        }
        self.limpar_access();
        self.cofre.remover(CHAVE_REFRESH)?;
        com_servico(acesso, |servico| {
            servico.definir_sessao_online(false);
            servico.estado()
        })
    }

    pub async fn requisicao_autenticada(
        &mut self,
        acesso: &Mutex<ServicoDeAcessoLocal>,
        metodo: &str,
        caminho: &str,
        corpo: Option<&Value>,
    ) -> Result<Value, ErroDeAcesso> {
        let regra = regra_para(metodo, caminho).ok_or(ErroDeAcesso::CaminhoNaoPermitido)?;
        let metodo = Method::from_bytes(metodo.as_bytes()).map_err(|_| ErroDeAcesso::Interno)?;

        com_servico(acesso, |servico| {
            if !servico.esta_desbloqueado() {
                return Err(ErroDeAcesso::Bloqueado);
            }
            if regra.exige_reautenticacao {
                let janela = servico.politica().janela_reautenticacao_min;
                servico.garantir_reautenticacao_recente(janela)?;
            }
            Ok(())
        })?;

        if !self.access_valido() {
            self.renovar_interno(acesso).await?;
        }
        let mut renovou_agora = false;
        loop {
            let (status, bytes) = self.chamar(metodo.clone(), caminho, corpo, true).await?;
            if status == StatusCode::UNAUTHORIZED {
                if renovou_agora {
                    self.limpar_access();
                    return Err(ErroDeAcesso::SessaoExpirada);
                }
                renovou_agora = true;
                self.renovar_interno(acesso).await?;
                continue;
            }
            return corpo_como_json(status, &bytes)
                .map_err(|erro| self.tratar_revogacao(acesso, erro));
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::acesso_local::banco_local::NOME_DO_BANCO;
    use crate::acesso_local::cofre_so::CofreEmMemoria;
    use crate::acesso_local::cripto::ParametrosArgon2;
    use crate::acesso_local::estado::Situacao;
    use crate::acesso_local::relogio::RelogioFixo;
    use chrono::TimeZone;
    use mockito::{Matcher, Server, ServerGuard};
    use tempfile::{TempDir, tempdir};

    const SENHA: &str = "senha-mestre-bem-forte";
    const DISPOSITIVO: &str = "3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b";
    const REFRESH_0: &str = "r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r00";
    const REFRESH_1: &str = "r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r11";
    const REFRESH_2: &str = "r2r2r2r2r2r2r2r2r2r2r2r2r2r2r2r2r2r2r2r2r22";

    struct Ambiente {
        pasta: TempDir,
        relogio: Arc<RelogioFixo>,
        cofre: Arc<CofreEmMemoria>,
        acesso: Arc<Mutex<ServicoDeAcessoLocal>>,
    }

    impl Ambiente {
        fn novo() -> Self {
            let pasta = tempdir().unwrap();
            let relogio = Arc::new(RelogioFixo::novo(
                Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap(),
            ));
            let cofre = Arc::new(CofreEmMemoria::novo());
            let servico = ServicoDeAcessoLocal::novo(
                pasta.path().to_path_buf(),
                cofre.clone(),
                relogio.clone(),
                ParametrosArgon2 {
                    m_kib: 8192,
                    t: 1,
                    p: 1,
                },
            );
            Self {
                pasta,
                relogio,
                cofre,
                acesso: Arc::new(Mutex::new(servico)),
            }
        }

        fn sessao(&self, base: &str) -> SessaoRemota {
            SessaoRemota::novo(
                ConfiguracaoDaApi::validar(Some(base), false).unwrap(),
                self.cofre.clone(),
                self.relogio.clone(),
            )
            .unwrap()
        }

        /// Serviço configurado (existe `dados.db`), com computador registrado e refresh no cofre.
        fn com_sessao_ativa(&self) {
            com_servico(&self.acesso, |s| s.configurar(SENHA).map(|_| ())).unwrap();
            let mut disco = crate::acesso_local::armazenamento::ler(self.pasta.path()).unwrap();
            disco.dispositivo_id = Some(DISPOSITIVO.to_owned());
            crate::acesso_local::armazenamento::salvar(self.pasta.path(), &disco).unwrap();
            self.cofre
                .guardar(CHAVE_REFRESH, REFRESH_0.as_bytes())
                .unwrap();
        }

        fn refresh_no_cofre(&self) -> Option<String> {
            self.cofre
                .ler(CHAVE_REFRESH)
                .unwrap()
                .map(|v| String::from_utf8(v.to_vec()).unwrap())
        }

        fn situacao(&self) -> Situacao {
            com_servico(&self.acesso, |s| s.estado()).unwrap().situacao
        }
    }

    fn politica_json() -> Value {
        json!({
            "inatividadeMin": 10, "limiteDiasOffline": 5, "leituraPermitidaAposLimite": true,
            "maxTentativasLogin": 5, "bloqueioProgressivoMin": [1, 5], "maxDispositivosAtivos": 3,
            "tamanhoMinimoSenha": 12, "validadeAccessMin": 15, "validadeRefreshDias": 30,
            "janelaReautenticacaoMin": 5, "maxFalhasDesbloqueioLocal": 10
        })
    }

    fn corpo_de_refresh(access: &str, refresh: &str, expira_em: DateTime<Utc>) -> String {
        json!({
            "accessToken": access,
            "accessExpiraEm": expira_em.to_rfc3339(),
            "refreshToken": refresh,
            "politica": politica_json()
        })
        .to_string()
    }

    async fn servidor() -> ServerGuard {
        Server::new_async().await
    }

    #[tokio::test]
    async fn concluir_login_guarda_o_refresh_no_cofre_e_nao_devolve_tokens() {
        let ambiente = Ambiente::novo();
        let chave_publica = auditoria::chave_publica_b64(ambiente.cofre.as_ref()).unwrap();
        let mut servidor = servidor().await;
        let corpo_resposta = json!({
            "accessToken": "ACCESS-SECRETO",
            "accessExpiraEm": "2026-10-13T12:15:00.000Z",
            "refreshToken": REFRESH_1,
            "dispositivoId": DISPOSITIVO,
            "politica": politica_json(),
            "usuario": {"id": "u1", "nome": "Lucas", "email": "lucas@clinica.com", "papeis": ["proprietario"]},
            "usouCodigoDeRecuperacao": false,
            "codigosRestantes": 10
        });
        let mock = servidor
            .mock("POST", "/auth/login/concluir")
            .match_header("authorization", Matcher::Missing)
            .match_body(Matcher::PartialJson(json!({
                "desafio": "desafio-1",
                "dispositivo": { "id": null, "chavePublicaAuditoria": chave_publica }
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(corpo_resposta.to_string())
            .create_async()
            .await;

        let mut sessao = ambiente.sessao(&servidor.url());
        let resumo = sessao
            .concluir_login(
                &ambiente.acesso,
                "desafio-1",
                &json!({"tipo": "totp", "valor": "123456"}),
            )
            .await
            .unwrap();
        mock.assert_async().await;

        assert_eq!(ambiente.refresh_no_cofre().as_deref(), Some(REFRESH_1));
        assert_eq!(resumo.proximo_passo, ProximoPasso::ConfigurarDesbloqueio);
        let serializado = serde_json::to_string(&resumo).unwrap();
        assert!(!serializado.contains("ACCESS-SECRETO"));
        assert!(!serializado.contains(REFRESH_1));
        assert!(!serializado.to_lowercase().contains("token"));
        let disco = crate::acesso_local::armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert_eq!(disco.dispositivo_id.as_deref(), Some(DISPOSITIVO));
        assert_eq!(disco.max_falhas_desbloqueio_local, 10);
        assert!(
            com_servico(&ambiente.acesso, |s| s.estado())
                .unwrap()
                .sessao_online
        );

        // O login pendente é aplicado quando a senha mestre é definida.
        let estado = com_servico(&ambiente.acesso, |s| s.configurar(SENHA)).unwrap();
        assert_eq!(estado.usuario.unwrap().nome, "Lucas");
    }

    #[tokio::test]
    async fn renovar_troca_o_refresh_e_envia_o_dispositivo_do_arquivo() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut servidor = servidor().await;
        let mock = servidor
            .mock("POST", "/auth/refresh")
            .match_body(Matcher::Json(
                json!({"refreshToken": REFRESH_0, "dispositivoId": DISPOSITIVO}),
            ))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(corpo_de_refresh(
                "A1",
                REFRESH_1,
                ambiente.relogio.agora() + DuracaoChrono::minutes(15),
            ))
            .create_async()
            .await;

        let mut sessao = ambiente.sessao(&servidor.url());
        let estado = sessao.renovar(&ambiente.acesso).await.unwrap();
        mock.assert_async().await;
        assert_eq!(ambiente.refresh_no_cofre().as_deref(), Some(REFRESH_1));
        assert!(estado.sessao_online);
        assert_eq!(estado.situacao, Situacao::Normal);
    }

    #[tokio::test]
    async fn refresh_recusado_com_401_remove_o_refresh() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut servidor = servidor().await;
        servidor
            .mock("POST", "/auth/refresh")
            .with_status(401)
            .with_body(
                json!({"erro": {"codigo": "SESSAO_EXPIRADA", "mensagem": "Sessão expirada."}})
                    .to_string(),
            )
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor.url());
        assert!(matches!(
            sessao.renovar(&ambiente.acesso).await,
            Err(ErroDeAcesso::SessaoExpirada)
        ));
        assert_eq!(ambiente.refresh_no_cofre(), None);
    }

    #[tokio::test]
    async fn dispositivo_revogado_marca_o_arquivo_sem_apagar_dados() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut servidor = servidor().await;
        servidor
            .mock("POST", "/auth/refresh")
            .with_status(403)
            .with_body(json!({"erro": {"codigo": "DISPOSITIVO_REVOGADO", "mensagem": "Computador revogado."}}).to_string())
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor.url());
        assert!(matches!(
            sessao.renovar(&ambiente.acesso).await,
            Err(ErroDeAcesso::DispositivoRevogado)
        ));
        let disco = crate::acesso_local::armazenamento::ler(ambiente.pasta.path()).unwrap();
        assert!(disco.revogado);
        assert_eq!(ambiente.refresh_no_cofre(), None);
        assert_eq!(ambiente.situacao(), Situacao::Revogado);
        assert!(ambiente.pasta.path().join(NOME_DO_BANCO).exists());
    }

    #[tokio::test]
    async fn sem_rede_devolve_sem_conexao_e_preserva_o_refresh() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut sessao = ambiente.sessao("http://127.0.0.1:1");
        assert!(matches!(
            sessao.renovar(&ambiente.acesso).await,
            Err(ErroDeAcesso::SemConexao)
        ));
        assert_eq!(ambiente.refresh_no_cofre().as_deref(), Some(REFRESH_0));
        assert!(
            !com_servico(&ambiente.acesso, |s| s.estado())
                .unwrap()
                .sessao_online
        );
    }

    #[tokio::test]
    async fn renovar_sem_refresh_no_cofre_e_sessao_expirada() {
        let ambiente = Ambiente::novo();
        let mut sessao = ambiente.sessao("http://127.0.0.1:1");
        assert!(matches!(
            sessao.renovar(&ambiente.acesso).await,
            Err(ErroDeAcesso::SessaoExpirada)
        ));
    }

    #[tokio::test]
    async fn caminhos_fora_da_lista_permitida_sao_recusados_sem_chamar_o_servidor() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut servidor = servidor().await;
        let qualquer = servidor
            .mock("POST", Matcher::Any)
            .expect(0)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor.url());
        for (metodo, caminho) in [
            ("POST", "/auth/refresh"),
            ("POST", "/dispositivos/../auth/refresh"),
            ("GET", "/dispositivos?x=1"),
            ("POST", "/dispositivos"),
            ("GET", "/dispositivos/"),
            ("POST", "/dispositivos/abc/revogar"),
            ("DELETE", "/dispositivos"),
            ("GET", "//evil.example/dispositivos"),
            ("GET", "/dispositivos\n"),
        ] {
            let resultado = sessao
                .requisicao_autenticada(&ambiente.acesso, metodo, caminho, None)
                .await;
            assert!(
                matches!(resultado, Err(ErroDeAcesso::CaminhoNaoPermitido)),
                "{metodo} {caminho} deveria ser recusado"
            );
        }
        qualquer.assert_async().await;
    }

    #[tokio::test]
    async fn revogar_sem_reautenticacao_recente_nao_chama_o_servidor() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut servidor = servidor().await;
        let qualquer = servidor
            .mock("POST", Matcher::Any)
            .expect(0)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor.url());
        let caminho = format!("/dispositivos/{DISPOSITIVO}/revogar");
        let resultado = sessao
            .requisicao_autenticada(
                &ambiente.acesso,
                "POST",
                &caminho,
                Some(&json!({"codigoMfa": "123456"})),
            )
            .await;
        assert!(matches!(
            resultado,
            Err(ErroDeAcesso::ReautenticacaoNecessaria)
        ));
        qualquer.assert_async().await;
    }

    #[tokio::test]
    async fn requisicao_com_o_app_bloqueado_e_recusada() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        com_servico(&ambiente.acesso, |s| {
            s.bloquear(crate::acesso_local::estado::MotivoDeBloqueio::Manual)
                .map(|_| ())
        })
        .unwrap();
        let mut sessao = ambiente.sessao("http://127.0.0.1:1");
        let resultado = sessao
            .requisicao_autenticada(&ambiente.acesso, "GET", "/dispositivos", None)
            .await;
        assert!(matches!(resultado, Err(ErroDeAcesso::Bloqueado)));
    }

    #[tokio::test]
    async fn get_autenticado_renova_o_access_e_devolve_o_corpo() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut servidor = servidor().await;
        servidor
            .mock("POST", "/auth/refresh")
            .with_status(200)
            .with_body(corpo_de_refresh(
                "ACCESS-1",
                REFRESH_1,
                ambiente.relogio.agora() + DuracaoChrono::minutes(15),
            ))
            .create_async()
            .await;
        let lista = servidor
            .mock("GET", "/dispositivos")
            .match_header("authorization", "Bearer ACCESS-1")
            .with_status(200)
            .with_body(json!({"dispositivos": []}).to_string())
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor.url());
        let corpo = sessao
            .requisicao_autenticada(&ambiente.acesso, "GET", "/dispositivos", None)
            .await
            .unwrap();
        lista.assert_async().await;
        assert_eq!(corpo, json!({"dispositivos": []}));
    }

    #[tokio::test]
    async fn um_401_renova_uma_vez_e_repete_com_o_novo_access() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut servidor = servidor().await;
        let expira = ambiente.relogio.agora() + DuracaoChrono::minutes(15);
        servidor
            .mock("POST", "/auth/refresh")
            .match_body(Matcher::PartialJson(json!({"refreshToken": REFRESH_0})))
            .with_status(200)
            .with_body(corpo_de_refresh("ACCESS-1", REFRESH_1, expira))
            .create_async()
            .await;
        servidor
            .mock("POST", "/auth/refresh")
            .match_body(Matcher::PartialJson(json!({"refreshToken": REFRESH_1})))
            .with_status(200)
            .with_body(corpo_de_refresh("ACCESS-2", REFRESH_2, expira))
            .create_async()
            .await;
        let velho = servidor
            .mock("GET", "/dispositivos")
            .match_header("authorization", "Bearer ACCESS-1")
            .with_status(401)
            .with_body(json!({"erro": {"codigo": "SESSAO_EXPIRADA", "mensagem": "x"}}).to_string())
            .expect(1)
            .create_async()
            .await;
        let novo = servidor
            .mock("GET", "/dispositivos")
            .match_header("authorization", "Bearer ACCESS-2")
            .with_status(200)
            .with_body(json!({"dispositivos": []}).to_string())
            .expect(1)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor.url());
        let corpo = sessao
            .requisicao_autenticada(&ambiente.acesso, "GET", "/dispositivos", None)
            .await
            .unwrap();
        velho.assert_async().await;
        novo.assert_async().await;
        assert_eq!(corpo, json!({"dispositivos": []}));
        assert_eq!(ambiente.refresh_no_cofre().as_deref(), Some(REFRESH_2));
    }

    #[tokio::test]
    async fn segundo_401_seguido_e_sessao_expirada() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut servidor = servidor().await;
        let expira = ambiente.relogio.agora() + DuracaoChrono::minutes(15);
        servidor
            .mock("POST", "/auth/refresh")
            .with_status(200)
            .with_body(corpo_de_refresh("ACCESS-X", REFRESH_1, expira))
            .expect(2)
            .create_async()
            .await;
        let lista = servidor
            .mock("GET", "/dispositivos")
            .with_status(401)
            .with_body(json!({"erro": {"codigo": "SESSAO_EXPIRADA", "mensagem": "x"}}).to_string())
            .expect(2)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor.url());
        let resultado = sessao
            .requisicao_autenticada(&ambiente.acesso, "GET", "/dispositivos", None)
            .await;
        assert!(matches!(resultado, Err(ErroDeAcesso::SessaoExpirada)));
        lista.assert_async().await;
    }

    #[tokio::test]
    async fn erro_423_repassa_codigo_e_tentar_apos() {
        let ambiente = Ambiente::novo();
        let mut servidor = servidor().await;
        servidor
            .mock("POST", "/auth/login")
            .match_header("authorization", Matcher::Missing)
            .with_status(423)
            .with_body(
                json!({"erro": {"codigo": "CONTA_BLOQUEADA", "mensagem": "Conta bloqueada.", "tentarApos": "2026-10-13T12:30:00.000Z"}})
                    .to_string(),
            )
            .create_async()
            .await;
        let sessao = ambiente.sessao(&servidor.url());
        let erro = sessao.iniciar_login("a@b.com", "senha").await.unwrap_err();
        match erro {
            ErroDeAcesso::Api {
                status,
                codigo,
                tentar_apos,
                ..
            } => {
                assert_eq!(status, 423);
                assert_eq!(codigo, "CONTA_BLOQUEADA");
                assert_eq!(tentar_apos.as_deref(), Some("2026-10-13T12:30:00.000Z"));
            }
            outro => panic!("erro inesperado: {outro:?}"),
        }
    }

    #[tokio::test]
    async fn corpo_ilegivel_vira_erro_http_generico() {
        let ambiente = Ambiente::novo();
        let mut servidor = servidor().await;
        servidor
            .mock("POST", "/auth/login")
            .with_status(502)
            .with_body("<html>bad gateway</html>")
            .create_async()
            .await;
        let sessao = ambiente.sessao(&servidor.url());
        match sessao.iniciar_login("a@b.com", "senha").await.unwrap_err() {
            ErroDeAcesso::Api {
                status,
                codigo,
                mensagem,
                ..
            } => {
                assert_eq!(status, 502);
                assert_eq!(codigo, "ERRO_HTTP");
                assert_eq!(mensagem, "Não foi possível concluir.");
            }
            outro => panic!("erro inesperado: {outro:?}"),
        }
    }

    #[tokio::test]
    async fn rotas_publicas_nunca_enviam_authorization() {
        let ambiente = Ambiente::novo();
        let mut servidor = servidor().await;
        let rotas = [
            "/auth/login",
            "/auth/mfa/segredo",
            "/auth/mfa/confirmar",
            "/auth/senha/esqueci",
            "/auth/senha/redefinir",
        ];
        let mut mocks = Vec::new();
        for rota in rotas {
            mocks.push(
                servidor
                    .mock("POST", rota)
                    .match_header("authorization", Matcher::Missing)
                    .with_status(200)
                    .with_body("{}")
                    .expect(1)
                    .create_async()
                    .await,
            );
        }
        let mut sessao = ambiente.sessao(&servidor.url());
        // Mesmo com um access em memória, as rotas públicas não o enviam.
        sessao.access = Some(Zeroizing::new("ACCESS-EM-MEMORIA".to_owned()));
        sessao.iniciar_login("a@b.com", "s").await.unwrap();
        sessao.gerar_segredo_mfa("d").await.unwrap();
        sessao.confirmar_mfa("d", "123456").await.unwrap();
        sessao.solicitar_redefinicao("a@b.com").await.unwrap();
        sessao
            .concluir_redefinicao("t", "nova", &json!({"tipo": "totp", "valor": "123456"}))
            .await
            .unwrap();
        for mock in mocks {
            mock.assert_async().await;
        }
    }

    #[tokio::test]
    async fn encerrar_remove_o_refresh_mesmo_sem_rede() {
        let ambiente = Ambiente::novo();
        ambiente.com_sessao_ativa();
        let mut sessao = ambiente.sessao("http://127.0.0.1:1");
        let estado = sessao.encerrar(&ambiente.acesso).await.unwrap();
        assert_eq!(ambiente.refresh_no_cofre(), None);
        assert!(!estado.sessao_online);
    }

    #[test]
    fn configuracao_da_api_valida_esquema_e_padrao() {
        assert_eq!(
            ConfiguracaoDaApi::validar(None, false)
                .unwrap()
                .base
                .as_str(),
            "http://localhost:3000/"
        );
        assert!(ConfiguracaoDaApi::validar(None, true).is_err());
        assert!(ConfiguracaoDaApi::validar(Some("http://api.exemplo.com"), true).is_err());
        assert!(ConfiguracaoDaApi::validar(Some("https://api.exemplo.com"), true).is_ok());
        assert!(ConfiguracaoDaApi::validar(Some("ftp://api.exemplo.com"), false).is_err());
        assert!(ConfiguracaoDaApi::validar(Some("nao e url"), false).is_err());
    }

    #[test]
    fn lista_permitida_aceita_so_o_que_esta_na_tabela() {
        let id = "3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b";
        assert!(regra_para("GET", "/dispositivos").is_some_and(|r| !r.exige_reautenticacao));
        for caminho in [
            format!("/dispositivos/{id}/revogar"),
            "/auth/senha/trocar".to_owned(),
            "/auth/mfa/codigos".to_owned(),
            "/auth/mfa/reconfigurar".to_owned(),
            "/auth/mfa/reconfigurar/confirmar".to_owned(),
            format!("/usuarios/{id}/desativar"),
        ] {
            assert!(
                regra_para("POST", &caminho).is_some_and(|r| r.exige_reautenticacao),
                "{caminho}"
            );
        }
        assert!(regra_para("GET", "/auth/senha/trocar").is_none());
        assert!(regra_para("POST", "/dispositivos").is_none());
    }

    #[test]
    fn apelido_respeita_o_limite_do_servidor() {
        let apelido = apelido_do_computador();
        assert!(!apelido.is_empty() && apelido.chars().count() <= 60);
        assert!(["macos", "windows"].contains(&plataforma()));
    }
}
