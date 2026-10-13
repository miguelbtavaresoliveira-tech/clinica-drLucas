//! Estado que precisa existir antes do desbloqueio (fora do banco cifrado), em `acesso_local.json`.
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::cripto::{DekEmbrulhada, ParametrosArgon2};
use super::erros::ErroDeAcesso;

pub const NOME_DO_ARQUIVO: &str = "acesso_local.json";
const NOME_TEMPORARIO: &str = "acesso_local.json.tmp";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RegistroPendente {
    pub tipo: String,
    pub ocorrido_em: DateTime<Utc>,
    pub detalhe: BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Kdf {
    /// Sempre `"argon2id"`.
    pub algoritmo: String,
    pub parametros: ParametrosArgon2,
    pub salt_b64: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EstadoPersistido {
    pub versao: u32,
    pub kdf: Option<Kdf>,
    pub dek_por_senha: Option<DekEmbrulhada>,
    pub dek_por_biometria: Option<DekEmbrulhada>,
    pub falhas_consecutivas: u32,
    pub ultima_falha_em: Option<DateTime<Utc>>,
    pub exige_login_completo: bool,
    pub max_falhas_desbloqueio_local: u32,
    pub dispositivo_id: Option<String>,
    pub revogado: bool,
    pub eventos_pendentes: u64,
    pub auditoria_pendente: Vec<RegistroPendente>,
}

impl Default for EstadoPersistido {
    fn default() -> Self {
        Self {
            versao: 1,
            kdf: None,
            dek_por_senha: None,
            dek_por_biometria: None,
            falhas_consecutivas: 0,
            ultima_falha_em: None,
            exige_login_completo: false,
            max_falhas_desbloqueio_local: 10,
            dispositivo_id: None,
            revogado: false,
            eventos_pendentes: 0,
            auditoria_pendente: Vec::new(),
        }
    }
}

/// Arquivo ausente → `Default`. JSON inválido → `Interno`, sem apagar o arquivo (RN-28).
pub fn ler(diretorio: &Path) -> Result<EstadoPersistido, ErroDeAcesso> {
    let caminho = diretorio.join(NOME_DO_ARQUIVO);
    match fs::read(&caminho) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| ErroDeAcesso::Interno),
        Err(erro) if erro.kind() == std::io::ErrorKind::NotFound => Ok(EstadoPersistido::default()),
        Err(_) => Err(ErroDeAcesso::Interno),
    }
}

/// Escrita atômica: `.tmp` → fsync → rename. Uma queda de energia nunca deixa o arquivo truncado.
pub fn salvar(diretorio: &Path, estado: &EstadoPersistido) -> Result<(), ErroDeAcesso> {
    let conteudo = serde_json::to_vec_pretty(estado).map_err(|_| ErroDeAcesso::Interno)?;
    fs::create_dir_all(diretorio).map_err(|_| ErroDeAcesso::Interno)?;
    let temporario = diretorio.join(NOME_TEMPORARIO);
    let destino = diretorio.join(NOME_DO_ARQUIVO);
    let resultado = (|| -> std::io::Result<()> {
        let mut arquivo = File::create(&temporario)?;
        arquivo.write_all(&conteudo)?;
        arquivo.sync_all()?;
        drop(arquivo);
        fs::rename(&temporario, &destino)
    })();
    if resultado.is_err() {
        let _ = fs::remove_file(&temporario);
        return Err(ErroDeAcesso::Interno);
    }
    Ok(())
}

pub fn atraso_em_segundos(falhas: u32) -> u64 {
    match falhas {
        0..=2 => 0,
        3 => 5,
        4 => 15,
        5 => 30,
        6 => 60,
        7 => 120,
        8 => 300,
        _ => 600,
    }
}

/// Quanto falta para uma nova tentativa. Relógio que voltou no tempo → atraso inteiro.
pub fn segundos_restantes(estado: &EstadoPersistido, agora: DateTime<Utc>) -> u64 {
    let Some(ultima) = estado.ultima_falha_em else {
        return 0;
    };
    let atraso = atraso_em_segundos(estado.falhas_consecutivas);
    let passados = (agora - ultima).num_seconds();
    match u64::try_from(passados) {
        Ok(passados) => atraso.saturating_sub(passados),
        Err(_) => atraso,
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use chrono::{Duration, TimeZone};
    use tempfile::tempdir;

    fn instante() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap()
    }

    #[test]
    fn arquivo_ausente_devolve_o_padrao() {
        let pasta = tempdir().unwrap();
        let estado = ler(pasta.path()).unwrap();
        assert_eq!(estado, EstadoPersistido::default());
        assert_eq!(estado.versao, 1);
        assert_eq!(estado.max_falhas_desbloqueio_local, 10);
    }

    #[test]
    fn salvar_e_ler_devolve_o_mesmo_estado() {
        let pasta = tempdir().unwrap();
        let mut detalhe = BTreeMap::new();
        detalhe.insert("tentativa".to_owned(), serde_json::json!(3));
        let estado = EstadoPersistido {
            kdf: Some(Kdf {
                algoritmo: "argon2id".to_owned(),
                parametros: ParametrosArgon2 {
                    m_kib: 65_536,
                    t: 3,
                    p: 1,
                },
                salt_b64: "c2FsdA==".to_owned(),
            }),
            dek_por_senha: Some(DekEmbrulhada {
                nonce_b64: "bg==".to_owned(),
                cifrado_b64: "Yw==".to_owned(),
            }),
            falhas_consecutivas: 2,
            ultima_falha_em: Some(instante()),
            dispositivo_id: Some("disp-1".to_owned()),
            eventos_pendentes: 7,
            auditoria_pendente: vec![RegistroPendente {
                tipo: "desbloqueio_falhou".to_owned(),
                ocorrido_em: instante(),
                detalhe,
            }],
            ..EstadoPersistido::default()
        };
        salvar(pasta.path(), &estado).unwrap();
        assert_eq!(ler(pasta.path()).unwrap(), estado);
    }

    #[test]
    fn contador_de_falhas_persiste_apos_reinicio() {
        let pasta = tempdir().unwrap();
        let estado = EstadoPersistido {
            falhas_consecutivas: 4,
            ultima_falha_em: Some(instante()),
            ..EstadoPersistido::default()
        };
        salvar(pasta.path(), &estado).unwrap();
        let depois_do_reinicio = ler(pasta.path()).unwrap();
        assert_eq!(depois_do_reinicio.falhas_consecutivas, 4);
        assert_eq!(depois_do_reinicio.ultima_falha_em, Some(instante()));
    }

    #[test]
    fn json_corrompido_falha_sem_apagar_o_arquivo() {
        let pasta = tempdir().unwrap();
        let caminho = pasta.path().join(NOME_DO_ARQUIVO);
        fs::write(&caminho, b"{ isto nao e json").unwrap();
        assert!(matches!(ler(pasta.path()), Err(ErroDeAcesso::Interno)));
        assert!(caminho.exists());
        assert_eq!(fs::read(&caminho).unwrap(), b"{ isto nao e json");
    }

    #[test]
    fn nao_sobra_arquivo_temporario_apos_salvar() {
        let pasta = tempdir().unwrap();
        salvar(pasta.path(), &EstadoPersistido::default()).unwrap();
        salvar(pasta.path(), &EstadoPersistido::default()).unwrap();
        assert!(!pasta.path().join(NOME_TEMPORARIO).exists());
        assert!(pasta.path().join(NOME_DO_ARQUIVO).exists());
    }

    #[test]
    fn salvar_cria_o_diretorio_que_nao_existe() {
        let pasta = tempdir().unwrap();
        let subpasta = pasta.path().join("novo").join("dados");
        salvar(&subpasta, &EstadoPersistido::default()).unwrap();
        assert!(subpasta.join(NOME_DO_ARQUIVO).exists());
    }

    #[test]
    fn tabela_de_atraso_completa() {
        let tabela: [(u32, u64); 12] = [
            (0, 0),
            (1, 0),
            (2, 0),
            (3, 5),
            (4, 15),
            (5, 30),
            (6, 60),
            (7, 120),
            (8, 300),
            (9, 600),
            (10, 600),
            (u32::MAX, 600),
        ];
        for (falhas, esperado) in tabela {
            assert_eq!(atraso_em_segundos(falhas), esperado, "falhas = {falhas}");
        }
    }

    #[test]
    fn sem_falha_registrada_nao_ha_espera() {
        assert_eq!(
            segundos_restantes(&EstadoPersistido::default(), instante()),
            0
        );
    }

    #[test]
    fn segundos_restantes_desconta_o_tempo_passado() {
        let estado = EstadoPersistido {
            falhas_consecutivas: 5,
            ultima_falha_em: Some(instante()),
            ..EstadoPersistido::default()
        };
        assert_eq!(segundos_restantes(&estado, instante()), 30);
        assert_eq!(
            segundos_restantes(&estado, instante() + Duration::seconds(10)),
            20
        );
        assert_eq!(
            segundos_restantes(&estado, instante() + Duration::seconds(30)),
            0
        );
        assert_eq!(
            segundos_restantes(&estado, instante() + Duration::seconds(9_999)),
            0
        );
    }

    #[test]
    fn relogio_retrocedido_devolve_o_atraso_inteiro() {
        let estado = EstadoPersistido {
            falhas_consecutivas: 6,
            ultima_falha_em: Some(instante()),
            ..EstadoPersistido::default()
        };
        assert_eq!(
            segundos_restantes(&estado, instante() - Duration::hours(2)),
            60
        );
    }
}
