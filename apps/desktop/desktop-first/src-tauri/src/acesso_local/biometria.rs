//! Porta `BiometriaLocal` (RN-25). Até o spike (TASK-072) ser validado em hardware, vale o plano B:
//! a única implementação de produção é `BiometriaIndisponivel` e a senha mestre é o único caminho.
use super::erros::ErroDeAcesso;

pub trait BiometriaLocal: Send + Sync {
    /// Há sensor ou credencial biométrica utilizável neste computador?
    fn disponivel(&self) -> bool;
    /// Mostra o prompt do SO. `Ok(true)` só quando o usuário foi reconhecido.
    fn autenticar(&self, motivo: &str) -> Result<bool, ErroDeAcesso>;
}

pub struct BiometriaIndisponivel;

impl BiometriaLocal for BiometriaIndisponivel {
    fn disponivel(&self) -> bool {
        false
    }

    fn autenticar(&self, _motivo: &str) -> Result<bool, ErroDeAcesso> {
        Err(ErroDeAcesso::BiometriaIndisponivel)
    }
}

/// Dublê de teste: `disponivel` fixo e resposta ajustável (aprovar ou cancelar).
#[cfg(test)]
pub struct BiometriaFalsa {
    pub disponivel: bool,
    pub aprova: std::sync::atomic::AtomicBool,
}

#[cfg(test)]
impl BiometriaFalsa {
    pub fn nova(disponivel: bool, aprova: bool) -> Self {
        Self {
            disponivel,
            aprova: std::sync::atomic::AtomicBool::new(aprova),
        }
    }

    pub fn definir_aprovacao(&self, aprova: bool) {
        self.aprova
            .store(aprova, std::sync::atomic::Ordering::SeqCst);
    }
}

#[cfg(test)]
impl BiometriaLocal for BiometriaFalsa {
    fn disponivel(&self) -> bool {
        self.disponivel
    }

    fn autenticar(&self, _motivo: &str) -> Result<bool, ErroDeAcesso> {
        if !self.disponivel {
            return Err(ErroDeAcesso::BiometriaIndisponivel);
        }
        Ok(self.aprova.load(std::sync::atomic::Ordering::SeqCst))
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn a_implementacao_padrao_esta_indisponivel() {
        assert!(!BiometriaIndisponivel.disponivel());
        assert!(matches!(
            BiometriaIndisponivel.autenticar("x"),
            Err(ErroDeAcesso::BiometriaIndisponivel)
        ));
    }

    #[test]
    fn o_duble_de_teste_segue_a_configuracao() {
        let falsa = BiometriaFalsa::nova(true, true);
        assert!(falsa.autenticar("x").unwrap());
        falsa.definir_aprovacao(false);
        assert!(!falsa.autenticar("x").unwrap());
        assert!(BiometriaFalsa::nova(false, true).autenticar("x").is_err());
    }
}
