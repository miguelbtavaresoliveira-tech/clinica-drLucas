//! Adaptadores `#[tauri::command]` do módulo. A lógica fica em structs puras; aqui só se adapta.
//! Os comandos são registrados em `lib.rs` (`generate_handler!` exige a lista no mesmo ponto).
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use zeroize::Zeroizing;

use super::cripto;
use super::erros::ErroDeAcesso;
use super::estado::{EstadoDoAcesso, MotivoDeBloqueio};
use super::servico::ServicoDeAcessoLocal;
use super::sessao_remota::{ResumoDoLogin, SessaoRemota};

pub const EVENTO_ESTADO_ALTERADO: &str = "acesso://estado-alterado";

pub struct EstadoTauri {
    pub acesso: Arc<Mutex<ServicoDeAcessoLocal>>,
    /// Serializa as chamadas à API: a rotação do refresh token não pode correr em paralelo.
    pub sessao: tauri::async_runtime::Mutex<SessaoRemota>,
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

/// Sinal de atividade enviado pela interface. Sem efeito se o app estiver bloqueado.
#[tauri::command]
pub async fn sinal_de_atividade(estado: State<'_, EstadoTauri>) -> Result<(), ErroDeAcesso> {
    executar(&estado, |servico| {
        servico.registrar_atividade();
        Ok(())
    })
    .await
}

async fn emitir_estado_atual(app: &AppHandle, estado: &EstadoTauri) {
    if let Ok(atual) = executar(estado, |servico| servico.estado()).await {
        avisar(app, &atual);
    }
}

#[tauri::command]
pub async fn api_iniciar_login(
    estado: State<'_, EstadoTauri>,
    email: String,
    senha: String,
) -> Result<Value, ErroDeAcesso> {
    let senha = Zeroizing::new(senha);
    estado
        .sessao
        .lock()
        .await
        .iniciar_login(&email, &senha)
        .await
}

#[tauri::command]
pub async fn api_gerar_segredo_mfa(
    estado: State<'_, EstadoTauri>,
    desafio: String,
) -> Result<Value, ErroDeAcesso> {
    estado.sessao.lock().await.gerar_segredo_mfa(&desafio).await
}

#[tauri::command]
pub async fn api_confirmar_mfa(
    estado: State<'_, EstadoTauri>,
    desafio: String,
    codigo: String,
) -> Result<Value, ErroDeAcesso> {
    let codigo = Zeroizing::new(codigo);
    estado
        .sessao
        .lock()
        .await
        .confirmar_mfa(&desafio, &codigo)
        .await
}

#[tauri::command]
pub async fn api_concluir_login(
    app: AppHandle,
    estado: State<'_, EstadoTauri>,
    desafio: String,
    codigo: Value,
) -> Result<ResumoDoLogin, ErroDeAcesso> {
    let resultado = estado
        .sessao
        .lock()
        .await
        .concluir_login(&estado.acesso, &desafio, &codigo)
        .await;
    emitir_estado_atual(&app, &estado).await;
    resultado
}

#[tauri::command]
pub async fn api_renovar_sessao(
    app: AppHandle,
    estado: State<'_, EstadoTauri>,
) -> Result<EstadoDoAcesso, ErroDeAcesso> {
    let resultado = estado.sessao.lock().await.renovar(&estado.acesso).await;
    emitir_estado_atual(&app, &estado).await;
    resultado
}

#[tauri::command]
pub async fn api_encerrar_sessao(
    app: AppHandle,
    estado: State<'_, EstadoTauri>,
) -> Result<EstadoDoAcesso, ErroDeAcesso> {
    let resultado = estado.sessao.lock().await.encerrar(&estado.acesso).await;
    emitir_estado_atual(&app, &estado).await;
    resultado
}

#[tauri::command]
pub async fn api_solicitar_redefinicao(
    estado: State<'_, EstadoTauri>,
    email: String,
) -> Result<(), ErroDeAcesso> {
    estado
        .sessao
        .lock()
        .await
        .solicitar_redefinicao(&email)
        .await
}

#[tauri::command]
pub async fn api_concluir_redefinicao(
    estado: State<'_, EstadoTauri>,
    token: String,
    nova_senha: String,
    codigo: Value,
) -> Result<(), ErroDeAcesso> {
    let token = Zeroizing::new(token);
    let nova_senha = Zeroizing::new(nova_senha);
    estado
        .sessao
        .lock()
        .await
        .concluir_redefinicao(&token, &nova_senha, &codigo)
        .await
}

#[tauri::command]
pub async fn api_requisicao_autenticada(
    app: AppHandle,
    estado: State<'_, EstadoTauri>,
    metodo: String,
    caminho: String,
    corpo: Option<Value>,
) -> Result<Value, ErroDeAcesso> {
    let resultado = estado
        .sessao
        .lock()
        .await
        .requisicao_autenticada(&estado.acesso, &metodo, &caminho, corpo.as_ref())
        .await;
    // Uma revogação detectada aqui muda o estado do app inteiro.
    if matches!(resultado, Err(ErroDeAcesso::DispositivoRevogado)) {
        emitir_estado_atual(&app, &estado).await;
    }
    resultado
}
