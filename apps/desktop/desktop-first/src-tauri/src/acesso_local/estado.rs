//! Tipos de estado enviados ao frontend (`EstadoDoAcesso`).
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Situacao {
    SemConfiguracao,
    Bloqueado,
    Normal,
    SomenteLeitura,
    OfflineExpirado,
    Revogado,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsuarioResumo {
    pub id: String,
    pub nome: String,
    pub email: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDoAcesso {
    pub situacao: Situacao,
    pub exige_login_completo: bool,
    pub biometria_disponivel: bool,
    pub biometria_habilitada: bool,
    pub segundos_ate_nova_tentativa: u64,
    pub sessao_online: bool,
    pub usuario: Option<UsuarioResumo>,
    pub eventos_pendentes: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MotivoDeBloqueio {
    Manual,
    Inatividade,
    Suspensao,
    Revogacao,
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    #[test]
    fn situacao_serializa_em_snake_case() {
        let pares = [
            (Situacao::SemConfiguracao, "sem_configuracao"),
            (Situacao::Bloqueado, "bloqueado"),
            (Situacao::Normal, "normal"),
            (Situacao::SomenteLeitura, "somente_leitura"),
            (Situacao::OfflineExpirado, "offline_expirado"),
            (Situacao::Revogado, "revogado"),
        ];
        for (situacao, texto) in pares {
            assert_eq!(serde_json::to_value(situacao).unwrap(), json!(texto));
        }
    }

    #[test]
    fn estado_do_acesso_serializa_em_camel_case() {
        let estado = EstadoDoAcesso {
            situacao: Situacao::Bloqueado,
            exige_login_completo: false,
            biometria_disponivel: false,
            biometria_habilitada: false,
            segundos_ate_nova_tentativa: 5,
            sessao_online: false,
            usuario: Some(UsuarioResumo {
                id: "u1".to_owned(),
                nome: "Lucas".to_owned(),
                email: "lucas@clinica.com".to_owned(),
            }),
            eventos_pendentes: 2,
        };
        assert_eq!(
            serde_json::to_value(estado).unwrap(),
            json!({
                "situacao": "bloqueado",
                "exigeLoginCompleto": false,
                "biometriaDisponivel": false,
                "biometriaHabilitada": false,
                "segundosAteNovaTentativa": 5,
                "sessaoOnline": false,
                "usuario": {"id": "u1", "nome": "Lucas", "email": "lucas@clinica.com"},
                "eventosPendentes": 2
            })
        );
    }
}
