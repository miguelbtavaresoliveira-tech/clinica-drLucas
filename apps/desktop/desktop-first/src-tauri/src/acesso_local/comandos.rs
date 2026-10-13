//! Adaptadores `#[tauri::command]` do módulo. A lógica fica em structs puras; aqui só se adapta.
//! Os comandos são registrados em `lib.rs` (`generate_handler!` exige a lista no mesmo ponto).
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};
use zeroize::Zeroizing;

use super::cripto;
use super::erros::ErroDeAcesso;
use super::estado::{EstadoDoAcesso, MotivoDeBloqueio};
use super::servico::ServicoDeAcessoLocal;

pub const EVENTO_ESTADO_ALTERADO: &str = "acesso://estado-alterado";

pub struct EstadoTauri {
    pub acesso: Arc<Mutex<ServicoDeAcessoLocal>>,
}

/// Roda o trabalho (possivelmente pesado, como o Argon2id) fora da thread do runtime assíncrono.
async fn executar<T, F>(estado: &EstadoTauri, trabalho: F) -> Result<T, ErroDeAcesso>
where
    T: Send + 'static,
    F: FnOnce(&mut ServicoDeAcessoLocal) -> Result<T, ErroDeAcesso> + Send + 'static,
{
    let acesso = Arc::clone(&estado.acesso);
    tauri::async_runtime::spawn_blocking(move || {
        let mut servico = acesso.lock().map_err(|_| ErroDeAcesso::Interno)?;
        trabalho(&mut servico)
    })
    .await
    .map_err(|_| ErroDeAcesso::Interno)?
}

fn avisar(app: &AppHandle, estado: &EstadoDoAcesso) {
    // Se a janela não estiver ouvindo, o próximo `estado_do_acesso` traz o valor correto.
    let _ = app.emit(EVENTO_ESTADO_ALTERADO, estado);
}

#[tauri::command]
pub async fn estado_do_acesso(
    estado: State<'_, EstadoTauri>,
) -> Result<EstadoDoAcesso, ErroDeAcesso> {
    executar(&estado, |servico| servico.estado()).await
}

#[tauri::command]
pub async fn configurar_desbloqueio(
    app: AppHandle,
    estado: State<'_, EstadoTauri>,
    senha: String,
) -> Result<EstadoDoAcesso, ErroDeAcesso> {
    let senha = Zeroizing::new(senha);
    let novo = executar(&estado, move |servico| {
        // A calibração roda uma única vez, aqui, e fora do bloqueio do serviço.
        let parametros = cripto::calibrar(500, 1000);
        servico.definir_parametros_novos(parametros);
        servico.configurar(&senha)
    })
    .await?;
    avisar(&app, &novo);
    Ok(novo)
}

#[tauri::command]
pub async fn desbloquear_com_senha(
    app: AppHandle,
    estado: State<'_, EstadoTauri>,
    senha: String,
) -> Result<EstadoDoAcesso, ErroDeAcesso> {
    let senha = Zeroizing::new(senha);
    let resultado = executar(&estado, move |servico| {
        servico.desbloquear_com_senha(&senha)
    })
    .await;
    // Falhas também mudam o estado (contador, espera, login completo): o frontend precisa saber.
    if let Ok(novo) = &resultado {
        avisar(&app, novo);
    } else if let Ok(atual) = executar(&estado, |servico| servico.estado()).await {
        avisar(&app, &atual);
    }
    resultado
}

#[tauri::command]
pub async fn bloquear(
    app: AppHandle,
    estado: State<'_, EstadoTauri>,
) -> Result<EstadoDoAcesso, ErroDeAcesso> {
    let novo = executar(&estado, |servico| {
        servico.bloquear(MotivoDeBloqueio::Manual)
    })
    .await?;
    avisar(&app, &novo);
    Ok(novo)
}
