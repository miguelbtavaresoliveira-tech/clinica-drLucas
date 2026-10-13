//! Hierarquia de chaves local: senha mestre → KEK (Argon2id) → embrulha a DEK (AES-256-GCM).
use std::time::Instant;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use rand::RngCore;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use super::erros::ErroDeAcesso;

pub type Chave = Zeroizing<[u8; 32]>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParametrosArgon2 {
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

/// 64 MiB — mais forte que o servidor (DT-09).
pub const PARAMETROS_MINIMOS: ParametrosArgon2 = ParametrosArgon2 {
    m_kib: 65_536,
    t: 3,
    p: 1,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DekEmbrulhada {
    pub nonce_b64: String,
    pub cifrado_b64: String,
}

pub const AAD_DEK: &[u8] = b"evo-acesso-local-dek-v1";

const TAMANHO_NONCE: usize = 12;
const LIMITE_DE_PASSES: u32 = 10;

pub fn gerar_dek() -> Chave {
    let mut chave = Zeroizing::new([0u8; 32]);
    OsRng.fill_bytes(chave.as_mut());
    chave
}

pub fn gerar_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    salt
}

pub fn derivar_kek(
    senha: &str,
    salt: &[u8],
    parametros: ParametrosArgon2,
) -> Result<Chave, ErroDeAcesso> {
    let params = Params::new(parametros.m_kib, parametros.t, parametros.p, Some(32))
        .map_err(|_| ErroDeAcesso::Interno)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut saida = Zeroizing::new([0u8; 32]);
    argon2
        .hash_password_into(senha.as_bytes(), salt, saida.as_mut())
        .map_err(|_| ErroDeAcesso::Interno)?;
    Ok(saida)
}

pub fn embrulhar(dek: &[u8; 32], kek: &[u8; 32]) -> Result<DekEmbrulhada, ErroDeAcesso> {
    let cifra = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(kek));
    let mut nonce = [0u8; TAMANHO_NONCE];
    OsRng.fill_bytes(&mut nonce);
    let cifrado = cifra
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: dek,
                aad: AAD_DEK,
            },
        )
        .map_err(|_| ErroDeAcesso::Interno)?;
    Ok(DekEmbrulhada {
        nonce_b64: STANDARD.encode(nonce),
        cifrado_b64: STANDARD.encode(cifrado),
    })
}

/// Falha de autenticação (senha errada ou dado adulterado) → `None`.
pub fn desembrulhar(embrulhada: &DekEmbrulhada, kek: &[u8; 32]) -> Option<Chave> {
    let nonce = STANDARD.decode(&embrulhada.nonce_b64).ok()?;
    if nonce.len() != TAMANHO_NONCE {
        return None;
    }
    let cifrado = STANDARD.decode(&embrulhada.cifrado_b64).ok()?;
    let cifra = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(kek));
    let aberto = Zeroizing::new(
        cifra
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &cifrado,
                    aad: AAD_DEK,
                },
            )
            .ok()?,
    );
    let mut dek = Zeroizing::new([0u8; 32]);
    if aberto.len() != dek.len() {
        return None;
    }
    dek.copy_from_slice(&aberto);
    Some(dek)
}

/// Sobe `t` a partir de `PARAMETROS_MINIMOS` até a derivação levar pelo menos `alvo_min_ms`.
/// Nunca retorna abaixo do mínimo. O teto de tempo não reduz parâmetros: o mínimo prevalece.
pub fn calibrar(alvo_min_ms: u128, _alvo_max_ms: u128) -> ParametrosArgon2 {
    let mut parametros = PARAMETROS_MINIMOS;
    let salt = [7u8; 16];
    loop {
        let inicio = Instant::now();
        let medido = derivar_kek("calibracao-evo", &salt, parametros);
        let demorou = inicio.elapsed().as_millis();
        if medido.is_err() || demorou >= alvo_min_ms || parametros.t >= LIMITE_DE_PASSES {
            return parametros;
        }
        parametros.t += 1;
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    const PARAMETROS_DE_TESTE: ParametrosArgon2 = ParametrosArgon2 {
        m_kib: 8192,
        t: 1,
        p: 1,
    };

    fn kek_de(senha: &str, salt: &[u8]) -> Chave {
        derivar_kek(senha, salt, PARAMETROS_DE_TESTE).unwrap()
    }

    #[test]
    fn embrulhar_e_desembrulhar_devolve_a_mesma_dek() {
        let dek = gerar_dek();
        let kek = kek_de("senha-mestre-bem-forte", &[1u8; 16]);
        let embrulhada = embrulhar(&dek, &kek).unwrap();
        let aberta = desembrulhar(&embrulhada, &kek).unwrap();
        assert_eq!(*aberta, *dek);
    }

    #[test]
    fn kek_de_senha_errada_nao_abre() {
        let dek = gerar_dek();
        let salt = [2u8; 16];
        let embrulhada = embrulhar(&dek, &kek_de("senha-correta-123", &salt)).unwrap();
        assert!(desembrulhar(&embrulhada, &kek_de("senha-errada-1234", &salt)).is_none());
    }

    #[test]
    fn alterar_um_byte_do_cifrado_falha_a_autenticacao() {
        let dek = gerar_dek();
        let kek = kek_de("senha-mestre-bem-forte", &[3u8; 16]);
        let mut embrulhada = embrulhar(&dek, &kek).unwrap();
        let mut bytes = STANDARD.decode(&embrulhada.cifrado_b64).unwrap();
        bytes[0] ^= 0x01;
        embrulhada.cifrado_b64 = STANDARD.encode(bytes);
        assert!(desembrulhar(&embrulhada, &kek).is_none());
    }

    #[test]
    fn base64_invalido_e_nonce_de_tamanho_errado_devolvem_none() {
        let kek = kek_de("senha-mestre-bem-forte", &[3u8; 16]);
        let invalida = DekEmbrulhada {
            nonce_b64: "%%%".to_owned(),
            cifrado_b64: "%%%".to_owned(),
        };
        assert!(desembrulhar(&invalida, &kek).is_none());
        let nonce_curto = DekEmbrulhada {
            nonce_b64: STANDARD.encode([0u8; 4]),
            cifrado_b64: STANDARD.encode([0u8; 48]),
        };
        assert!(desembrulhar(&nonce_curto, &kek).is_none());
    }

    #[test]
    fn duas_embrulhadas_da_mesma_dek_diferem_pelo_nonce() {
        let dek = gerar_dek();
        let kek = kek_de("senha-mestre-bem-forte", &[4u8; 16]);
        let a = embrulhar(&dek, &kek).unwrap();
        let b = embrulhar(&dek, &kek).unwrap();
        assert_ne!(a.nonce_b64, b.nonce_b64);
        assert_ne!(a.cifrado_b64, b.cifrado_b64);
    }

    #[test]
    fn mesma_senha_e_mesmo_salt_geram_a_mesma_kek() {
        let salt = [5u8; 16];
        assert_eq!(
            *kek_de("senha-mestre-bem-forte", &salt),
            *kek_de("senha-mestre-bem-forte", &salt)
        );
    }

    #[test]
    fn salts_diferentes_geram_keks_diferentes() {
        assert_ne!(
            *kek_de("senha-mestre-bem-forte", &[6u8; 16]),
            *kek_de("senha-mestre-bem-forte", &[7u8; 16])
        );
    }

    #[test]
    fn deks_e_salts_gerados_nao_se_repetem() {
        assert_ne!(*gerar_dek(), *gerar_dek());
        assert_ne!(gerar_salt(), gerar_salt());
    }

    #[test]
    fn calibrar_nunca_retorna_abaixo_do_minimo() {
        let parametros = calibrar(0, 1);
        assert!(parametros.m_kib >= PARAMETROS_MINIMOS.m_kib);
        assert!(parametros.t >= PARAMETROS_MINIMOS.t);
        assert!(parametros.p >= PARAMETROS_MINIMOS.p);
    }

    #[test]
    fn calibrar_com_alvo_inalcancavel_para_no_limite_de_passes() {
        let parametros = calibrar(u128::MAX, u128::MAX);
        assert_eq!(parametros.t, LIMITE_DE_PASSES);
    }
}
