use std::sync::{Arc, Mutex};

use tauri::Manager;

pub mod acesso_local;

use acesso_local::cofre_so::KeyringCofre;
use acesso_local::comandos::{self, EstadoTauri};
use acesso_local::cripto::PARAMETROS_MINIMOS;
use acesso_local::servico::{RelogioDoSistema, ServicoDeAcessoLocal};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let diretorio = app.path().app_data_dir()?;
            std::fs::create_dir_all(&diretorio)?;
            let servico = ServicoDeAcessoLocal::novo(
                diretorio,
                Arc::new(KeyringCofre),
                Arc::new(RelogioDoSistema),
                PARAMETROS_MINIMOS,
            );
            app.manage(EstadoTauri {
                acesso: Arc::new(Mutex::new(servico)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::estado_do_acesso,
            comandos::configurar_desbloqueio,
            comandos::desbloquear_com_senha,
            comandos::bloquear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
