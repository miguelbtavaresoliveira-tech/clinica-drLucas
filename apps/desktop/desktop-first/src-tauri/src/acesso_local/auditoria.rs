//! Auditoria local encadeada por hash e assinada com Ed25519 (UL-11, RN-37, RN-39, DT-13, D-009).
//! O formato canônico é idêntico ao do servidor: os mesmos bytes nos dois lados.
use std::collections::BTreeMap;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{DateTime, SecondsFormat, Utc};
use ed25519_dalek::{Signer, SigningKey};
use rand::RngCore;
use rand::rngs::OsRng;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use super::banco_local::BancoLocal;
use super::cofre_so::{CHAVE_AUDITORIA, CofreDeChavesDoSo};
use super::erros::ErroDeAcesso;

/// Tipos aceitos pelo servidor (`TIPOS_DE_AUDITORIA_DO_APP`).
pub const TIPOS_DE_AUDITORIA_DO_APP: [&str; 10] = [
    "desbloqueio-local-configurado",
    "desbloqueio-local-ok",
    "desbloqueio-local-falhou",
    "senha-mestre-alterada",
    "biometria-ativada",
    "biometria-desativada",
    "app-bloqueado",
    "desbloqueio-local-redefinido",
    "modo-somente-leitura",
    "reautenticacao-sensivel",
];

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ValorDeDetalhe {
    Texto(String),
    Inteiro(i64),
    Booleano(bool),
    Nulo,
}

impl From<&serde_json::Value> for ValorDeDetalhe {
    fn from(valor: &serde_json::Value) -> Self {
        match valor {
            serde_json::Value::String(texto) => Self::Texto(texto.clone()),
            serde_json::Value::Bool(b) => Self::Booleano(*b),
            serde_json::Value::Null => Self::Nulo,
            serde_json::Value::Number(numero) => numero
                .as_i64()
                .map_or_else(|| Self::Texto(numero.to_string()), Self::Inteiro),
            outro => Self::Texto(outro.to_string()),
        }
    }
}

pub type Detalhe = BTreeMap<String, ValorDeDetalhe>;

/// Formato exato do corpo de `/auditoria/lote`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistroLocal {
    pub id: String,
    pub ocorrido_em: String,
    pub tipo: String,
    pub usuario_id: String,
    pub dispositivo_id: String,
    pub detalhe: Detalhe,
    pub hash_anterior: Option<String>,
    pub hash: String,
    pub assinatura: String,
}

pub fn serializar_canonico(
    id: &str,
    ocorrido_em: &str,
    tipo: &str,
    usuario_id: &str,
    dispositivo_id: &str,
    detalhe: &Detalhe,
    hash_anterior: Option<&str>,
) -> Result<String, ErroDeAcesso> {
    // `BTreeMap` já ordena as chaves; o JSON é compacto, como `JSON.stringify` no servidor.
    let detalhe = serde_json::to_string(detalhe).map_err(|_| ErroDeAcesso::Interno)?;
    Ok([
        "v1",
        id,
        ocorrido_em,
        tipo,
        usuario_id,
        dispositivo_id,
        &detalhe,
        hash_anterior.unwrap_or(""),
    ]
    .join("|"))
}

pub fn formatar_instante(instante: DateTime<Utc>) -> String {
    instante.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Lê a semente do cofre do SO; se não existir, gera uma nova e a guarda.
pub fn chave_de_assinatura(cofre: &dyn CofreDeChavesDoSo) -> Result<SigningKey, ErroDeAcesso> {
    if let Some(guardada) = cofre.ler(CHAVE_AUDITORIA)? {
        let semente = Zeroizing::new(
            <[u8; 32]>::try_from(guardada.as_slice()).map_err(|_| ErroDeAcesso::Interno)?,
        );
        return Ok(SigningKey::from_bytes(&semente));
    }
    let mut semente = Zeroizing::new([0u8; 32]);
    OsRng.fill_bytes(semente.as_mut());
    cofre.guardar(CHAVE_AUDITORIA, semente.as_slice())?;
    Ok(SigningKey::from_bytes(&semente))
}

pub fn chave_publica_b64(cofre: &dyn CofreDeChavesDoSo) -> Result<String, ErroDeAcesso> {
    let chave = chave_de_assinatura(cofre)?;
    Ok(STANDARD.encode(chave.verifying_key().to_bytes()))
}

#[allow(clippy::too_many_arguments)]
fn montar_registro(
    chave: &SigningKey,
    id: String,
    ocorrido_em: DateTime<Utc>,
    tipo: &str,
    usuario_id: &str,
    dispositivo_id: &str,
    detalhe: Detalhe,
    hash_anterior: Option<String>,
) -> Result<RegistroLocal, ErroDeAcesso> {
    let ocorrido_em = formatar_instante(ocorrido_em);
    let canonico = serializar_canonico(
        &id,
        &ocorrido_em,
        tipo,
        usuario_id,
        dispositivo_id,
        &detalhe,
        hash_anterior.as_deref(),
    )?;
    let hash = hex::encode(Sha256::digest(canonico.as_bytes()));
    let assinatura = STANDARD.encode(chave.sign(hash.as_bytes()).to_bytes());
    Ok(RegistroLocal {
        id,
        ocorrido_em,
        tipo: tipo.to_owned(),
        usuario_id: usuario_id.to_owned(),
        dispositivo_id: dispositivo_id.to_owned(),
        detalhe,
        hash_anterior,
        hash,
        assinatura,
    })
}

/// Acrescenta um registro à cadeia: `hash_anterior` é o hash do último por `seq`.
pub fn registrar(
    banco: &BancoLocal,
    chave: &SigningKey,
    tipo: &str,
    detalhe: Detalhe,
    ocorrido_em: DateTime<Utc>,
    usuario_id: &str,
    dispositivo_id: &str,
) -> Result<RegistroLocal, ErroDeAcesso> {
    let hash_anterior: Option<String> = banco
        .conexao()
        .query_row(
            "SELECT hash FROM auditoria_local ORDER BY seq DESC LIMIT 1",
            [],
            |linha| linha.get(0),
        )
        .optional()
        .map_err(|_| ErroDeAcesso::Interno)?;
    let registro = montar_registro(
        chave,
        uuid::Uuid::new_v4().to_string(),
        ocorrido_em,
        tipo,
        usuario_id,
        dispositivo_id,
        detalhe,
        hash_anterior,
    )?;
    let detalhe_json =
        serde_json::to_string(&registro.detalhe).map_err(|_| ErroDeAcesso::Interno)?;
    banco
        .conexao()
        .execute(
            "INSERT INTO auditoria_local
               (id, ocorrido_em, tipo, usuario_id, dispositivo_id, detalhe, hash_anterior, hash, assinatura)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                registro.id,
                registro.ocorrido_em,
                registro.tipo,
                registro.usuario_id,
                registro.dispositivo_id,
                detalhe_json,
                registro.hash_anterior,
                registro.hash,
                registro.assinatura
            ],
        )
        .map_err(|_| ErroDeAcesso::Interno)?;
    Ok(registro)
}

/// Registros ainda não enviados, na ordem em que foram gravados.
pub fn pendentes(banco: &BancoLocal, limite: usize) -> Result<Vec<RegistroLocal>, ErroDeAcesso> {
    let limite = i64::try_from(limite).map_err(|_| ErroDeAcesso::Interno)?;
    let mut consulta = banco
        .conexao()
        .prepare(
            "SELECT id, ocorrido_em, tipo, usuario_id, dispositivo_id, detalhe, hash_anterior, hash, assinatura
             FROM auditoria_local WHERE enviado = 0 ORDER BY seq ASC LIMIT ?1",
        )
        .map_err(|_| ErroDeAcesso::Interno)?;
    let linhas = consulta
        .query_map(params![limite], |linha| {
            Ok((
                linha.get::<_, String>(0)?,
                linha.get::<_, String>(1)?,
                linha.get::<_, String>(2)?,
                linha.get::<_, String>(3)?,
                linha.get::<_, String>(4)?,
                linha.get::<_, String>(5)?,
                linha.get::<_, Option<String>>(6)?,
                linha.get::<_, String>(7)?,
                linha.get::<_, String>(8)?,
            ))
        })
        .map_err(|_| ErroDeAcesso::Interno)?;
    let mut registros = Vec::new();
    for linha in linhas {
        let (
            id,
            ocorrido_em,
            tipo,
            usuario_id,
            dispositivo_id,
            detalhe,
            hash_anterior,
            hash,
            assinatura,
        ) = linha.map_err(|_| ErroDeAcesso::Interno)?;
        registros.push(RegistroLocal {
            id,
            ocorrido_em,
            tipo,
            usuario_id,
            dispositivo_id,
            detalhe: serde_json::from_str(&detalhe).map_err(|_| ErroDeAcesso::Interno)?,
            hash_anterior,
            hash,
            assinatura,
        });
    }
    Ok(registros)
}

pub fn marcar_enviados(banco: &BancoLocal, ids: &[String]) -> Result<(), ErroDeAcesso> {
    let transacao = banco
        .conexao()
        .unchecked_transaction()
        .map_err(|_| ErroDeAcesso::Interno)?;
    for id in ids {
        transacao
            .execute(
                "UPDATE auditoria_local SET enviado = 1 WHERE id = ?1",
                params![id],
            )
            .map_err(|_| ErroDeAcesso::Interno)?;
    }
    transacao.commit().map_err(|_| ErroDeAcesso::Interno)
}

pub fn contar_pendentes(banco: &BancoLocal) -> Result<u64, ErroDeAcesso> {
    let total: i64 = banco
        .conexao()
        .query_row(
            "SELECT count(*) FROM auditoria_local WHERE enviado = 0",
            [],
            |linha| linha.get(0),
        )
        .map_err(|_| ErroDeAcesso::Interno)?;
    u64::try_from(total).map_err(|_| ErroDeAcesso::Interno)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::acesso_local::cofre_so::CofreEmMemoria;
    use chrono::TimeZone;
    use tempfile::{TempDir, tempdir};

    const USUARIO: &str = "11111111-1111-4111-8111-111111111111";
    const DISPOSITIVO: &str = "22222222-2222-4222-8222-222222222222";

    fn cofre_com_semente_do_vetor() -> CofreEmMemoria {
        let cofre = CofreEmMemoria::novo();
        let semente: Vec<u8> = (1u8..=32).collect();
        cofre.guardar(CHAVE_AUDITORIA, &semente).unwrap();
        cofre
    }

    fn banco_de_teste() -> (TempDir, BancoLocal) {
        let pasta = tempdir().unwrap();
        let banco = BancoLocal::abrir(pasta.path(), &[9u8; 32]).unwrap();
        (pasta, banco)
    }

    fn detalhe(pares: &[(&str, ValorDeDetalhe)]) -> Detalhe {
        pares
            .iter()
            .map(|(chave, valor)| ((*chave).to_owned(), valor.clone()))
            .collect()
    }

    fn instante(h: u32, m: u32, s: u32, ms: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 13, h, m, s).unwrap()
            + chrono::Duration::milliseconds(i64::from(ms))
    }

    #[test]
    fn chave_publica_bate_com_o_vetor_d009() {
        let cofre = cofre_com_semente_do_vetor();
        assert_eq!(
            chave_publica_b64(&cofre).unwrap(),
            "ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ="
        );
    }

    #[test]
    fn registro_r1_bate_byte_a_byte_com_o_vetor_d009() {
        let chave = chave_de_assinatura(&cofre_com_semente_do_vetor()).unwrap();
        let r1 = montar_registro(
            &chave,
            "7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01".to_owned(),
            instante(12, 0, 0, 0),
            "desbloqueio-local-ok",
            USUARIO,
            DISPOSITIVO,
            detalhe(&[("metodo", ValorDeDetalhe::Texto("senha".to_owned()))]),
            None,
        )
        .unwrap();
        assert_eq!(r1.ocorrido_em, "2026-10-13T12:00:00.000Z");
        assert_eq!(
            serializar_canonico(
                &r1.id,
                &r1.ocorrido_em,
                &r1.tipo,
                USUARIO,
                DISPOSITIVO,
                &r1.detalhe,
                None
            )
            .unwrap(),
            "v1|7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01|2026-10-13T12:00:00.000Z|desbloqueio-local-ok|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|{\"metodo\":\"senha\"}|"
        );
        assert_eq!(
            r1.hash,
            "b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a"
        );
        assert_eq!(
            r1.assinatura,
            "GF3Oyr16Q05pZ0AsNlDUcFQrJ6s3NYfAjjjn1iD4HI9YY1FkG+YBhkPSKtvbSn9VKXHB+B3g6pEYjLhxMFWlAg=="
        );
    }

    #[test]
    fn registro_r2_bate_byte_a_byte_com_o_vetor_d009() {
        let chave = chave_de_assinatura(&cofre_com_semente_do_vetor()).unwrap();
        // `tentativa` é inserida depois de `metodo`; o BTreeMap ordena as chaves.
        let mut dados = Detalhe::new();
        dados.insert("tentativa".to_owned(), ValorDeDetalhe::Inteiro(3));
        dados.insert(
            "metodo".to_owned(),
            ValorDeDetalhe::Texto("senha".to_owned()),
        );
        let r2 = montar_registro(
            &chave,
            "7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c02".to_owned(),
            instante(12, 5, 30, 250),
            "desbloqueio-local-falhou",
            USUARIO,
            DISPOSITIVO,
            dados,
            Some("b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a".to_owned()),
        )
        .unwrap();
        assert_eq!(r2.ocorrido_em, "2026-10-13T12:05:30.250Z");
        assert_eq!(
            serde_json::to_string(&r2.detalhe).unwrap(),
            "{\"metodo\":\"senha\",\"tentativa\":3}"
        );
        assert_eq!(
            r2.hash,
            "c7edbcc06f8a1c8cc116d7c219e116416d096d1f2b7c5f6a4d1fdb93a415c215"
        );
        assert_eq!(
            r2.assinatura,
            "5fKIHaVqujfDRkxeXhrycN9Uq2Rt4PfWIRmFEoyVAz2gaaV6cUhdlp6PpIOUNwwEZfXyMz67mfVfe54Lr6yqCQ=="
        );
    }

    #[test]
    fn registrar_tres_vezes_encadeia_os_hashes() {
        let (_pasta, banco) = banco_de_teste();
        let chave = chave_de_assinatura(&CofreEmMemoria::novo()).unwrap();
        let registros: Vec<RegistroLocal> = (0..3)
            .map(|i| {
                registrar(
                    &banco,
                    &chave,
                    "app-bloqueado",
                    detalhe(&[("n", ValorDeDetalhe::Inteiro(i))]),
                    instante(12, 0, u32::try_from(i).unwrap(), 0),
                    USUARIO,
                    DISPOSITIVO,
                )
                .unwrap()
            })
            .collect();
        assert_eq!(registros[0].hash_anterior, None);
        assert_eq!(
            registros[1].hash_anterior.as_deref(),
            Some(registros[0].hash.as_str())
        );
        assert_eq!(
            registros[2].hash_anterior.as_deref(),
            Some(registros[1].hash.as_str())
        );
    }

    #[test]
    fn pendentes_e_marcar_enviados() {
        let (_pasta, banco) = banco_de_teste();
        let chave = chave_de_assinatura(&CofreEmMemoria::novo()).unwrap();
        for i in 0..3u32 {
            registrar(
                &banco,
                &chave,
                "app-bloqueado",
                Detalhe::new(),
                instante(12, 0, i, 0),
                USUARIO,
                DISPOSITIVO,
            )
            .unwrap();
        }
        let todos = pendentes(&banco, 100).unwrap();
        assert_eq!(todos.len(), 3);
        assert_eq!(contar_pendentes(&banco).unwrap(), 3);
        assert_eq!(pendentes(&banco, 2).unwrap().len(), 2);

        marcar_enviados(&banco, &[todos[0].id.clone(), todos[1].id.clone()]).unwrap();
        let restantes = pendentes(&banco, 100).unwrap();
        assert_eq!(restantes.len(), 1);
        assert_eq!(restantes[0].id, todos[2].id);
        assert_eq!(contar_pendentes(&banco).unwrap(), 1);
        // O registro lido de volta é idêntico ao gravado.
        assert_eq!(restantes[0], todos[2]);
    }

    #[test]
    fn chave_e_gerada_uma_vez_e_reutilizada() {
        let cofre = CofreEmMemoria::novo();
        let primeira = chave_publica_b64(&cofre).unwrap();
        assert_eq!(chave_publica_b64(&cofre).unwrap(), primeira);
        assert_eq!(cofre.ler(CHAVE_AUDITORIA).unwrap().unwrap().len(), 32);
    }

    #[test]
    fn semente_com_tamanho_errado_e_recusada() {
        let cofre = CofreEmMemoria::novo();
        cofre.guardar(CHAVE_AUDITORIA, b"curta").unwrap();
        assert!(matches!(
            chave_de_assinatura(&cofre),
            Err(ErroDeAcesso::Interno)
        ));
    }

    #[test]
    fn valores_do_servico_convertem_para_o_detalhe() {
        assert_eq!(
            ValorDeDetalhe::from(&serde_json::json!("x")),
            ValorDeDetalhe::Texto("x".to_owned())
        );
        assert_eq!(
            ValorDeDetalhe::from(&serde_json::json!(3)),
            ValorDeDetalhe::Inteiro(3)
        );
        assert_eq!(
            ValorDeDetalhe::from(&serde_json::json!(true)),
            ValorDeDetalhe::Booleano(true)
        );
        assert_eq!(
            ValorDeDetalhe::from(&serde_json::json!(null)),
            ValorDeDetalhe::Nulo
        );
        assert_eq!(
            ValorDeDetalhe::from(&serde_json::json!(1.5)),
            ValorDeDetalhe::Texto("1.5".to_owned())
        );
    }

    #[test]
    fn registro_serializa_no_formato_do_lote() {
        let chave = chave_de_assinatura(&cofre_com_semente_do_vetor()).unwrap();
        let registro = montar_registro(
            &chave,
            "id-1".to_owned(),
            instante(12, 0, 0, 0),
            "app-bloqueado",
            USUARIO,
            DISPOSITIVO,
            Detalhe::new(),
            None,
        )
        .unwrap();
        let json = serde_json::to_value(&registro).unwrap();
        for campo in [
            "id",
            "ocorridoEm",
            "tipo",
            "usuarioId",
            "dispositivoId",
            "detalhe",
            "hashAnterior",
            "hash",
            "assinatura",
        ] {
            assert!(json.get(campo).is_some(), "falta {campo}");
        }
        assert!(json["hashAnterior"].is_null());
    }
}
