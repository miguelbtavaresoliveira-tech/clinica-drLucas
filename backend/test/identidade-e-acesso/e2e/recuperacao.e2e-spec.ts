import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENVIADOR_DE_EMAIL } from '../../../src/identidade-e-acesso/application/index.js';
import { criarConexao } from '../../../src/identidade-e-acesso/infrastructure/persistencia/conexao.js';
import { EnviadorDeEmailFalso } from '../fakes/index.js';
import { urlDoBancoDeTeste } from '../int/banco-de-teste.js';
import {
  EMAIL,
  SENHA,
  bearer,
  codigoTotp,
  corpoDe,
  criarAppDeTeste,
  dispositivoInformado,
  encerrarAjudantes,
  entrar,
  usuarioLogado,
  zerarBanco,
  type AppDeTeste,
} from './ajudantes.js';

interface Erro {
  erro: { codigo: string; mensagem: string };
}

const NOVA_SENHA = 'redefinida-por-email-forte-91';

describe('Recuperação de acesso e auditoria (E2E)', () => {
  let a: AppDeTeste;
  let enviador: EnviadorDeEmailFalso;
  const conexao = criarConexao(urlDoBancoDeTeste());

  beforeEach(async () => {
    await zerarBanco();
    enviador = new EnviadorDeEmailFalso();
    a = await criarAppDeTeste([{ token: ENVIADOR_DE_EMAIL, valor: enviador }]);
  });

  afterEach(async () => {
    await a.fechar();
  });

  afterAll(async () => {
    await conexao.encerrar();
    await encerrarAjudantes();
  });

  async function pedirToken(): Promise<string> {
    const tamanhoAntes = enviador.enviados.length;
    await request(a.http()).post('/auth/senha/esqueci').send({ email: EMAIL }).expect(202);
    expect(enviador.enviados.length).toBe(tamanhoAntes + 1);
    return enviador.enviados.at(-1)!.token;
  }

  function totpNovo(segredo: string): string {
    a.relogio.avancar(30_000);
    return codigoTotp(segredo, a.relogio);
  }

  it('esqueci a senha → redefinir com TOTP: senha antiga falha, a nova funciona e as sessões antigas caem', async () => {
    const { segredo, login } = await usuarioLogado(a);
    const token = await pedirToken();
    const email = enviador.enviados.at(-1)!;
    expect(email.link).toContain(`token=${encodeURIComponent(token)}`);

    await request(a.http())
      .post('/auth/senha/redefinir')
      .send({ token, novaSenha: NOVA_SENHA, codigo: { tipo: 'totp', valor: totpNovo(segredo) } })
      .expect(204);

    const antiga = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: SENHA });
    expect(antiga.status).toBe(401);
    expect(corpoDe<Erro>(antiga).erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    const nova = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: NOVA_SENHA });
    expect(nova.status).toBe(200);

    const sessaoAntiga = await request(a.http())
      .post('/auth/refresh')
      .send({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId });
    expect(sessaoAntiga.status).toBe(401);
    expect(corpoDe<Erro>(sessaoAntiga).erro.codigo).toBe('SESSAO_EXPIRADA');
  });

  it('o token de redefinição só pode ser usado uma vez', async () => {
    const { segredo } = await usuarioLogado(a);
    const token = await pedirToken();
    await request(a.http())
      .post('/auth/senha/redefinir')
      .send({ token, novaSenha: NOVA_SENHA, codigo: { tipo: 'totp', valor: totpNovo(segredo) } })
      .expect(204);
    const segunda = await request(a.http())
      .post('/auth/senha/redefinir')
      .send({ token, novaSenha: 'outra-senha-bem-forte-123', codigo: { tipo: 'totp', valor: totpNovo(segredo) } });
    expect(segunda.status).toBe(401);
    expect(corpoDe<Erro>(segunda).erro.codigo).toBe('TOKEN_DE_REDEFINICAO_INVALIDO');
  });

  it('token expirado (+31 min) é recusado', async () => {
    const { segredo } = await usuarioLogado(a);
    const token = await pedirToken();
    a.relogio.avancar(31 * 60_000);
    const r = await request(a.http())
      .post('/auth/senha/redefinir')
      .send({ token, novaSenha: NOVA_SENHA, codigo: { tipo: 'totp', valor: totpNovo(segredo) } });
    expect(r.status).toBe(401);
    expect(corpoDe<Erro>(r).erro.codigo).toBe('TOKEN_DE_REDEFINICAO_INVALIDO');
  });

  it('a redefinição exige o segundo fator: código errado devolve 401 e consome o token', async () => {
    await usuarioLogado(a);
    const token = await pedirToken();
    const errado = await request(a.http())
      .post('/auth/senha/redefinir')
      .send({ token, novaSenha: NOVA_SENHA, codigo: { tipo: 'totp', valor: '000000' } });
    expect(errado.status).toBe(401);
    expect(corpoDe<Erro>(errado).erro.codigo).toBe('CODIGO_MFA_INVALIDO');
    const login = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: SENHA });
    expect(login.status).toBe(200);
  });

  it('redefinir com um código de recuperação no lugar do TOTP também funciona (RN-33)', async () => {
    const { codigosDeRecuperacao } = await usuarioLogado(a);
    const token = await pedirToken();
    await request(a.http())
      .post('/auth/senha/redefinir')
      .send({ token, novaSenha: NOVA_SENHA, codigo: { tipo: 'recuperacao', valor: codigosDeRecuperacao[0] } })
      .expect(204);
    await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: NOVA_SENHA }).expect(200);
  });

  it('perdeu o autenticador: entra com código de recuperação, reconfigura o MFA e o segredo antigo para de valer (RN-34)', async () => {
    const { segredo, codigosDeRecuperacao } = await usuarioLogado(a);

    const login = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: SENHA }).expect(200);
    const concluido = await request(a.http())
      .post('/auth/login/concluir')
      .send({
        desafio: corpoDe<{ desafio: string }>(login).desafio,
        codigo: { tipo: 'recuperacao', valor: codigosDeRecuperacao[3] },
        dispositivo: dispositivoInformado(),
      })
      .expect(200);
    const sessao = corpoDe<{ accessToken: string; usouCodigoDeRecuperacao: boolean; codigosRestantes: number }>(concluido);
    expect(sessao.usouCodigoDeRecuperacao).toBe(true);
    expect(sessao.codigosRestantes).toBe(9);

    const iniciado = await request(a.http())
      .post('/auth/mfa/reconfigurar')
      .set(...bearer(sessao.accessToken))
      .send({ senhaAtual: SENHA })
      .expect(200);
    const novoSegredo = corpoDe<{ segredo: string }>(iniciado).segredo;
    await request(a.http())
      .post('/auth/mfa/reconfigurar/confirmar')
      .set(...bearer(sessao.accessToken))
      .send({ codigo: totpNovo(novoSegredo) })
      .expect(200);

    const outroLogin = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: SENHA }).expect(200);
    const comAntigo = await request(a.http())
      .post('/auth/login/concluir')
      .send({
        desafio: corpoDe<{ desafio: string }>(outroLogin).desafio,
        codigo: { tipo: 'totp', valor: totpNovo(segredo) },
        dispositivo: dispositivoInformado(),
      });
    expect(comAntigo.status).toBe(401);
    expect(corpoDe<Erro>(comAntigo).erro.codigo).toBe('CODIGO_MFA_INVALIDO');
  });

  it('o 4º dispositivo ativo é recusado com 409 LIMITE_DE_DISPOSITIVOS_ATINGIDO', async () => {
    const { segredo } = await usuarioLogado(a);
    await entrar(a, segredo);
    await entrar(a, segredo);

    const login = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: SENHA }).expect(200);
    a.relogio.avancar(30_000);
    const quarto = await request(a.http())
      .post('/auth/login/concluir')
      .send({
        desafio: corpoDe<{ desafio: string }>(login).desafio,
        codigo: { tipo: 'totp', valor: codigoTotp(segredo, a.relogio) },
        dispositivo: dispositivoInformado(),
      });
    expect(quarto.status).toBe(409);
    expect(corpoDe<Erro>(quarto).erro.codigo).toBe('LIMITE_DE_DISPOSITIVOS_ATINGIDO');
  });

  it('a auditoria registra os eventos de acesso e nunca contém a senha nem tokens', async () => {
    const { segredo, login } = await usuarioLogado(a);
    await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: 'senha-errada-registrada-9' }).expect(401);
    const outro = await entrar(a, segredo);
    await request(a.http())
      .post('/auth/senha/trocar')
      .set(...bearer(login.accessToken))
      .send({ senhaAtual: SENHA, novaSenha: NOVA_SENHA })
      .expect(204);
    await request(a.http())
      .post(`/dispositivos/${outro.dispositivoId}/revogar`)
      .set(...bearer(login.accessToken))
      .send({ motivo: 'notebook perdido', codigoMfa: totpNovo(segredo) })
      .expect(204);
    const token = await pedirToken();

    const tipos = await conexao.db.execute<{ tipo: string }>(
      sql`SELECT DISTINCT tipo FROM identidade.auditoria_de_acesso`,
    );
    const encontrados = tipos.rows.map((l) => l.tipo);
    for (const esperado of ['login-ok', 'login-falhou', 'senha-alterada', 'dispositivo-revogado', 'redefinicao-de-senha-solicitada']) {
      expect(encontrados).toContain(esperado);
    }

    const tudo = await conexao.db.execute<{ linha: string }>(
      sql`SELECT row_to_json(a)::text AS linha FROM identidade.auditoria_de_acesso a`,
    );
    const texto = tudo.rows.map((l) => l.linha).join('\n');
    for (const segredoSensivel of [SENHA, NOVA_SENHA, 'senha-errada-registrada-9', token, login.refreshToken, login.accessToken, segredo]) {
      expect(texto).not.toContain(segredoSensivel);
    }
  });

  it('roteiro completo do servidor: login → renovação → revogação do dispositivo → nova renovação falhando', async () => {
    const { segredo, login } = await usuarioLogado(a);
    const segundo = await entrar(a, segredo);
    const renovado = await request(a.http())
      .post('/auth/refresh')
      .send({ refreshToken: segundo.refreshToken, dispositivoId: segundo.dispositivoId })
      .expect(200);
    await request(a.http())
      .post(`/dispositivos/${segundo.dispositivoId}/revogar`)
      .set(...bearer(login.accessToken))
      .send({ motivo: 'dispositivo revogado no roteiro', codigoMfa: totpNovo(segredo) })
      .expect(204);
    const depois = await request(a.http())
      .post('/auth/refresh')
      .send({ refreshToken: corpoDe<{ refreshToken: string }>(renovado).refreshToken, dispositivoId: segundo.dispositivoId });
    expect(depois.status).toBe(403);
    expect(corpoDe<Erro>(depois).erro.codigo).toBe('DISPOSITIVO_REVOGADO');
  });
});
