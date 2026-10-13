use std::sync::{Arc, Mutex};

use tauri::Manager;

pub mod acesso_local;

use acesso_local::cofre_so::{CofreDeChavesDoSo, KeyringCofre};
use acesso_local::comandos::{self, EstadoTauri};
use acesso_local::cripto::PARAMETROS_MINIMOS;
use acesso_local::inatividade::iniciar_monitor;
use acesso_local::relogio::{Relogio, RelogioDoSistema};
use acesso_local::servico::ServicoDeAcessoLocal;
use acesso_local::sessao_remota::{ConfiguracaoDaApi, SessaoRemota};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let diretorio = app.path().app_data_dir()?;
            std::fs::create_dir_all(&diretorio)?;
            let cofre: Arc<dyn CofreDeChavesDoSo> = Arc::new(KeyringCofre);
            let relogio: Arc<dyn Relogio> = Arc::new(RelogioDoSistema);
            let servico = ServicoDeAcessoLocal::novo(
                diretorio,
                Arc::clone(&cofre),
                Arc::clone(&relogio),
                PARAMETROS_MINIMOS,
            );
            let sessao = SessaoRemota::novo(ConfiguracaoDaApi::do_ambiente()?, cofre, relogio)?;
            let acesso = Arc::new(Mutex::new(servico));
            app.manage(EstadoTauri {
                acesso: Arc::clone(&acesso),
                sessao: tauri::async_runtime::Mutex::new(sessao),
            });
            iniciar_monitor(app.handle().clone(), acesso);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::estado_do_acesso,
            comandos::configurar_desbloqueio,
            comandos::desbloquear_com_senha,
            comandos::bloquear,
            comandos::sinal_de_atividade,
            comandos::api_iniciar_login,
            comandos::api_gerar_segredo_mfa,
            comandos::api_confirmar_mfa,
            comandos::api_concluir_login,
            comandos::api_renovar_sessao,
            comandos::api_encerrar_sessao,
            comandos::api_solicitar_redefinicao,
            comandos::api_concluir_redefinicao,
            comandos::api_requisicao_autenticada,
            comandos::enviar_auditoria_pendente,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
