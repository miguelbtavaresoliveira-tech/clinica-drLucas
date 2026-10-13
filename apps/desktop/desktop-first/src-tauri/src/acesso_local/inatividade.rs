//! Monitor de inatividade e suspensão (RN-26, DT-11). Roda no Rust: o bloqueio não depende da interface.
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use tauri::{AppHandle, Emitter};

use super::comandos::EVENTO_ESTADO_ALTERADO;
use super::estado::MotivoDeBloqueio;
use super::servico::ServicoDeAcessoLocal;

pub const INTERVALO_DO_TICK: Duration = Duration::from_secs(5);
pub const SALTO_QUE_INDICA_SUSPENSAO: Duration = Duration::from_secs(30);
pub const INTERVALO_DE_REAVALIACAO: Duration = Duration::from_secs(3600);

#[derive(Debug, PartialEq, Eq)]
pub enum AcaoDoMonitor {
    Nada,
    BloquearPorInatividade,
    BloquearPorSuspensao,
    ReavaliarModo,
}

pub struct EntradaDoTick {
    pub desbloqueado: bool,
    /// Tempo desde o último sinal de atividade.
    pub ociosidade: Duration,
    /// Tempo de relógio de parede decorrido entre dois ticks.
    pub salto_de_parede: Duration,
    pub desde_ultima_reavaliacao: Duration,
    pub limite_inatividade: Duration,
}

pub fn decidir(entrada: &EntradaDoTick) -> AcaoDoMonitor {
    if !entrada.desbloqueado {
        AcaoDoMonitor::Nada
    } else if entrada.salto_de_parede >= SALTO_QUE_INDICA_SUSPENSAO {
        AcaoDoMonitor::BloquearPorSuspensao
    } else if entrada.ociosidade >= entrada.limite_inatividade {
        AcaoDoMonitor::BloquearPorInatividade
    } else if entrada.desde_ultima_reavaliacao >= INTERVALO_DE_REAVALIACAO {
        AcaoDoMonitor::ReavaliarModo
    } else {
        AcaoDoMonitor::Nada
    }
}

/// Inicia a thread do monitor. Se o mutex estiver envenenado, bloqueia (fail-closed).
pub fn iniciar_monitor(app: AppHandle, acesso: Arc<Mutex<ServicoDeAcessoLocal>>) {
    thread::spawn(move || {
        let mut parede_anterior = SystemTime::now();
        let mut ultima_reavaliacao = Instant::now();
        loop {
            thread::sleep(INTERVALO_DO_TICK);
            let parede_agora = SystemTime::now();
            let salto = parede_agora
                .duration_since(parede_anterior)
                .unwrap_or(Duration::ZERO);
            parede_anterior = parede_agora;

            let novo_estado = {
                let (mut servico, envenenado) = match acesso.lock() {
                    Ok(guarda) => (guarda, false),
                    Err(erro) => (erro.into_inner(), true),
                };
                let acao = if envenenado {
                    AcaoDoMonitor::BloquearPorInatividade
                } else {
                    decidir(&EntradaDoTick {
                        desbloqueado: servico.esta_desbloqueado(),
                        ociosidade: servico.ociosidade(),
                        salto_de_parede: salto,
                        desde_ultima_reavaliacao: ultima_reavaliacao.elapsed(),
                        limite_inatividade: servico.limite_inatividade(),
                    })
                };
                match acao {
                    AcaoDoMonitor::Nada => None,
                    AcaoDoMonitor::BloquearPorInatividade => {
                        servico.bloquear(MotivoDeBloqueio::Inatividade).ok()
                    }
                    AcaoDoMonitor::BloquearPorSuspensao => {
                        servico.bloquear(MotivoDeBloqueio::Suspensao).ok()
                    }
                    AcaoDoMonitor::ReavaliarModo => {
                        ultima_reavaliacao = Instant::now();
                        servico.reavaliar_modo().ok()
                    }
                }
            };
            if let Some(estado) = novo_estado {
                let _ = app.emit(EVENTO_ESTADO_ALTERADO, &estado);
            }
        }
    });
}

#[cfg(test)]
mod testes {
    use super::*;

    fn entrada() -> EntradaDoTick {
        EntradaDoTick {
            desbloqueado: true,
            ociosidade: Duration::ZERO,
            salto_de_parede: INTERVALO_DO_TICK,
            desde_ultima_reavaliacao: Duration::ZERO,
            limite_inatividade: Duration::from_secs(600),
        }
    }

    #[test]
    fn bloqueado_nao_faz_nada() {
        let e = EntradaDoTick {
            desbloqueado: false,
            ociosidade: Duration::from_secs(99_999),
            salto_de_parede: Duration::from_secs(99_999),
            desde_ultima_reavaliacao: Duration::from_secs(99_999),
            ..entrada()
        };
        assert_eq!(decidir(&e), AcaoDoMonitor::Nada);
    }

    #[test]
    fn nove_minutos_e_cinquenta_e_nove_segundos_nao_bloqueia() {
        let e = EntradaDoTick {
            ociosidade: Duration::from_secs(9 * 60 + 59),
            ..entrada()
        };
        assert_eq!(decidir(&e), AcaoDoMonitor::Nada);
    }

    #[test]
    fn dez_minutos_bloqueia_por_inatividade() {
        let e = EntradaDoTick {
            ociosidade: Duration::from_secs(10 * 60),
            ..entrada()
        };
        assert_eq!(decidir(&e), AcaoDoMonitor::BloquearPorInatividade);
    }

    #[test]
    fn salto_de_trinta_segundos_bloqueia_por_suspensao_com_prioridade() {
        let so_salto = EntradaDoTick {
            salto_de_parede: Duration::from_secs(31),
            ..entrada()
        };
        assert_eq!(decidir(&so_salto), AcaoDoMonitor::BloquearPorSuspensao);
        let exato = EntradaDoTick {
            salto_de_parede: SALTO_QUE_INDICA_SUSPENSAO,
            ..entrada()
        };
        assert_eq!(decidir(&exato), AcaoDoMonitor::BloquearPorSuspensao);
        let com_ociosidade = EntradaDoTick {
            salto_de_parede: Duration::from_secs(31),
            ociosidade: Duration::from_secs(99_999),
            ..entrada()
        };
        assert_eq!(
            decidir(&com_ociosidade),
            AcaoDoMonitor::BloquearPorSuspensao
        );
    }

    #[test]
    fn uma_hora_desde_a_reavaliacao_pede_reavaliar() {
        let e = EntradaDoTick {
            desde_ultima_reavaliacao: INTERVALO_DE_REAVALIACAO,
            ..entrada()
        };
        assert_eq!(decidir(&e), AcaoDoMonitor::ReavaliarModo);
        let antes = EntradaDoTick {
            desde_ultima_reavaliacao: INTERVALO_DE_REAVALIACAO - Duration::from_secs(1),
            ..entrada()
        };
        assert_eq!(decidir(&antes), AcaoDoMonitor::Nada);
    }

    #[test]
    fn bloqueio_tem_prioridade_sobre_reavaliacao() {
        let e = EntradaDoTick {
            ociosidade: Duration::from_secs(10 * 60),
            desde_ultima_reavaliacao: INTERVALO_DE_REAVALIACAO,
            ..entrada()
        };
        assert_eq!(decidir(&e), AcaoDoMonitor::BloquearPorInatividade);
    }
}
