//! Envio da auditoria local ao servidor, com prioridade logo após cada reconexão (RN-39).
use std::sync::Mutex;

use super::auditoria;
use super::erros::ErroDeAcesso;
use super::estado::EstadoDoAcesso;
use super::servico::ServicoDeAcessoLocal;
use super::sessao_remota::SessaoRemota;

pub const TAMANHO_DO_LOTE: usize = 500;

fn com_servico<T>(
    acesso: &Mutex<ServicoDeAcessoLocal>,
    trabalho: impl FnOnce(&mut ServicoDeAcessoLocal) -> Result<T, ErroDeAcesso>,
) -> Result<T, ErroDeAcesso> {
    let mut servico = acesso.lock().map_err(|_| ErroDeAcesso::Interno)?;
    trabalho(&mut servico)
}

/// Envia, em lotes de até 500 e na ordem de gravação, tudo o que ainda não foi enviado.
/// Um erro do servidor (ex.: 422) interrompe o envio sem marcar nem descartar nada.
/// Com o app bloqueado não chama a API e devolve `Ok(0)`.
pub async fn enviar_pendentes(
    sessao: &mut SessaoRemota,
    acesso: &Mutex<ServicoDeAcessoLocal>,
) -> Result<u64, ErroDeAcesso> {
    let resultado = enviar_em_lotes(sessao, acesso).await;
    // Mantém o contador visível mesmo com o app bloqueado, inclusive depois de uma falha parcial.
    let _ = com_servico(acesso, |servico| {
        if servico.esta_desbloqueado() {
            servico.atualizar_eventos_pendentes()
        } else {
            Ok(())
        }
    });
    resultado
}

async fn enviar_em_lotes(
    sessao: &mut SessaoRemota,
    acesso: &Mutex<ServicoDeAcessoLocal>,
) -> Result<u64, ErroDeAcesso> {
    let mut enviados = 0u64;
    loop {
        let lote = com_servico(acesso, |servico| {
            if !servico.esta_desbloqueado() {
                return Ok(Vec::new());
            }
            auditoria::pendentes(servico.banco()?, TAMANHO_DO_LOTE)
        })?;
        if lote.is_empty() {
            return Ok(enviados);
        }

        sessao.enviar_lote(acesso, &lote).await?;

        let ids: Vec<String> = lote.iter().map(|registro| registro.id.clone()).collect();
        com_servico(acesso, |servico| {
            auditoria::marcar_enviados(servico.banco()?, &ids)
        })?;
        enviados += u64::try_from(lote.len()).unwrap_or(0);
        if lote.len() < TAMANHO_DO_LOTE {
            return Ok(enviados);
        }
    }
}

/// Renova a sessão e, em seguida, envia a auditoria pendente. Uma falha no envio não derruba a renovação.
pub async fn renovar_e_enviar(
    sessao: &mut SessaoRemota,
    acesso: &Mutex<ServicoDeAcessoLocal>,
) -> Result<EstadoDoAcesso, ErroDeAcesso> {
    let estado = sessao.renovar(acesso).await?;
    if enviar_pendentes(sessao, acesso).await.is_ok() {
        // O total de eventos pendentes mudou.
        return com_servico(acesso, |servico| servico.estado());
    }
    Ok(estado)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::acesso_local::auditoria::Detalhe;
    use crate::acesso_local::cofre_so::{CHAVE_REFRESH, CofreDeChavesDoSo, CofreEmMemoria};
    use crate::acesso_local::cripto::ParametrosArgon2;
    use crate::acesso_local::estado::{MotivoDeBloqueio, UsuarioResumo};
    use crate::acesso_local::modo_offline::PoliticaLocal;
    use crate::acesso_local::relogio::{Relogio, RelogioFixo};
    use crate::acesso_local::sessao_remota::{ConfiguracaoDaApi, DadosDoLogin};
    use chrono::{Duration, TimeZone, Utc};
    use mockito::{Server, ServerGuard};
    use serde_json::{Value, json};
    use std::sync::Arc;
    use tempfile::{TempDir, tempdir};

    const SENHA: &str = "senha-mestre-bem-forte";
    const DISPOSITIVO: &str = "22222222-2222-4222-8222-222222222222";

    struct Ambiente {
        _pasta: TempDir,
        relogio: Arc<RelogioFixo>,
        cofre: Arc<CofreEmMemoria>,
        acesso: Arc<Mutex<ServicoDeAcessoLocal>>,
    }

    impl Ambiente {
        /// Serviço desbloqueado, com usuário e computador conhecidos e `quantos` registros pendentes.
        fn com_pendentes(quantos: usize) -> Self {
            let pasta = tempdir().unwrap();
            let relogio = Arc::new(RelogioFixo::novo(
                Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap(),
            ));
            let cofre = Arc::new(CofreEmMemoria::novo());
            let mut servico = ServicoDeAcessoLocal::novo(
                pasta.path().to_path_buf(),
                cofre.clone(),
                relogio.clone(),
                ParametrosArgon2 {
                    m_kib: 8192,
                    t: 1,
                    p: 1,
                },
            );
            servico.configurar(SENHA).unwrap();
            servico
                .aplicar_login(DadosDoLogin {
                    usuario: UsuarioResumo {
                        id: "11111111-1111-4111-8111-111111111111".to_owned(),
                        nome: "Lucas".to_owned(),
                        email: "lucas@clinica.com".to_owned(),
                    },
                    politica: PoliticaLocal::default(),
                    dispositivo_id: DISPOSITIVO.to_owned(),
                    ocorrido_em: relogio.agora(),
                })
                .unwrap();
            for _ in 0..quantos {
                servico
                    .auditar("reautenticacao-sensivel", Detalhe::new())
                    .unwrap();
            }
            cofre.guardar(CHAVE_REFRESH, b"refresh-antigo").unwrap();
            Self {
                _pasta: pasta,
                relogio,
                cofre,
                acesso: Arc::new(Mutex::new(servico)),
            }
        }

        fn sessao(&self, servidor: &ServerGuard) -> SessaoRemota {
            SessaoRemota::novo(
                ConfiguracaoDaApi::validar(Some(&servidor.url()), false).unwrap(),
                self.cofre.clone(),
                self.relogio.clone(),
            )
            .unwrap()
            .com_access_de_teste("ACCESS", self.relogio.agora() + Duration::minutes(15))
        }

        fn pendentes(&self) -> u64 {
            com_servico(&self.acesso, |s| auditoria::contar_pendentes(s.banco()?)).unwrap()
        }
    }

    type Corpos = Arc<Mutex<Vec<Value>>>;

    fn gravar_corpos(servidor: &mut ServerGuard, status: usize, corpos: &Corpos) -> mockito::Mock {
        let corpos = Arc::clone(corpos);
        servidor
            .mock("POST", "/auditoria/lote")
            .match_header("authorization", "Bearer ACCESS")
            .match_request(move |requisicao| {
                if let Ok(bytes) = requisicao.body()
                    && let Ok(valor) = serde_json::from_slice::<Value>(bytes)
                    && let Ok(mut guardados) = corpos.lock()
                {
                    guardados.push(valor);
                }
                true
            })
            .with_status(status)
            .with_header("content-type", "application/json")
            .with_body(if status == 200 {
                json!({"aceitos": 1}).to_string()
            } else {
                json!({"erro": {"codigo": "AUDITORIA_INVALIDA", "mensagem": "Registro inválido."}})
                    .to_string()
            })
    }

    #[tokio::test]
    async fn tres_pendentes_viram_um_post_no_formato_camel_case_e_sao_marcados() {
        let ambiente = Ambiente::com_pendentes(3);
        let mut servidor = Server::new_async().await;
        let corpos: Corpos = Arc::default();
        let mock = gravar_corpos(&mut servidor, 200, &corpos)
            .expect(1)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor);

        let enviados = enviar_pendentes(&mut sessao, &ambiente.acesso)
            .await
            .unwrap();

        mock.assert_async().await;
        assert_eq!(enviados, 3);
        assert_eq!(ambiente.pendentes(), 0);
        let corpos = corpos.lock().unwrap();
        let registros = corpos[0]["registros"].as_array().unwrap();
        assert_eq!(registros.len(), 3);
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
            assert!(registros[0].get(campo).is_some(), "falta {campo}");
        }
        assert!(registros[0]["hashAnterior"].is_null());
        assert_eq!(registros[1]["hashAnterior"], registros[0]["hash"]);
        assert_eq!(registros[2]["hashAnterior"], registros[1]["hash"]);
    }

    #[tokio::test]
    async fn quinhentos_e_um_pendentes_viram_dois_posts() {
        let ambiente = Ambiente::com_pendentes(501);
        let mut servidor = Server::new_async().await;
        let corpos: Corpos = Arc::default();
        let mock = gravar_corpos(&mut servidor, 200, &corpos)
            .expect(2)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor);

        let enviados = enviar_pendentes(&mut sessao, &ambiente.acesso)
            .await
            .unwrap();

        mock.assert_async().await;
        assert_eq!(enviados, 501);
        assert_eq!(ambiente.pendentes(), 0);
        let tamanhos: Vec<usize> = corpos
            .lock()
            .unwrap()
            .iter()
            .map(|c| c["registros"].as_array().unwrap().len())
            .collect();
        assert_eq!(tamanhos, [500, 1]);
    }

    #[tokio::test]
    async fn erro_422_nao_marca_nem_descarta_nada() {
        let ambiente = Ambiente::com_pendentes(3);
        let mut servidor = Server::new_async().await;
        let corpos: Corpos = Arc::default();
        let mock = gravar_corpos(&mut servidor, 422, &corpos)
            .expect(1)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor);

        let resultado = enviar_pendentes(&mut sessao, &ambiente.acesso).await;

        mock.assert_async().await;
        assert!(matches!(
            resultado,
            Err(ErroDeAcesso::Api { status: 422, .. })
        ));
        assert_eq!(ambiente.pendentes(), 3);
    }

    #[tokio::test]
    async fn app_bloqueado_nao_chama_a_api() {
        let ambiente = Ambiente::com_pendentes(2);
        com_servico(&ambiente.acesso, |s| {
            s.bloquear(MotivoDeBloqueio::Manual).map(|_| ())
        })
        .unwrap();
        let mut servidor = Server::new_async().await;
        let mock = servidor
            .mock("POST", mockito::Matcher::Any)
            .expect(0)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor);

        assert_eq!(
            enviar_pendentes(&mut sessao, &ambiente.acesso)
                .await
                .unwrap(),
            0
        );
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn sem_pendentes_nao_chama_a_api() {
        let ambiente = Ambiente::com_pendentes(0);
        let mut servidor = Server::new_async().await;
        let mock = servidor
            .mock("POST", mockito::Matcher::Any)
            .expect(0)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor);
        assert_eq!(
            enviar_pendentes(&mut sessao, &ambiente.acesso)
                .await
                .unwrap(),
            0
        );
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn falha_no_envio_nao_derruba_a_renovacao() {
        let ambiente = Ambiente::com_pendentes(2);
        ambiente
            .cofre
            .guardar(
                CHAVE_REFRESH,
                b"r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r00",
            )
            .unwrap();
        let mut servidor = Server::new_async().await;
        servidor
            .mock("POST", "/auth/refresh")
            .with_status(200)
            .with_body(
                json!({
                    "accessToken": "ACCESS",
                    "accessExpiraEm": (ambiente.relogio.agora() + Duration::minutes(15)).to_rfc3339(),
                    "refreshToken": "r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r11",
                    "politica": PoliticaLocal::default()
                })
                .to_string(),
            )
            .create_async()
            .await;
        let lote = servidor
            .mock("POST", "/auditoria/lote")
            .with_status(500)
            .with_body("erro")
            .expect(1)
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor);

        let estado = renovar_e_enviar(&mut sessao, &ambiente.acesso)
            .await
            .unwrap();

        lote.assert_async().await;
        assert!(estado.sessao_online);
        assert_eq!(ambiente.pendentes(), 2);
    }

    #[tokio::test]
    async fn renovacao_com_sucesso_atualiza_o_total_de_eventos_pendentes() {
        let ambiente = Ambiente::com_pendentes(2);
        ambiente
            .cofre
            .guardar(
                CHAVE_REFRESH,
                b"r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r0r00",
            )
            .unwrap();
        let mut servidor = Server::new_async().await;
        servidor
            .mock("POST", "/auth/refresh")
            .with_status(200)
            .with_body(
                json!({
                    "accessToken": "ACCESS",
                    "accessExpiraEm": (ambiente.relogio.agora() + Duration::minutes(15)).to_rfc3339(),
                    "refreshToken": "r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r1r11",
                    "politica": PoliticaLocal::default()
                })
                .to_string(),
            )
            .create_async()
            .await;
        servidor
            .mock("POST", "/auditoria/lote")
            .with_status(200)
            .with_body("{}")
            .create_async()
            .await;
        let mut sessao = ambiente.sessao(&servidor);

        let estado = renovar_e_enviar(&mut sessao, &ambiente.acesso)
            .await
            .unwrap();

        assert_eq!(estado.eventos_pendentes, 0);
        assert_eq!(ambiente.pendentes(), 0);
    }
}
