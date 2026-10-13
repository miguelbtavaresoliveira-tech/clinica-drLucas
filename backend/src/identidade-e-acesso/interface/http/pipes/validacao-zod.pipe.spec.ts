import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidacaoZodPipe } from './validacao-zod.pipe.js';

const esquema = z
  .object({
    email: z.string().max(254),
    senha: z.string().min(1).max(128),
    dispositivo: z.object({ apelido: z.string().min(1) }).strict(),
  })
  .strict();

const pipe = new ValidacaoZodPipe(esquema);

function capturar(valor: unknown): BadRequestException {
  try {
    pipe.transform(valor);
  } catch (e) {
    return e as BadRequestException;
  }
  throw new Error('esperava BadRequestException');
}

describe('ValidacaoZodPipe', () => {
  it('aceita um valor válido e devolve os dados', () => {
    const entrada = { email: 'a@b.com', senha: 'x', dispositivo: { apelido: 'Mac' } };
    expect(pipe.transform(entrada)).toEqual(entrada);
  });

  it('valor inválido devolve 400 com os caminhos e nunca o valor enviado', () => {
    const erro = capturar({ email: 'a@b.com', senha: 12345, dispositivo: { apelido: 'segredo-123' }, extra: 'segredo-123' });
    expect(erro.getStatus()).toBe(400);
    const corpo = erro.getResponse() as { erro: { codigo: string; mensagem: string; campos: string[] } };
    expect(corpo.erro.codigo).toBe('REQUISICAO_INVALIDA');
    expect(corpo.erro.mensagem).toBe('Requisição inválida.');
    expect(corpo.erro.campos.sort()).toEqual(['extra', 'senha']);
    expect(JSON.stringify(corpo)).not.toContain('segredo-123');
    expect(JSON.stringify(corpo)).not.toContain('12345');
  });

  it('campos extras (strict) viram 400, inclusive aninhados', () => {
    const erro = capturar({ email: 'a@b.com', senha: 'x', dispositivo: { apelido: 'Mac', admin: true } });
    expect((erro.getResponse() as { erro: { campos: string[] } }).erro.campos).toEqual(['dispositivo.admin']);
  });

  it('caminhos repetidos aparecem uma única vez e o corpo ausente é tratado', () => {
    const erro = capturar(undefined);
    expect((erro.getResponse() as { erro: { campos: string[] } }).erro.campos).toEqual(['(corpo)']);
    const longo = capturar({ email: 'x'.repeat(300), senha: '', dispositivo: { apelido: 'Mac' } });
    expect((longo.getResponse() as { erro: { campos: string[] } }).erro.campos.sort()).toEqual(['email', 'senha']);
  });
});
