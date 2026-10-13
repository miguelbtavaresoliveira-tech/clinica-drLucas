//! Erro único do módulo, serializável para o frontend (`ErroDoApp`).
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum ErroDeAcesso {
    #[error("Senha mestre incorreta.")]
    SenhaMestreIncorreta,
    #[error("Aguarde antes de tentar novamente.")]
    AguardeAntesDeTentar { segundos_restantes: u64 },
    #[error("Entre novamente com e-mail, senha e código.")]
    ExigeLoginCompleto,
    #[error("O desbloqueio local ainda não foi configurado.")]
    NaoConfigurado,
    #[error("O desbloqueio local já está configurado.")]
    JaConfigurado,
    #[error("O aplicativo está bloqueado.")]
    Bloqueado,
    #[error("A senha mestre precisa ter entre 12 e 128 caracteres.")]
    SenhaMestreFraca,
    #[error("Confirme sua identidade para continuar.")]
    ReautenticacaoNecessaria,
    #[error("Biometria indisponível neste computador.")]
    BiometriaIndisponivel,
    #[error("Este computador foi desconectado da conta.")]
    DispositivoRevogado,
    #[error("Sem conexão com o servidor.")]
    SemConexao,
    #[error("Sessão expirada. Entre novamente.")]
    SessaoExpirada,
    #[error("Modo somente leitura.")]
    SomenteLeitura,
    #[error("Operação não permitida.")]
    CaminhoNaoPermitido,
    #[error("Confirmação inválida.")]
    ConfirmacaoInvalida,
    #[error("{mensagem}")]
    Api {
        status: u16,
        codigo: String,
        mensagem: String,
        tentar_apos: Option<String>,
    },
    #[error("Erro interno.")]
    Interno,
}

impl ErroDeAcesso {
    /// Código estável enviado ao frontend: `SCREAMING_SNAKE_CASE` da variante; para `Api`, o código recebido.
    pub fn codigo(&self) -> String {
        match self {
            Self::SenhaMestreIncorreta => "SENHA_MESTRE_INCORRETA".to_owned(),
            Self::AguardeAntesDeTentar { .. } => "AGUARDE_ANTES_DE_TENTAR".to_owned(),
            Self::ExigeLoginCompleto => "EXIGE_LOGIN_COMPLETO".to_owned(),
            Self::NaoConfigurado => "NAO_CONFIGURADO".to_owned(),
            Self::JaConfigurado => "JA_CONFIGURADO".to_owned(),
            Self::Bloqueado => "BLOQUEADO".to_owned(),
            Self::SenhaMestreFraca => "SENHA_MESTRE_FRACA".to_owned(),
            Self::ReautenticacaoNecessaria => "REAUTENTICACAO_NECESSARIA".to_owned(),
            Self::BiometriaIndisponivel => "BIOMETRIA_INDISPONIVEL".to_owned(),
            Self::DispositivoRevogado => "DISPOSITIVO_REVOGADO".to_owned(),
            Self::SemConexao => "SEM_CONEXAO".to_owned(),
            Self::SessaoExpirada => "SESSAO_EXPIRADA".to_owned(),
            Self::SomenteLeitura => "SOMENTE_LEITURA".to_owned(),
            Self::CaminhoNaoPermitido => "CAMINHO_NAO_PERMITIDO".to_owned(),
            Self::ConfirmacaoInvalida => "CONFIRMACAO_INVALIDA".to_owned(),
            Self::Api { codigo, .. } => codigo.clone(),
            Self::Interno => "INTERNO".to_owned(),
        }
    }
}

impl Serialize for ErroDeAcesso {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut mapa = serializer.serialize_map(None)?;
        mapa.serialize_entry("codigo", &self.codigo())?;
        mapa.serialize_entry("mensagem", &self.to_string())?;
        match self {
            Self::AguardeAntesDeTentar { segundos_restantes } => {
                mapa.serialize_entry("segundosRestantes", segundos_restantes)?;
            }
            Self::Api {
                status,
                tentar_apos,
                ..
            } => {
                mapa.serialize_entry("status", status)?;
                if let Some(ate) = tentar_apos {
                    mapa.serialize_entry("tentarApos", ate)?;
                }
            }
            _ => {}
        }
        mapa.end()
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    #[test]
    fn aguarde_serializa_os_segundos_restantes() {
        let valor = serde_json::to_value(ErroDeAcesso::AguardeAntesDeTentar {
            segundos_restantes: 30,
        })
        .unwrap();
        assert_eq!(
            valor,
            json!({"codigo":"AGUARDE_ANTES_DE_TENTAR","mensagem":"Aguarde antes de tentar novamente.","segundosRestantes":30})
        );
    }

    #[test]
    fn api_serializa_codigo_status_e_tentar_apos() {
        let erro = ErroDeAcesso::Api {
            status: 423,
            codigo: "CONTA_BLOQUEADA".to_owned(),
            mensagem: "Conta temporariamente bloqueada.".to_owned(),
            tentar_apos: Some("2026-10-13T12:30:00.000Z".to_owned()),
        };
        assert_eq!(
            serde_json::to_value(erro).unwrap(),
            json!({"codigo":"CONTA_BLOQUEADA","mensagem":"Conta temporariamente bloqueada.","status":423,"tentarApos":"2026-10-13T12:30:00.000Z"})
        );
    }

    #[test]
    fn api_sem_tentar_apos_omite_o_campo() {
        let erro = ErroDeAcesso::Api {
            status: 401,
            codigo: "CREDENCIAIS_INVALIDAS".to_owned(),
            mensagem: "E-mail ou senha incorretos.".to_owned(),
            tentar_apos: None,
        };
        let valor = serde_json::to_value(erro).unwrap();
        assert!(valor.get("tentarApos").is_none());
        assert_eq!(valor["status"], 401);
    }

    #[test]
    fn interno_serializa_so_codigo_e_mensagem() {
        assert_eq!(
            serde_json::to_value(ErroDeAcesso::Interno).unwrap(),
            json!({"codigo":"INTERNO","mensagem":"Erro interno."})
        );
    }

    #[test]
    fn todo_erro_simples_tem_codigo_e_mensagem_sem_campos_extras() {
        let erros = [
            (ErroDeAcesso::SenhaMestreIncorreta, "SENHA_MESTRE_INCORRETA"),
            (ErroDeAcesso::ExigeLoginCompleto, "EXIGE_LOGIN_COMPLETO"),
            (ErroDeAcesso::NaoConfigurado, "NAO_CONFIGURADO"),
            (ErroDeAcesso::JaConfigurado, "JA_CONFIGURADO"),
            (ErroDeAcesso::Bloqueado, "BLOQUEADO"),
            (ErroDeAcesso::SenhaMestreFraca, "SENHA_MESTRE_FRACA"),
            (
                ErroDeAcesso::ReautenticacaoNecessaria,
                "REAUTENTICACAO_NECESSARIA",
            ),
            (
                ErroDeAcesso::BiometriaIndisponivel,
                "BIOMETRIA_INDISPONIVEL",
            ),
            (ErroDeAcesso::DispositivoRevogado, "DISPOSITIVO_REVOGADO"),
            (ErroDeAcesso::SemConexao, "SEM_CONEXAO"),
            (ErroDeAcesso::SessaoExpirada, "SESSAO_EXPIRADA"),
            (ErroDeAcesso::SomenteLeitura, "SOMENTE_LEITURA"),
            (ErroDeAcesso::CaminhoNaoPermitido, "CAMINHO_NAO_PERMITIDO"),
            (ErroDeAcesso::ConfirmacaoInvalida, "CONFIRMACAO_INVALIDA"),
        ];
        for (erro, codigo) in erros {
            let valor = serde_json::to_value(&erro).unwrap();
            assert_eq!(valor["codigo"], codigo);
            assert_eq!(
                valor.as_object().unwrap().len(),
                2,
                "{codigo} não deve ter campos extras"
            );
        }
    }

    #[test]
    fn codigo_da_api_e_repassado() {
        let erro = ErroDeAcesso::Api {
            status: 409,
            codigo: "ULTIMO_PROPRIETARIO".to_owned(),
            mensagem: "x".to_owned(),
            tentar_apos: None,
        };
        assert_eq!(erro.codigo(), "ULTIMO_PROPRIETARIO");
    }
}
