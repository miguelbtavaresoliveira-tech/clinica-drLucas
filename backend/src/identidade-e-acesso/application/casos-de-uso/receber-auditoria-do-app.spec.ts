import { describe, expect, it } from 'vitest';
import {
  CHAVE_PUBLICA_DE_TESTE,
  criarAmbienteDeTeste,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import {
  AuditoriaInvalida,
  ContextoDeAcesso,
  Dispositivo,
  DispositivoId,
  DispositivoRevogado,
  PROPRIETARIO,
  UsuarioId,
} from '../../domain/index.js';
import { ReceberAuditoriaDoApp, type RegistroRecebido } from './receber-auditoria-do-app.js';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const DISPOSITIVO = '22222222-2222-4222-8222-222222222222';

const R1: RegistroRecebido = {
  id: '7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01',
  ocorridoEm: '2026-10-13T12:00:00.000Z',
  tipo: 'desbloqueio-local-ok',
  usuarioId: USUARIO,
  dispositivoId: DISPOSITIVO,
  detalhe: { metodo: 'senha' },
  hashAnterior: null,
  hash: 'b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a',
  assinatura: 'GF3Oyr16Q05pZ0AsNlDUcFQrJ6s3NYfAjjjn1iD4HI9YY1FkG+YBhkPSKtvbSn9VKXHB+B3g6pEYjLhxMFWlAg==',
};

const R2: RegistroRecebido = {
  id: '7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c02',
  ocorridoEm: '2026-10-13T12:05:30.250Z',
  tipo: 'desbloqueio-local-falhou',
  usuarioId: USUARIO,
  dispositivoId: DISPOSITIVO,
  detalhe: { tentativa: 3, metodo: 'senha' },
  hashAnterior: R1.hash,
  hash: 'c7edbcc06f8a1c8cc116d7c219e116416d096d1f2b7c5f6a4d1fdb93a415c215',
  assinatura: '5fKIHaVqujfDRkxeXhrycN9Uq2Rt4PfWIRmFEoyVAz2gaaV6cUhdlp6PpIOUNwwEZfXyMz67mfVfe54Lr6yqCQ==',
};

async function montar(opcoes: { revogado?: boolean } = {}) {
  const amb = criarAmbienteDeTeste();
  amb.relogio.definir(new Date('2026-10-13T12:10:00.000Z'));
  const dispositivo = Dispositivo.reconstituir({
    id: DispositivoId.de(DISPOSITIVO),
    usuarioId: UsuarioId.de(USUARIO),
    apelido: 'MacBook',
    plataforma: 'macos',
    registradoEm: new Date('2026-10-01T00:00:00.000Z'),
    ultimoCheckIn: new Date('2026-10-13T11:00:00.000Z'),
    biometriaHabilitada: false,
    situacao: opcoes.revogado === true ? 'revogado' : 'ativo',
    revogadoEm: opcoes.revogado === true ? new Date('2026-10-12T00:00:00.000Z') : null,
    motivoRevogacao: opcoes.revogado === true ? 'perdido' : null,
    chavePublicaAuditoria: CHAVE_PUBLICA_DE_TESTE,
    versao: 0,
  });
  await amb.repos.dispositivos.salvar(dispositivo);
  const ctx = new ContextoDeAcesso(UsuarioId.de(USUARIO), DispositivoId.de(DISPOSITIVO), [PROPRIETARIO]);
  const caso = new ReceberAuditoriaDoApp({ uow: amb.uow, relogio: amb.relogio, hash: amb.hash, assinatura: amb.assinatura });
  const enviar = (registros: RegistroRecebido[]) => caso.executar({ ctx, registros, ip: '7.7.7.7' });
  const gravados = (): number => amb.repos.auditoria.registros.length;
  return { amb, ctx, enviar, gravados };
}

async function motivoDe(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(AuditoriaInvalida);
    return (e as AuditoriaInvalida).motivo;
  }
  throw new Error('esperava AuditoriaInvalida');
}

describe('ReceberAuditoriaDoApp (vetores D-009)', () => {
  it('aceita o lote [R1, R2] e grava com o ip', async () => {
    const { amb, enviar } = await montar();
    expect(await enviar([R1, R2])).toEqual({ aceitos: 2, ignorados: 0 });
    expect(amb.repos.auditoria.registros).toMatchObject([
      { origem: 'app', id: R1.id, ip: '7.7.7.7', hash: R1.hash },
      { origem: 'app', id: R2.id, hashAnterior: R1.hash },
    ]);
  });

  it('reenviar o mesmo lote é idempotente', async () => {
    const { enviar, gravados } = await montar();
    await enviar([R1, R2]);
    expect(await enviar([R1, R2])).toEqual({ aceitos: 0, ignorados: 2 });
    expect(gravados()).toBe(2);
  });

  it('retransmissão parcial: [R1 existente, R2 novo] aceita só o novo', async () => {
    const { enviar } = await montar();
    await enviar([R1]);
    expect(await enviar([R1, R2])).toEqual({ aceitos: 1, ignorados: 1 });
  });

  it('existente depois de novo lança ordem', async () => {
    const { enviar } = await montar();
    await enviar([R1]);
    const outro = { ...R2, id: '7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c03' };
    expect(await motivoDe(enviar([outro, R1]))).toBe('ordem');
  });

  it('enviar [R2] sem R1 lança encadeamento e nada é gravado', async () => {
    const { enviar, gravados } = await montar();
    expect(await motivoDe(enviar([R2]))).toBe('encadeamento');
    expect(gravados()).toBe(0);
  });

  it('detalhe alterado lança hash e nada é gravado (nem R1)', async () => {
    const { enviar, gravados } = await montar();
    expect(await motivoDe(enviar([R1, { ...R2, detalhe: { tentativa: 4, metodo: 'senha' } }]))).toBe('hash');
    expect(gravados()).toBe(0);
  });

  it('assinatura trocada lança assinatura', async () => {
    const { enviar } = await montar();
    expect(await motivoDe(enviar([{ ...R1, assinatura: R2.assinatura }]))).toBe('assinatura');
  });

  it('usuarioId de outro usuário lança usuario; dispositivoId de outro lança dispositivo', async () => {
    const { enviar } = await montar();
    expect(await motivoDe(enviar([{ ...R1, usuarioId: UsuarioId.novo().valor }]))).toBe('usuario');
    expect(await motivoDe(enviar([{ ...R1, dispositivoId: DispositivoId.novo().valor }]))).toBe('dispositivo');
  });

  it('tipo que o app não pode enviar lança tipo', async () => {
    const { enviar } = await montar();
    expect(await motivoDe(enviar([{ ...R1, tipo: 'login-ok' }]))).toBe('tipo');
    expect(await motivoDe(enviar([{ ...R1, tipo: 'inventado' }]))).toBe('tipo');
  });

  it('id que não é UUID lança id', async () => {
    const { enviar } = await montar();
    expect(await motivoDe(enviar([{ ...R1, id: 'abc' }]))).toBe('id');
  });

  it.each(['2026-10-13T13:10:00.000Z', '2026-10-13 12:00:00', '2026-10-13T12:00:00Z', '2026-02-30T12:00:00.000Z'])(
    'data %s lança data',
    async (ocorridoEm) => {
      const { enviar } = await montar();
      expect(await motivoDe(enviar([{ ...R1, ocorridoEm }]))).toBe('data');
    },
  );

  it('data dentro da tolerância de 5 minutos no futuro não é rejeitada por data', async () => {
    const { enviar } = await montar();
    expect(await motivoDe(enviar([{ ...R1, ocorridoEm: '2026-10-13T12:15:00.000Z' }]))).toBe('hash');
  });

  it.each([{ a: {} }, [], null, { a: 1.5 }])('detalhe %j lança detalhe', async (detalhe) => {
    const { enviar } = await montar();
    expect(await motivoDe(enviar([{ ...R1, detalhe }]))).toBe('detalhe');
  });

  it('lote vazio e lote com 501 lançam tamanho-do-lote', async () => {
    const { enviar } = await montar();
    expect(await motivoDe(enviar([]))).toBe('tamanho-do-lote');
    expect(await motivoDe(enviar(Array.from({ length: 501 }, () => R1)))).toBe('tamanho-do-lote');
  });

  it('hash com formato inválido lança hash', async () => {
    const { enviar } = await montar();
    expect(await motivoDe(enviar([{ ...R1, hash: 'XYZ' }]))).toBe('hash');
  });

  it('dispositivo revogado lança DispositivoRevogado e nada é gravado', async () => {
    const { enviar, gravados } = await montar({ revogado: true });
    await expect(enviar([R1])).rejects.toThrow(DispositivoRevogado);
    expect(gravados()).toBe(0);
  });
});
