import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  primeiroAcesso,
  semearProprietario,
  usuarioLogado,
  zerarBanco,
  type AppDeTeste,
  type SaidaDeLogin,
} from './ajudantes.js';

interface Erro {
  erro: { codigo: string; mensagem: string; tentarApos?: string; campos?: string[] };
}

describe('AuthController (E2E)', () => {
  let a: AppDeTeste;
  const extras: AppDeTeste[] = [];

  beforeEach(async () => {
    await zerarBanco();
    a = await criarAppDeTeste();
  });

  afterEach(async () => {
    await a.fechar();
    while (extras.length > 0) await extras.pop()?.fechar();
  });

  afterAll(async () => {
    await encerrarAjudantes();
  });

  it('primeiro acesso: login → configurar MFA → confirmar → concluir, com Cache-Control: no-store', async () => {
    await semearProprietario(a);
    const login = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: SENHA }).expect(200);
    expect(login.headers['cache-control']).toBe('no-store');
    expect(corpoDe<{ mfa: string }>(login).mfa).toBe('configurar');
    const { desafio } = corpoDe<{ desafio: string }>(login);

    const gerado = await request(a.http()).post('/auth/mfa/segredo').send({ desafio }).expect(200);
    expect(gerado.headers['cache-control']).toBe('no-store');
    const { segredo, urlOtpauth } = corpoDe<{ segredo: string; urlOtpauth: string }>(gerado);
    expect(urlOtpauth.startsWith('otpauth://totp/')).toBe(true);

    const confirmado = await request(a.http())
      .post('/auth/mfa/confirmar')
      .send({ desafio, codigo: codigoTotp(segredo, a.relogio) })
      .expect(200);
    expect(confirmado.headers['cache-control']).toBe('no-store');
    const { codigosDeRecuperacao } = corpoDe<{ codigosDeRecuperacao: string[] }>(confirmado);
    expect(codigosDeRecuperacao).toHaveLength(10);

    a.relogio.avancar(30_000);
    const concluido = await request(a.http())
      .post('/auth/login/concluir')
      .send({ desafio, codigo: { tipo: 'totp', valor: codigoTotp(segredo, a.relogio) }, dispositivo: dispositivoInformado() })
      .expect(200);
    expect(concluido.headers['cache-control']).toBe('no-store');
    const saida = corpoDe<SaidaDeLogin & { politica: Record<string, unknown> }>(concluido);
    expect(saida.accessToken.split('.')).toHaveLength(3);
    expect(saida.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(saida.usuario).toMatchObject({ email: EMAIL, papeis: ['proprietario'] });
    expect(saida.politica).toMatchObject({ inatividadeMin: 10, maxDispositivosAtivos: 3 });
    expect(saida.codigosRestantes).toBe(10);
    expect(JSON.stringify(saida)).not.toContain(SENHA);
  });

  it('senha errada e e-mail inexistente dão o mesmo 401 e o mesmo corpo (RN-12)', async () => {
    await semearProprietario(a);
    const errada = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: 'senha-errada-qualquer' });
    const inexistente = await request(a.http()).post('/auth/login').send({ email: 'ninguem@clinica.com', senha: 'senha-errada-qualquer' });
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.body).toEqual(inexistente.body);
    expect(corpoDe<Erro>(errada).erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('5 senhas erradas bloqueiam: a 6ª tentativa devolve 423 com tentarApos', async () => {
    await semearProprietario(a);
    for (let i = 0; i < 5; i++) {
      await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: 'errada' }).expect(401);
    }
    // O limite de taxa (5/min por IP) é por instância; a 6ª tentativa vai a uma segunda instância, com o mesmo banco.
    const outra = await criarAppDeTeste([], a.relogio);
    extras.push(outra);
    const r = await request(outra.http()).post('/auth/login').send({ email: EMAIL, senha: SENHA });
    expect(r.status).toBe(423);
    expect(corpoDe<Erro>(r).erro.codigo).toBe('CONTA_BLOQUEADA');
    expect(corpoDe<Erro>(r).erro.tentarApos).toBe(new Date(a.relogio.agora().getTime() + 60_000).toISOString());
  });

  it('a 6ª chamada a /auth/login no mesmo minuto devolve 429 MUITAS_REQUISICOES', async () => {
    for (let i = 0; i < 5; i++) {
      await request(a.http()).post('/auth/login').send({ email: 'x@y.com', senha: 'x' }).expect(401);
    }
    const r = await request(a.http()).post('/auth/login').send({ email: 'x@y.com', senha: 'x' });
    expect(r.status).toBe(429);
    expect(corpoDe<Erro>(r).erro).toEqual({ codigo: 'MUITAS_REQUISICOES', mensagem: 'Muitas tentativas. Aguarde um minuto.' });
  });

  it('corpo com campo extra ou tipo errado devolve 400 REQUISICAO_INVALIDA sem eco do valor', async () => {
    const extra = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: 'segredo-123', admin: true });
    expect(extra.status).toBe(400);
    expect(corpoDe<Erro>(extra).erro).toMatchObject({ codigo: 'REQUISICAO_INVALIDA', campos: ['admin'] });
    const tipoErrado = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: 12345 });
    expect(tipoErrado.status).toBe(400);
    expect(JSON.stringify(tipoErrado.body)).not.toContain('12345');
    expect((await request(a.http()).post('/auth/login').send({})).status).toBe(400);
  });

  it('refresh: rotação feliz; reutilizar o refresh antigo derruba a sessão e o novo também falha', async () => {
    const { login } = await usuarioLogado(a);
    const novo = await request(a.http())
      .post('/auth/refresh')
      .send({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId })
      .expect(200);
    expect(novo.headers['cache-control']).toBe('no-store');
    const rotacionado = corpoDe<{ refreshToken: string; accessToken: string }>(novo);
    expect(rotacionado.refreshToken).not.toBe(login.refreshToken);

    const reuso = await request(a.http())
      .post('/auth/refresh')
      .send({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId });
    expect(reuso.status).toBe(401);
    expect(corpoDe<Erro>(reuso).erro.codigo).toBe('SESSAO_EXPIRADA');

    const novoTambem = await request(a.http())
      .post('/auth/refresh')
      .send({ refreshToken: rotacionado.refreshToken, dispositivoId: login.dispositivoId });
    expect(novoTambem.status).toBe(401);
    expect(corpoDe<Erro>(novoTambem).erro.codigo).toBe('SESSAO_EXPIRADA');
  });

  it('refresh com dispositivo divergente ou token mal formado é recusado', async () => {
    const { login } = await usuarioLogado(a);
    const outroDispositivo = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
    expect((await request(a.http()).post('/auth/refresh').send({ refreshToken: login.refreshToken, dispositivoId: outroDispositivo })).status).toBe(401);
    expect((await request(a.http()).post('/auth/refresh').send({ refreshToken: 'curto', dispositivoId: login.dispositivoId })).status).toBe(400);
  });

  it('logout: sem Bearer 401, com Bearer 204, e depois o refresh não funciona mais', async () => {
    const { login } = await usuarioLogado(a);
    expect((await request(a.http()).post('/auth/logout')).status).toBe(401);
    expect((await request(a.http()).post('/auth/logout').set(...bearer('token-invalido'))).status).toBe(401);
    await request(a.http()).post('/auth/logout').set(...bearer(login.accessToken)).expect(204);
    const r = await request(a.http()).post('/auth/refresh').send({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId });
    expect(r.status).toBe(401);
  });

  it('senha/esqueci responde 202 { aceito: true } para e-mail existente, inexistente e malformado', async () => {
    await semearProprietario(a);
    for (const email of [EMAIL, 'ninguem@clinica.com', 'malformado']) {
      const r = await request(a.http()).post('/auth/senha/esqueci').send({ email });
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ aceito: true });
    }
  });

  it('senha/trocar revoga a sessão de outro dispositivo e mantém a do dispositivo atual', async () => {
    const { segredo, login: dispositivoA } = await usuarioLogado(a);
    const dispositivoB = await entrar(a, segredo);
    expect(dispositivoB.dispositivoId).not.toBe(dispositivoA.dispositivoId);

    await request(a.http())
      .post('/auth/senha/trocar')
      .set(...bearer(dispositivoA.accessToken))
      .send({ senhaAtual: SENHA, novaSenha: 'a-nova-senha-bem-forte-88' })
      .expect(204);

    const refreshB = await request(a.http())
      .post('/auth/refresh')
      .send({ refreshToken: dispositivoB.refreshToken, dispositivoId: dispositivoB.dispositivoId });
    expect(refreshB.status).toBe(401);
    await request(a.http())
      .post('/auth/refresh')
      .send({ refreshToken: dispositivoA.refreshToken, dispositivoId: dispositivoA.dispositivoId })
      .expect(200);
  });

  it('senha/trocar com senha atual errada devolve 401 e com senha fraca devolve 422 com os motivos', async () => {
    const { login } = await usuarioLogado(a);
    const errada = await request(a.http())
      .post('/auth/senha/trocar')
      .set(...bearer(login.accessToken))
      .send({ senhaAtual: 'errada', novaSenha: 'a-nova-senha-bem-forte-88' });
    expect(errada.status).toBe(401);
    const fraca = await request(a.http())
      .post('/auth/senha/trocar')
      .set(...bearer(login.accessToken))
      .send({ senhaAtual: SENHA, novaSenha: 'curta' });
    expect(fraca.status).toBe(422);
    expect(corpoDe<Erro & { erro: { motivos: string[] } }>(fraca).erro.motivos).toEqual(['curta']);
  });

  it('mfa/codigos: TOTP errado devolve 403 REAUTENTICACAO_NECESSARIA; TOTP correto devolve 10 códigos novos', async () => {
    const { segredo, login, codigosDeRecuperacao } = await usuarioLogado(a);
    const errado = await request(a.http())
      .post('/auth/mfa/codigos')
      .set(...bearer(login.accessToken))
      .send({ codigoMfa: '000000' });
    expect(errado.status).toBe(403);
    expect(corpoDe<Erro>(errado).erro.codigo).toBe('REAUTENTICACAO_NECESSARIA');

    a.relogio.avancar(30_000);
    const certo = await request(a.http())
      .post('/auth/mfa/codigos')
      .set(...bearer(login.accessToken))
      .send({ codigoMfa: codigoTotp(segredo, a.relogio) })
      .expect(200);
    expect(certo.headers['cache-control']).toBe('no-store');
    const novos = corpoDe<{ codigosDeRecuperacao: string[] }>(certo).codigosDeRecuperacao;
    expect(novos).toHaveLength(10);
    expect(novos.some((c) => codigosDeRecuperacao.includes(c))).toBe(false);
  });

  it('reconfigurar MFA: exige a senha, troca o segredo e o antigo deixa de valer', async () => {
    const { segredo, login } = await usuarioLogado(a);
    const semSenha = await request(a.http())
      .post('/auth/mfa/reconfigurar')
      .set(...bearer(login.accessToken))
      .send({ senhaAtual: 'errada' });
    expect(semSenha.status).toBe(403);

    const iniciado = await request(a.http())
      .post('/auth/mfa/reconfigurar')
      .set(...bearer(login.accessToken))
      .send({ senhaAtual: SENHA })
      .expect(200);
    const novoSegredo = corpoDe<{ segredo: string }>(iniciado).segredo;
    expect(novoSegredo).not.toBe(segredo);

    a.relogio.avancar(30_000);
    const confirmado = await request(a.http())
      .post('/auth/mfa/reconfigurar/confirmar')
      .set(...bearer(login.accessToken))
      .send({ codigo: codigoTotp(novoSegredo, a.relogio) })
      .expect(200);
    expect(corpoDe<{ codigosDeRecuperacao: string[] }>(confirmado).codigosDeRecuperacao).toHaveLength(10);

    // O segredo antigo não vale mais no login.
    const novoLogin = await request(a.http()).post('/auth/login').send({ email: EMAIL, senha: SENHA }).expect(200);
    a.relogio.avancar(30_000);
    const comAntigo = await request(a.http())
      .post('/auth/login/concluir')
      .send({
        desafio: corpoDe<{ desafio: string }>(novoLogin).desafio,
        codigo: { tipo: 'totp', valor: codigoTotp(segredo, a.relogio) },
        dispositivo: dispositivoInformado(),
      });
    expect(comAntigo.status).toBe(401);
    expect(corpoDe<Erro>(comAntigo).erro.codigo).toBe('CODIGO_MFA_INVALIDO');
  });

  it('rotas protegidas recusam acesso sem Bearer', async () => {
    for (const rota of ['/auth/senha/trocar', '/auth/mfa/codigos', '/auth/mfa/reconfigurar', '/auth/mfa/reconfigurar/confirmar']) {
      const r = await request(a.http()).post(rota).send({});
      expect(r.status, rota).toBe(401);
    }
  });

  it('desafio usado uma vez não conclui um segundo login', async () => {
    await semearProprietario(a);
    const { segredo, desafio } = await primeiroAcesso(a);
    a.relogio.avancar(30_000);
    const corpo = { desafio, codigo: { tipo: 'totp', valor: codigoTotp(segredo, a.relogio) }, dispositivo: dispositivoInformado() };
    await request(a.http()).post('/auth/login/concluir').send(corpo).expect(200);
    a.relogio.avancar(30_000);
    const segundo = await request(a.http())
      .post('/auth/login/concluir')
      .send({ ...corpo, codigo: { tipo: 'totp', valor: codigoTotp(segredo, a.relogio) } });
    expect(segundo.status).toBe(401);
    expect(corpoDe<Erro>(segundo).erro.codigo).toBe('DESAFIO_INVALIDO');
  });
});
