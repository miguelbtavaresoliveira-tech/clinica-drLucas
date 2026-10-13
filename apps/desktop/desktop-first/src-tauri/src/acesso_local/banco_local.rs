//! Banco local SQLCipher, aberto com a DEK. Tabelas do contexto: `estado_de_acesso` e `auditoria_local`.
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, params};
use zeroize::Zeroizing;

use super::erros::ErroDeAcesso;

pub const NOME_DO_BANCO: &str = "dados.db";

const VERSAO_ATUAL: i64 = 1;

const MIGRACAO_V1: &str = "
CREATE TABLE estado_de_acesso (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE auditoria_local (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, ocorrido_em TEXT NOT NULL, tipo TEXT NOT NULL,
  usuario_id TEXT NOT NULL, dispositivo_id TEXT NOT NULL, detalhe TEXT NOT NULL, hash_anterior TEXT, hash TEXT NOT NULL,
  assinatura TEXT NOT NULL, enviado INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER auditoria_local_sem_delete BEFORE DELETE ON auditoria_local BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER auditoria_local_imutavel BEFORE UPDATE OF id, ocorrido_em, tipo, usuario_id, dispositivo_id, detalhe, hash_anterior, hash, assinatura
  ON auditoria_local BEGIN SELECT RAISE(ABORT, 'append-only'); END;
PRAGMA user_version = 1;
";

pub struct BancoLocal {
    conexao: Connection,
}

impl BancoLocal {
    pub fn abrir(diretorio: &Path, dek: &[u8; 32]) -> Result<BancoLocal, ErroDeAcesso> {
        let conexao =
            Connection::open(diretorio.join(NOME_DO_BANCO)).map_err(|_| ErroDeAcesso::Interno)?;

        let hex_da_chave = Zeroizing::new(hex::encode(dek));
        let comando_de_chave =
            Zeroizing::new(format!("PRAGMA key = \"x'{}'\";", hex_da_chave.as_str()));
        conexao
            .execute_batch(&comando_de_chave)
            .map_err(|_| ErroDeAcesso::Interno)?;
        conexao
            .execute_batch("PRAGMA cipher_memory_security = ON;")
            .map_err(|_| ErroDeAcesso::Interno)?;

        // Chave errada ou arquivo que não é o nosso banco falham aqui.
        conexao
            .query_row("SELECT count(*) FROM sqlite_master", [], |linha| {
                linha.get::<_, i64>(0)
            })
            .map_err(|_| ErroDeAcesso::Interno)?;

        conexao
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|_| ErroDeAcesso::Interno)?;
        conexao
            .query_row("PRAGMA journal_mode = WAL", [], |linha| {
                linha.get::<_, String>(0)
            })
            .map_err(|_| ErroDeAcesso::Interno)?;

        let banco = BancoLocal { conexao };
        banco.migrar()?;
        Ok(banco)
    }

    fn migrar(&self) -> Result<(), ErroDeAcesso> {
        let versao: i64 = self
            .conexao
            .query_row("PRAGMA user_version", [], |linha| linha.get(0))
            .map_err(|_| ErroDeAcesso::Interno)?;
        if versao < 1 {
            self.conexao
                .execute_batch(&format!("BEGIN;{MIGRACAO_V1}COMMIT;"))
                .map_err(|_| ErroDeAcesso::Interno)?;
        }
        if versao > VERSAO_ATUAL {
            return Err(ErroDeAcesso::Interno);
        }
        Ok(())
    }

    pub fn fechar(self) -> Result<(), ErroDeAcesso> {
        self.conexao.close().map_err(|_| ErroDeAcesso::Interno)
    }

    pub fn ler_valor(&self, chave: &str) -> Result<Option<String>, ErroDeAcesso> {
        self.conexao
            .query_row(
                "SELECT valor FROM estado_de_acesso WHERE chave = ?1",
                params![chave],
                |linha| linha.get(0),
            )
            .optional()
            .map_err(|_| ErroDeAcesso::Interno)
    }

    pub fn gravar_valor(&self, chave: &str, valor: &str) -> Result<(), ErroDeAcesso> {
        self.conexao
            .execute(
                "INSERT INTO estado_de_acesso (chave, valor) VALUES (?1, ?2)
                 ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
                params![chave, valor],
            )
            .map(|_| ())
            .map_err(|_| ErroDeAcesso::Interno)
    }

    /// Uso interno do módulo (auditoria assinada).
    pub fn conexao(&self) -> &Connection {
        &self.conexao
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    const DEK_A: [u8; 32] = [0x11; 32];
    const DEK_B: [u8; 32] = [0x22; 32];

    fn inserir_auditoria(banco: &BancoLocal) {
        banco
            .conexao()
            .execute(
                "INSERT INTO auditoria_local (id, ocorrido_em, tipo, usuario_id, dispositivo_id, detalhe, hash, assinatura)
                 VALUES ('a1', '2026-10-13T12:00:00Z', 'x', 'u', 'd', '{}', 'h', 's')",
                [],
            )
            .unwrap();
    }

    #[test]
    fn gravar_fechar_reabrir_com_a_mesma_dek_le_o_valor() {
        let pasta = tempdir().unwrap();
        let banco = BancoLocal::abrir(pasta.path(), &DEK_A).unwrap();
        assert_eq!(banco.ler_valor("marca_dagua").unwrap(), None);
        banco
            .gravar_valor("marca_dagua", "2026-10-13T12:00:00Z")
            .unwrap();
        banco
            .gravar_valor("marca_dagua", "2026-10-14T12:00:00Z")
            .unwrap();
        banco.fechar().unwrap();

        let reaberto = BancoLocal::abrir(pasta.path(), &DEK_A).unwrap();
        assert_eq!(
            reaberto.ler_valor("marca_dagua").unwrap().as_deref(),
            Some("2026-10-14T12:00:00Z")
        );
    }

    #[test]
    fn reabrir_com_outra_dek_falha() {
        let pasta = tempdir().unwrap();
        BancoLocal::abrir(pasta.path(), &DEK_A)
            .unwrap()
            .fechar()
            .unwrap();
        assert!(matches!(
            BancoLocal::abrir(pasta.path(), &DEK_B),
            Err(ErroDeAcesso::Interno)
        ));
    }

    #[test]
    fn arquivo_e_cifrado_e_nao_tem_o_cabecalho_do_sqlite() {
        let pasta = tempdir().unwrap();
        let banco = BancoLocal::abrir(pasta.path(), &DEK_A).unwrap();
        banco
            .gravar_valor("usuario", "texto-que-nao-pode-aparecer-em-claro")
            .unwrap();
        banco.fechar().unwrap();
        let bytes = fs::read(pasta.path().join(NOME_DO_BANCO)).unwrap();
        assert!(bytes.len() >= 16);
        assert_ne!(&bytes[..16], b"SQLite format 3\0");
        let texto = String::from_utf8_lossy(&bytes);
        assert!(!texto.contains("texto-que-nao-pode-aparecer-em-claro"));
    }

    #[test]
    fn auditoria_nao_aceita_update_de_hash_nem_delete() {
        let pasta = tempdir().unwrap();
        let banco = BancoLocal::abrir(pasta.path(), &DEK_A).unwrap();
        inserir_auditoria(&banco);
        assert!(
            banco
                .conexao()
                .execute(
                    "UPDATE auditoria_local SET hash = 'outro' WHERE id = 'a1'",
                    []
                )
                .is_err()
        );
        assert!(
            banco
                .conexao()
                .execute("DELETE FROM auditoria_local", [])
                .is_err()
        );
        let total: i64 = banco
            .conexao()
            .query_row("SELECT count(*) FROM auditoria_local", [], |l| l.get(0))
            .unwrap();
        assert_eq!(total, 1);
    }

    #[test]
    fn auditoria_aceita_marcar_como_enviado() {
        let pasta = tempdir().unwrap();
        let banco = BancoLocal::abrir(pasta.path(), &DEK_A).unwrap();
        inserir_auditoria(&banco);
        let alteradas = banco
            .conexao()
            .execute("UPDATE auditoria_local SET enviado = 1 WHERE id = 'a1'", [])
            .unwrap();
        assert_eq!(alteradas, 1);
    }

    #[test]
    fn migracao_e_idempotente() {
        let pasta = tempdir().unwrap();
        BancoLocal::abrir(pasta.path(), &DEK_A)
            .unwrap()
            .fechar()
            .unwrap();
        let segundo = BancoLocal::abrir(pasta.path(), &DEK_A).unwrap();
        let versao: i64 = segundo
            .conexao()
            .query_row("PRAGMA user_version", [], |l| l.get(0))
            .unwrap();
        assert_eq!(versao, 1);
    }
}
