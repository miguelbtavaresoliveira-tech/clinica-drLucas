//! Fonte de tempo injetável: o relógio do sistema em produção e um relógio controlável nos testes.
use std::sync::Mutex;

use chrono::{DateTime, Duration, Utc};

pub trait Relogio: Send + Sync {
    fn agora(&self) -> DateTime<Utc>;
}

pub struct RelogioDoSistema;

impl Relogio for RelogioDoSistema {
    fn agora(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

/// Relógio controlado à mão, usado nos testes de todos os módulos.
pub struct RelogioFixo(Mutex<DateTime<Utc>>);

impl RelogioFixo {
    pub fn novo(inicio: DateTime<Utc>) -> Self {
        Self(Mutex::new(inicio))
    }

    pub fn avancar(&self, duracao: Duration) {
        if let Ok(mut agora) = self.0.lock() {
            *agora += duracao;
        }
    }

    pub fn definir(&self, instante: DateTime<Utc>) {
        if let Ok(mut agora) = self.0.lock() {
            *agora = instante;
        }
    }
}

impl Relogio for RelogioFixo {
    fn agora(&self) -> DateTime<Utc> {
        match self.0.lock() {
            Ok(agora) => *agora,
            Err(envenenado) => *envenenado.into_inner(),
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn relogio_fixo_avanca_e_define() {
        let inicio = Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap();
        let relogio = RelogioFixo::novo(inicio);
        assert_eq!(relogio.agora(), inicio);
        relogio.avancar(Duration::minutes(5));
        assert_eq!(relogio.agora(), inicio + Duration::minutes(5));
        relogio.definir(inicio - Duration::days(1));
        assert_eq!(relogio.agora(), inicio - Duration::days(1));
    }

    #[test]
    fn relogio_do_sistema_anda_para_frente() {
        let antes = Utc::now();
        assert!(RelogioDoSistema.agora() >= antes);
    }
}
