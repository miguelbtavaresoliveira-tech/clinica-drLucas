import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { esquemaLoteDeAuditoria, esquemaRegistroRecebido } from './auditoria.dtos.js';
import {
  esquemaConcluirLogin,
  esquemaConcluirRedefinicao,
  esquemaConfirmarMfa,
  esquemaConfirmarReconfiguracao,
  esquemaGerarSegredo,
  esquemaIniciarLogin,
  esquemaIniciarReconfiguracao,
  esquemaRegenerarCodigos,
  esquemaRenovarSessao,
  esquemaSolicitarRedefinicao,
  esquemaTrocarSenha,
} from './auth.dtos.js';
import { esquemaCodigoInformado } from './comuns.js';
import { esquemaRevogarDispositivo } from './dispositivos.dtos.js';

const UUID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const TOKEN = 'A'.repeat(43);
const CHAVE = `${'A'.repeat(43)}=`;
const HEX = 'a'.repeat(64);

const dispositivo = { id: UUID, apelido: 'MacBook', plataforma: 'macos', chavePublicaAuditoria: CHAVE };
const registro = {
  id: UUID,
  ocorridoEm: '2026-10-13T12:00:00.000Z',
  tipo: 'desbloqueio-local-ok',
  usuarioId: UUID,
  dispositivoId: UUID,
  detalhe: { metodo: 'senha', tentativa: 1, ok: true, nulo: null },
  hashAnterior: null,
  hash: HEX,
  assinatura: 'GF3Oyr16Q05pZ0AsNlDUcFQrJ6s3NYfAjjjn1iD4HI9YY1FkG+YBhkPSKtvbSn9VKXHB+B3g6pEYjLhxMFWlAg==',
};

interface Caso {
  nome: string;
  esquema: z.ZodType;
  valido: unknown;
  invalidos: [string, unknown][];
}

const casos: Caso[] = [
  {
    nome: 'iniciarLogin',
    esquema: esquemaIniciarLogin,
    valido: { email: 'a@b.com', senha: 'x' },
    invalidos: [
      ['campo extra', { email: 'a@b.com', senha: 'x', admin: true }],
      ['senha com 129 caracteres', { email: 'a@b.com', senha: 'x'.repeat(129) }],
      ['senha vazia', { email: 'a@b.com', senha: '' }],
      ['e-mail com 255 caracteres', { email: 'x'.repeat(255), senha: 'x' }],
      ['tipo errado', { email: 1, senha: 'x' }],
    ],
  },
  {
    nome: 'gerarSegredo',
    esquema: esquemaGerarSegredo,
    valido: { desafio: 'abc' },
    invalidos: [
      ['campo extra', { desafio: 'abc', x: 1 }],
      ['desafio com 2049 caracteres', { desafio: 'x'.repeat(2049) }],
    ],
  },
  {
    nome: 'confirmarMfa',
    esquema: esquemaConfirmarMfa,
    valido: { desafio: 'abc', codigo: '123456' },
    invalidos: [
      ['código com 5 dígitos', { desafio: 'abc', codigo: '12345' }],
      ['código com letras', { desafio: 'abc', codigo: '12345a' }],
      ['campo extra', { desafio: 'abc', codigo: '123456', x: 1 }],
    ],
  },
  {
    nome: 'concluirLogin',
    esquema: esquemaConcluirLogin,
    valido: { desafio: 'abc', codigo: { tipo: 'totp', valor: '123456' }, dispositivo },
    invalidos: [
      ['campo extra no dispositivo', { desafio: 'abc', codigo: { tipo: 'totp', valor: '123456' }, dispositivo: { ...dispositivo, x: 1 } }],
      ['plataforma linux', { desafio: 'abc', codigo: { tipo: 'totp', valor: '123456' }, dispositivo: { ...dispositivo, plataforma: 'linux' } }],
      ['apelido com 61 caracteres', { desafio: 'abc', codigo: { tipo: 'totp', valor: '123456' }, dispositivo: { ...dispositivo, apelido: 'x'.repeat(61) } }],
      ['chave pública sem =', { desafio: 'abc', codigo: { tipo: 'totp', valor: '123456' }, dispositivo: { ...dispositivo, chavePublicaAuditoria: 'A'.repeat(44) } }],
      ['id do dispositivo não-UUID', { desafio: 'abc', codigo: { tipo: 'totp', valor: '123456' }, dispositivo: { ...dispositivo, id: 'abc' } }],
    ],
  },
  {
    nome: 'renovarSessao',
    esquema: esquemaRenovarSessao,
    valido: { refreshToken: TOKEN, dispositivoId: UUID },
    invalidos: [
      ['refresh com 42 caracteres', { refreshToken: 'A'.repeat(42), dispositivoId: UUID }],
      ['refresh com caractere inválido', { refreshToken: `${'A'.repeat(42)}!`, dispositivoId: UUID }],
      ['dispositivoId inválido', { refreshToken: TOKEN, dispositivoId: 'x' }],
    ],
  },
  {
    nome: 'trocarSenha',
    esquema: esquemaTrocarSenha,
    valido: { senhaAtual: 'x', novaSenha: 'y' },
    invalidos: [
      ['nova senha com 129 caracteres', { senhaAtual: 'x', novaSenha: 'y'.repeat(129) }],
      ['campo extra', { senhaAtual: 'x', novaSenha: 'y', z: 1 }],
    ],
  },
  {
    nome: 'solicitarRedefinicao',
    esquema: esquemaSolicitarRedefinicao,
    valido: { email: 'a@b.com' },
    invalidos: [
      ['e-mail com 255 caracteres', { email: 'x'.repeat(255) }],
      ['campo extra', { email: 'a@b.com', x: 1 }],
    ],
  },
  {
    nome: 'concluirRedefinicao',
    esquema: esquemaConcluirRedefinicao,
    valido: { token: TOKEN, novaSenha: 'y', codigo: { tipo: 'recuperacao', valor: 'ABCD-EFGH-JKMN-PQRS' } },
    invalidos: [
      ['token curto', { token: 'A', novaSenha: 'y', codigo: { tipo: 'totp', valor: '123456' } }],
      ['código de recuperação com 20 caracteres', { token: TOKEN, novaSenha: 'y', codigo: { tipo: 'recuperacao', valor: 'x'.repeat(20) } }],
    ],
  },
  {
    nome: 'regenerarCodigos',
    esquema: esquemaRegenerarCodigos,
    valido: { codigoMfa: '123456' },
    invalidos: [['código com 7 dígitos', { codigoMfa: '1234567' }]],
  },
  {
    nome: 'iniciarReconfiguracao',
    esquema: esquemaIniciarReconfiguracao,
    valido: { senhaAtual: 'x' },
    invalidos: [['campo extra', { senhaAtual: 'x', y: 1 }]],
  },
  {
    nome: 'confirmarReconfiguracao',
    esquema: esquemaConfirmarReconfiguracao,
    valido: { codigo: '123456' },
    invalidos: [['código com letras', { codigo: 'abcdef' }]],
  },
  {
    nome: 'revogarDispositivo',
    esquema: esquemaRevogarDispositivo,
    valido: { motivo: 'perdido', codigoMfa: '123456' },
    invalidos: [
      ['motivo com 2 caracteres', { motivo: 'ab', codigoMfa: '123456' }],
      ['motivo com 201 caracteres', { motivo: 'x'.repeat(201), codigoMfa: '123456' }],
      ['campo extra', { motivo: 'perdido', codigoMfa: '123456', x: 1 }],
    ],
  },
  {
    nome: 'registroRecebido',
    esquema: esquemaRegistroRecebido,
    valido: registro,
    invalidos: [
      ['campo extra', { ...registro, x: 1 }],
      ['hash em maiúsculas', { ...registro, hash: 'A'.repeat(64) }],
      ['hashAnterior com 63 caracteres', { ...registro, hashAnterior: 'a'.repeat(63) }],
      ['detalhe aninhado', { ...registro, detalhe: { a: {} } }],
      ['ocorridoEm com 31 caracteres', { ...registro, ocorridoEm: 'x'.repeat(31) }],
      ['assinatura com 101 caracteres', { ...registro, assinatura: 'A'.repeat(101) }],
      ['assinatura com caracteres inválidos', { ...registro, assinatura: 'não é base64!' }],
    ],
  },
];

describe.each(casos)('esquema $nome', ({ esquema, valido, invalidos }) => {
  it('aceita um caso válido', () => {
    expect(esquema.safeParse(valido).success).toBe(true);
  });

  it.each(invalidos)('rejeita: %s', (_nome, entrada) => {
    expect(esquema.safeParse(entrada).success).toBe(false);
  });
});

describe('esquemaCodigoInformado', () => {
  it.each([
    [{ tipo: 'totp', valor: '123456' }],
    [{ tipo: 'recuperacao', valor: 'ABCD-EFGH-JKMN-PQRS' }],
    [{ tipo: 'recuperacao', valor: 'x'.repeat(16) }],
  ])('aceita %j', (entrada) => {
    expect(esquemaCodigoInformado.safeParse(entrada).success).toBe(true);
  });

  it.each([
    [{ tipo: 'sms', valor: '123456' }],
    [{ tipo: 'totp', valor: '12345' }],
    [{ tipo: 'recuperacao', valor: 'x'.repeat(15) }],
    [{ tipo: 'recuperacao', valor: 'x'.repeat(20) }],
    [{ tipo: 'totp', valor: '123456', extra: 1 }],
    [{ valor: '123456' }],
  ])('rejeita %j', (entrada) => {
    expect(esquemaCodigoInformado.safeParse(entrada).success).toBe(false);
  });
});

describe('esquemaLoteDeAuditoria', () => {
  it('aceita de 1 a 500 registros', () => {
    expect(esquemaLoteDeAuditoria.safeParse({ registros: [registro] }).success).toBe(true);
    expect(esquemaLoteDeAuditoria.safeParse({ registros: Array.from({ length: 500 }, () => registro) }).success).toBe(true);
  });

  it('rejeita lista vazia, 501 registros e campo extra', () => {
    expect(esquemaLoteDeAuditoria.safeParse({ registros: [] }).success).toBe(false);
    expect(esquemaLoteDeAuditoria.safeParse({ registros: Array.from({ length: 501 }, () => registro) }).success).toBe(false);
    expect(esquemaLoteDeAuditoria.safeParse({ registros: [registro], x: 1 }).success).toBe(false);
  });
});
