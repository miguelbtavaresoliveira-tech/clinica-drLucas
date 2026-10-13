//! Avaliação do modo offline (UL-08, RN-21, DT-12): limite de dias e relógio retrocedido.
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use super::estado::Situacao;

/// Subconjunto da `PoliticaDeAcesso` do servidor que o desktop precisa offline.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoliticaLocal {
    pub inatividade_min: i64,
    pub limite_dias_offline: i64,
    pub leitura_permitida_apos_limite: bool,
    pub janela_reautenticacao_min: i64,
    pub max_falhas_desbloqueio_local: u32,
}

impl Default for PoliticaLocal {
    fn default() -> Self {
        Self {
            inatividade_min: 10,
            limite_dias_offline: 5,
            leitura_permitida_apos_limite: true,
            janela_reautenticacao_min: 5,
            max_falhas_desbloqueio_local: 10,
        }
    }
}

/// Restrito quando o relógio voltou antes da marca d'água ou o último check-in passou do limite.
pub fn avaliar(
    agora: DateTime<Utc>,
    ultimo_checkin: DateTime<Utc>,
    marca_dagua: Option<DateTime<Utc>>,
    politica: &PoliticaLocal,
) -> Situacao {
    let relogio_retrocedido = marca_dagua.is_some_and(|marca| agora < marca);
    let passou_do_limite = agora - ultimo_checkin > Duration::days(politica.limite_dias_offline);
    if relogio_retrocedido || passou_do_limite {
        if politica.leitura_permitida_apos_limite {
            Situacao::SomenteLeitura
        } else {
            Situacao::OfflineExpirado
        }
    } else {
        Situacao::Normal
    }
}

/// A marca d'água nunca diminui.
pub fn nova_marca_dagua(atual: Option<DateTime<Utc>>, agora: DateTime<Utc>) -> DateTime<Utc> {
    atual.map_or(agora, |marca| marca.max(agora))
}

#[cfg(test)]
mod testes {
    use super::*;
    use chrono::TimeZone;

    fn t() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap()
    }

    #[test]
    fn dentro_do_limite_e_normal() {
        let p = PoliticaLocal::default();
        assert_eq!(
            avaliar(t(), t() - Duration::days(2), None, &p),
            Situacao::Normal
        );
    }

    #[test]
    fn exatamente_cinco_dias_ainda_e_normal() {
        let p = PoliticaLocal::default();
        assert_eq!(
            avaliar(t(), t() - Duration::days(5), None, &p),
            Situacao::Normal
        );
    }

    #[test]
    fn cinco_dias_e_um_segundo_vira_somente_leitura() {
        let p = PoliticaLocal::default();
        let checkin = t() - Duration::days(5) - Duration::seconds(1);
        assert_eq!(avaliar(t(), checkin, None, &p), Situacao::SomenteLeitura);
    }

    #[test]
    fn com_leitura_proibida_expira() {
        let p = PoliticaLocal {
            leitura_permitida_apos_limite: false,
            ..PoliticaLocal::default()
        };
        let checkin = t() - Duration::days(6);
        assert_eq!(avaliar(t(), checkin, None, &p), Situacao::OfflineExpirado);
    }

    #[test]
    fn relogio_retrocedido_vira_somente_leitura() {
        let p = PoliticaLocal::default();
        let marca = t();
        let agora = t() - Duration::minutes(1);
        assert_eq!(
            avaliar(agora, agora - Duration::hours(1), Some(marca), &p),
            Situacao::SomenteLeitura
        );
    }

    #[test]
    fn relogio_retrocedido_com_leitura_proibida_expira() {
        let p = PoliticaLocal {
            leitura_permitida_apos_limite: false,
            ..PoliticaLocal::default()
        };
        assert_eq!(
            avaliar(t() - Duration::minutes(1), t(), Some(t()), &p),
            Situacao::OfflineExpirado
        );
    }

    #[test]
    fn marca_dagua_igual_ao_agora_nao_restringe() {
        let p = PoliticaLocal::default();
        assert_eq!(avaliar(t(), t(), Some(t()), &p), Situacao::Normal);
    }

    #[test]
    fn marca_dagua_nunca_diminui() {
        assert_eq!(nova_marca_dagua(None, t()), t());
        assert_eq!(
            nova_marca_dagua(Some(t()), t() + Duration::minutes(1)),
            t() + Duration::minutes(1)
        );
        assert_eq!(nova_marca_dagua(Some(t()), t() - Duration::days(3)), t());
    }

    #[test]
    fn politica_serializa_em_camel_case_e_tem_padrao_documentado() {
        let valor = serde_json::to_value(PoliticaLocal::default()).unwrap();
        assert_eq!(
            valor,
            serde_json::json!({
                "inatividadeMin": 10,
                "limiteDiasOffline": 5,
                "leituraPermitidaAposLimite": true,
                "janelaReautenticacaoMin": 5,
                "maxFalhasDesbloqueioLocal": 10
            })
        );
    }
}
