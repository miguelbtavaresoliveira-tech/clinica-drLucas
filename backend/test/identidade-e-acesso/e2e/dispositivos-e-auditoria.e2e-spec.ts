import { createHash, createPrivateKey, sign } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UNIDADE_DE_TRABALHO, type UnidadeDeTrabalho } from '../../../src/identidade-e-acesso/application/index.js';
import { serializarCanonico } from '../../../src/identidade-e-acesso/application/auditoria/serializacao-canonica.js';
import { Dispositivo, Email, HashDeSenha, Usuario } from '../../../src/identidade-e-acesso/domain/index.js';
import {
  CHAVE_PUBLICA,
  bearer,
  codigoTotp,
  corpoDe,
  criarAppDeTeste,
  encerrarAjudantes,
  entrar,
  usuarioLogado,
  zerarBanco,
  type AppDeTeste,
  type SaidaDeLogin,
} from './ajudantes.js';

interface Erro {
  erro: { codigo: string; mensagem: string; motivos?: string[] };
}

/** Chave privada Ed25519 do vetor D-009 (semente 0102…1f20); a pública é CHAVE_PUBLICA. */
const SEMENTE = Buffer.from('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20', 'hex');
const CHAVE_PRIVADA = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEMENTE]),
  format: 'der',
  type: 'pkcs8',
});

interface RegistroDeTeste {
  id: string;
  ocorridoEm: string;
  tipo: string;
  usuarioId: string;
  dispositivoId: string;
  detalhe: Record<string, string | number>;
  hashAnterior: string | null;
  hash: string;
  assinatura: string;
}

function registroAssinado(
  login: SaidaDeLogin,
  agora: Date,
  tipo: string,
  detalhe: Record<string, string | number>,
  hashAnterior: string | null,
): RegistroDeTeste {
  const id = crypto.randomUUID();
  const ocorridoEm = agora.toISOString();
  const canonico = serializarCanonico({
    id,
    ocorridoEm: new Date(ocorridoEm),
    tipo,
    usuarioId: login.usuario.id,
    dispositivoId: login.dispositivoId,
    detalhe,
    hashAnterior,
  });
  const hash = createHash('sha256').update(canonico, 'utf8').digest('hex');
  const assinatura = sign(null, Buffer.from(hash, 'utf8'), CHAVE_PRIVADA).toString('base64');
  return { id, ocorridoEm, tipo, usuarioId: login.usuario.id, dispositivoId: login.dispositivoId, detalhe, hashAnterior, hash, assinatura };
}

describe('Dispositivos, auditoria e usuários (E2E)', () => {
  let a: AppDeTeste;

  beforeEach(async () => {
    await zerarBanco();
    a = await criarAppDeTeste();
  });

  afterEach(async () => {
    await a.fechar();
  });

  afterAll(async () => {
    await encerrarAjudantes();
  });

  /** Código TOTP de um passo ainda não usado. */
  function totpNovo(segredo: string): string {
    a.relogio.avancar(30_000);
    return codigoTotp(segredo, a.relogio);
  }

  it('a chave pública do vetor D-009 corresponde à semente usada nos testes', () => {
    expect(CHAVE_PUBLICA).toBe('ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=');
  });

  describe('GET /dispositivos', () => {
    it('lista o dispositivo atual com atual: true e exige autenticação', async () => {
      const { segredo, login } = await usuarioLogado(a);
      const segundo = await entrar(a, segredo);
      expect((await request(a.http()).get('/dispositivos')).status).toBe(401);
      const r = await request(a.http()).get('/dispositivos').set(...bearer(login.accessToken)).expect(200);
      const { dispositivos } = corpoDe<{ dispositivos: { id: string; atual: boolean; situacao: string; apelido: string }[] }>(r);
      expect(dispositivos).toHaveLength(2);
      expect(dispositivos.find((d) => d.id === login.dispositivoId)).toMatchObject({ atual: true, situacao: 'ativo', apelido: 'MacBook da clínica' });
      expect(dispositivos.find((d) => d.id === segundo.dispositivoId)).toMatchObject({ atual: false });
      expect(JSON.stringify(r.body)).not.toContain('chavePublica');
    });
  });

  describe('POST /dispositivos/:id/revogar', () => {
    it('login, renovação, revogação e nova renovação falhando (E2E SPEC §9)', async () => {
      const { segredo, login } = await usuarioLogado(a);
      const outro = await entrar(a, segredo);
      await request(a.http())
        .post('/auth/refresh')
        .send({ refreshToken: outro.refreshToken, dispositivoId: outro.dispositivoId })
        .expect(200)
        .then((r) => {
          outro.refreshToken = corpoDe<{ refreshToken: string }>(r).refreshToken;
        });

      await request(a.http())
        .post(`/dispositivos/${outro.dispositivoId}/revogar`)
        .set(...bearer(login.accessToken))
        .send({ motivo: 'notebook perdido', codigoMfa: totpNovo(segredo) })
        .expect(204);

      const r = await request(a.http())
        .post('/auth/refresh')
        .send({ refreshToken: outro.refreshToken, dispositivoId: outro.dispositivoId });
      expect(r.status).toBe(403);
      expect(corpoDe<Erro>(r).erro.codigo).toBe('DISPOSITIVO_REVOGADO');

      const lista = await request(a.http()).get('/dispositivos').set(...bearer(login.accessToken)).expect(200);
      expect(corpoDe<{ dispositivos: { id: string; situacao: string }[] }>(lista).dispositivos.find((d) => d.id === outro.dispositivoId)?.situacao).toBe('revogado');
    });

    it('código MFA errado devolve 403 REAUTENTICACAO_NECESSARIA e nada é revogado', async () => {
      const { segredo, login } = await usuarioLogado(a);
      const outro = await entrar(a, segredo);
      const r = await request(a.http())
        .post(`/dispositivos/${outro.dispositivoId}/revogar`)
        .set(...bearer(login.accessToken))
        .send({ motivo: 'notebook perdido', codigoMfa: '000000' });
      expect(r.status).toBe(403);
      expect(corpoDe<Erro>(r).erro.codigo).toBe('REAUTENTICACAO_NECESSARIA');
      await request(a.http()).post('/auth/refresh').send({ refreshToken: outro.refreshToken, dispositivoId: outro.dispositivoId }).expect(200);
    });

    it('id inexistente devolve 404, id malformado 400 e sem Bearer 401', async () => {
      const { segredo, login } = await usuarioLogado(a);
      const inexistente = await request(a.http())
        .post('/dispositivos/3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b/revogar')
        .set(...bearer(login.accessToken))
        .send({ motivo: 'perdido', codigoMfa: totpNovo(segredo) });
      expect(inexistente.status).toBe(404);
      expect(corpoDe<Erro>(inexistente).erro.codigo).toBe('DISPOSITIVO_NAO_ENCONTRADO');
      const malformado = await request(a.http())
        .post('/dispositivos/nao-e-uuid/revogar')
        .set(...bearer(login.accessToken))
        .send({ motivo: 'perdido', codigoMfa: '123456' });
      expect(malformado.status).toBe(400);
      expect(
        (await request(a.http()).post(`/dispositivos/${login.dispositivoId}/revogar`).send({ motivo: 'perdido', codigoMfa: '123456' })).status,
      ).toBe(401);
    });

    it('IDOR: dispositivo de outro usuário devolve 404 e continua ativo', async () => {
      const { segredo, login } = await usuarioLogado(a);
      const uow = a.app.get<UnidadeDeTrabalho>(UNIDADE_DE_TRABALHO);
      const alheio = Usuario.criar({
        nome: 'Outro',
        email: Email.criar('outro@clinica.com'),
        hashDeSenha: HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$abc$def'),
        papeis: ['proprietario'],
        agora: a.relogio.agora(),
      });
      const dispositivoAlheio = Dispositivo.registrar({
        usuarioId: alheio.id,
        apelido: 'Do outro',
        plataforma: 'macos',
        chavePublicaAuditoria: CHAVE_PUBLICA,
        agora: a.relogio.agora(),
      });
      await uow.executar(async (r) => {
        await r.usuarios.salvar(alheio);
        await r.dispositivos.salvar(dispositivoAlheio);
      });
      const r = await request(a.http())
        .post(`/dispositivos/${dispositivoAlheio.id.valor}/revogar`)
        .set(...bearer(login.accessToken))
        .send({ motivo: 'tentativa de IDOR', codigoMfa: totpNovo(segredo) });
      expect(r.status).toBe(404);
      expect(corpoDe<Erro>(r).erro.codigo).toBe('DISPOSITIVO_NAO_ENCONTRADO');
      const { dispositivos } = corpoDe<{ dispositivos: { id: string }[] }>(
        await request(a.http()).get('/dispositivos').set(...bearer(login.accessToken)),
      );
      expect(dispositivos.some((d) => d.id === dispositivoAlheio.id.valor)).toBe(false);
    });
  });

  describe('POST /auditoria/lote', () => {
    it('aceita 2 registros encadeados e assinados; reenvio é idempotente; assinatura adulterada dá 422', async () => {
      const { login } = await usuarioLogado(a);
      const agora = a.relogio.agora();
      const r1 = registroAssinado(login, agora, 'desbloqueio-local-ok', { metodo: 'senha' }, null);
      const r2 = registroAssinado(login, new Date(agora.getTime() + 1000), 'desbloqueio-local-falhou', { metodo: 'senha', tentativa: 3 }, r1.hash);

      const primeiro = await request(a.http()).post('/auditoria/lote').set(...bearer(login.accessToken)).send({ registros: [r1, r2] });
      expect(primeiro.status).toBe(200);
      expect(primeiro.body).toEqual({ aceitos: 2, ignorados: 0 });

      const reenvio = await request(a.http()).post('/auditoria/lote').set(...bearer(login.accessToken)).send({ registros: [r1, r2] });
      expect(reenvio.status).toBe(200);
      expect(reenvio.body).toEqual({ aceitos: 0, ignorados: 2 });

      const r3 = registroAssinado(login, new Date(agora.getTime() + 2000), 'app-bloqueado', {}, r2.hash);
      const adulterado = await request(a.http())
        .post('/auditoria/lote')
        .set(...bearer(login.accessToken))
        .send({ registros: [{ ...r3, assinatura: r1.assinatura }] });
      expect(adulterado.status).toBe(422);
      expect(corpoDe<Erro>(adulterado).erro).toMatchObject({ codigo: 'AUDITORIA_INVALIDA', motivos: ['assinatura'] });
    });

    it('detalhe alterado depois de assinado é recusado (hash) e exige autenticação', async () => {
      const { login } = await usuarioLogado(a);
      const r1 = registroAssinado(login, a.relogio.agora(), 'app-bloqueado', {}, null);
      const adulterado = await request(a.http())
        .post('/auditoria/lote')
        .set(...bearer(login.accessToken))
        .send({ registros: [{ ...r1, detalhe: { forjado: 'sim' } }] });
      expect(adulterado.status).toBe(422);
      expect(corpoDe<Erro>(adulterado).erro.motivos).toEqual(['hash']);
      expect((await request(a.http()).post('/auditoria/lote').send({ registros: [r1] })).status).toBe(401);
    });

    it('lote vazio e campo extra devolvem 400', async () => {
      const { login } = await usuarioLogado(a);
      expect((await request(a.http()).post('/auditoria/lote').set(...bearer(login.accessToken)).send({ registros: [] })).status).toBe(400);
      expect((await request(a.http()).post('/auditoria/lote').set(...bearer(login.accessToken)).send({ registros: [], x: 1 })).status).toBe(400);
    });
  });

  describe('POST /usuarios/:id/desativar', () => {
    it('o único proprietário não pode ser desativado (409 ULTIMO_PROPRIETARIO)', async () => {
      const { login } = await usuarioLogado(a);
      const r = await request(a.http()).post(`/usuarios/${login.usuario.id}/desativar`).set(...bearer(login.accessToken));
      expect(r.status).toBe(409);
      expect(corpoDe<Erro>(r).erro.codigo).toBe('ULTIMO_PROPRIETARIO');
    });

    it('UUID inexistente devolve 404, id malformado 400 e sem Bearer 401', async () => {
      const { login } = await usuarioLogado(a);
      const inexistente = await request(a.http())
        .post('/usuarios/3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b/desativar')
        .set(...bearer(login.accessToken));
      expect(inexistente.status).toBe(404);
      expect(corpoDe<Erro>(inexistente).erro.codigo).toBe('USUARIO_NAO_ENCONTRADO');
      expect((await request(a.http()).post('/usuarios/nao-e-uuid/desativar').set(...bearer(login.accessToken))).status).toBe(400);
      expect((await request(a.http()).post(`/usuarios/${login.usuario.id}/desativar`)).status).toBe(401);
    });
  });
});
