//! Porta `CofreDeChavesDoSo`: segredos no Keychain (macOS) / Credential Manager (Windows).
use std::collections::HashMap;
use std::sync::Mutex;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use zeroize::Zeroizing;

use super::erros::ErroDeAcesso;

pub const SERVICO: &str = "br.com.fisioterapiaevo.clinica";
pub const CHAVE_REFRESH: &str = "refresh_token";
pub const CHAVE_AUDITORIA: &str = "auditoria_ed25519";
pub const CHAVE_BIOMETRIA: &str = "dek_biometria";

pub trait CofreDeChavesDoSo: Send + Sync {
    fn guardar(&self, nome: &str, valor: &[u8]) -> Result<(), ErroDeAcesso>;
    /// Ausente → `Ok(None)`.
    fn ler(&self, nome: &str) -> Result<Option<Zeroizing<Vec<u8>>>, ErroDeAcesso>;
    /// Ausente → `Ok(())`.
    fn remover(&self, nome: &str) -> Result<(), ErroDeAcesso>;
}

/// Cofre real do sistema operacional. O valor é guardado em base64 (a API do SO trabalha com texto).
pub struct KeyringCofre;

impl KeyringCofre {
    fn entrada(nome: &str) -> Result<keyring::Entry, ErroDeAcesso> {
        keyring::Entry::new(SERVICO, nome).map_err(|_| ErroDeAcesso::Interno)
    }
}

impl CofreDeChavesDoSo for KeyringCofre {
    fn guardar(&self, nome: &str, valor: &[u8]) -> Result<(), ErroDeAcesso> {
        let texto = Zeroizing::new(STANDARD.encode(valor));
        Self::entrada(nome)?
            .set_password(&texto)
            .map_err(|_| ErroDeAcesso::Interno)
    }

    fn ler(&self, nome: &str) -> Result<Option<Zeroizing<Vec<u8>>>, ErroDeAcesso> {
        match Self::entrada(nome)?.get_password() {
            Ok(texto) => {
                let texto = Zeroizing::new(texto);
                let bytes = STANDARD
                    .decode(texto.as_bytes())
                    .map_err(|_| ErroDeAcesso::Interno)?;
                Ok(Some(Zeroizing::new(bytes)))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(ErroDeAcesso::Interno),
        }
    }

    fn remover(&self, nome: &str) -> Result<(), ErroDeAcesso> {
        match Self::entrada(nome)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(ErroDeAcesso::Interno),
        }
    }
}

/// Cofre em memória, usado nos testes de todos os módulos.
#[derive(Default)]
pub struct CofreEmMemoria {
    itens: Mutex<HashMap<String, Vec<u8>>>,
}

impl CofreEmMemoria {
    pub fn novo() -> Self {
        Self::default()
    }
}

impl CofreDeChavesDoSo for CofreEmMemoria {
    fn guardar(&self, nome: &str, valor: &[u8]) -> Result<(), ErroDeAcesso> {
        let mut itens = self.itens.lock().map_err(|_| ErroDeAcesso::Interno)?;
        itens.insert(nome.to_owned(), valor.to_vec());
        Ok(())
    }

    fn ler(&self, nome: &str) -> Result<Option<Zeroizing<Vec<u8>>>, ErroDeAcesso> {
        let itens = self.itens.lock().map_err(|_| ErroDeAcesso::Interno)?;
        Ok(itens.get(nome).map(|valor| Zeroizing::new(valor.clone())))
    }

    fn remover(&self, nome: &str) -> Result<(), ErroDeAcesso> {
        let mut itens = self.itens.lock().map_err(|_| ErroDeAcesso::Interno)?;
        itens.remove(nome);
        Ok(())
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn guardar_ler_e_remover() {
        let cofre = CofreEmMemoria::novo();
        cofre.guardar(CHAVE_REFRESH, b"token-secreto").unwrap();
        assert_eq!(
            cofre
                .ler(CHAVE_REFRESH)
                .unwrap()
                .as_deref()
                .map(Vec::as_slice),
            Some(b"token-secreto".as_slice())
        );
        cofre.remover(CHAVE_REFRESH).unwrap();
        assert!(cofre.ler(CHAVE_REFRESH).unwrap().is_none());
    }

    #[test]
    fn ler_ausente_devolve_none() {
        assert!(CofreEmMemoria::novo().ler("nao-existe").unwrap().is_none());
    }

    #[test]
    fn remover_ausente_e_ok() {
        assert!(CofreEmMemoria::novo().remover("nao-existe").is_ok());
    }

    #[test]
    fn guardar_sobrescreve_o_valor_anterior() {
        let cofre = CofreEmMemoria::novo();
        cofre.guardar(CHAVE_AUDITORIA, b"um").unwrap();
        cofre.guardar(CHAVE_AUDITORIA, b"dois").unwrap();
        assert_eq!(
            cofre
                .ler(CHAVE_AUDITORIA)
                .unwrap()
                .as_deref()
                .map(Vec::as_slice),
            Some(b"dois".as_slice())
        );
    }

    #[test]
    fn nomes_diferentes_nao_se_misturam() {
        let cofre = CofreEmMemoria::novo();
        cofre.guardar(CHAVE_REFRESH, b"a").unwrap();
        cofre.guardar(CHAVE_BIOMETRIA, b"b").unwrap();
        cofre.remover(CHAVE_REFRESH).unwrap();
        assert!(cofre.ler(CHAVE_BIOMETRIA).unwrap().is_some());
    }

    /// Teste manual: `EVO_TESTAR_KEYRING=1 cargo test acesso_local::cofre_so` no Windows ou macOS.
    /// Sem a variável, retorna cedo. Em Linux não há cofre configurado, então só faz sentido no SO alvo.
    #[test]
    fn keyring_do_so_guarda_le_e_remove() {
        if std::env::var("EVO_TESTAR_KEYRING").as_deref() != Ok("1") {
            return;
        }
        let cofre = KeyringCofre;
        let nome = "teste_manual_evo";
        let valor: Vec<u8> = (0u8..=255).collect();
        cofre.guardar(nome, &valor).unwrap();
        assert_eq!(
            cofre.ler(nome).unwrap().as_deref().map(Vec::as_slice),
            Some(valor.as_slice())
        );
        cofre.remover(nome).unwrap();
        assert!(cofre.ler(nome).unwrap().is_none());
        assert!(cofre.remover(nome).is_ok());
    }
}
