import { describe, expect, it } from 'vitest';
import { Ed25519VerificadorDeAssinatura } from './ed25519-verificador-de-assinatura.js';

const CHAVE = 'ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=';
const HASH_R1 = 'b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a';
const ASSINATURA_R1 =
  'GF3Oyr16Q05pZ0AsNlDUcFQrJ6s3NYfAjjjn1iD4HI9YY1FkG+YBhkPSKtvbSn9VKXHB+B3g6pEYjLhxMFWlAg==';
const HASH_R2 = 'c7edbcc06f8a1c8cc116d7c219e116416d096d1f2b7c5f6a4d1fdb93a415c215';
const ASSINATURA_R2 =
  '5fKIHaVqujfDRkxeXhrycN9Uq2Rt4PfWIRmFEoyVAz2gaaV6cUhdlp6PpIOUNwwEZfXyMz67mfVfe54Lr6yqCQ==';

describe('Ed25519VerificadorDeAssinatura (vetores D-009)', () => {
  const verificador = new Ed25519VerificadorDeAssinatura();

  it('aceita as assinaturas R1 e R2', () => {
    expect(verificador.verificarEd25519(HASH_R1, ASSINATURA_R1, CHAVE)).toBe(true);
    expect(verificador.verificarEd25519(HASH_R2, ASSINATURA_R2, CHAVE)).toBe(true);
  });

  it('rejeita mensagem alterada e assinatura de outro registro', () => {
    expect(verificador.verificarEd25519(`${HASH_R1.slice(0, -1)}9`, ASSINATURA_R1, CHAVE)).toBe(false);
    expect(verificador.verificarEd25519(HASH_R1, ASSINATURA_R2, CHAVE)).toBe(false);
  });

  it('rejeita assinatura com base64 inválido ou tamanho errado sem lançar', () => {
    expect(verificador.verificarEd25519(HASH_R1, '%%%', CHAVE)).toBe(false);
    expect(verificador.verificarEd25519(HASH_R1, 'AAAA', CHAVE)).toBe(false);
    expect(verificador.verificarEd25519(HASH_R1, '', CHAVE)).toBe(false);
  });

  it('rejeita chave com 31 bytes e chave diferente', () => {
    const chave31 = Buffer.alloc(31, 1).toString('base64');
    expect(verificador.verificarEd25519(HASH_R1, ASSINATURA_R1, chave31)).toBe(false);
    const outra = Buffer.alloc(32, 7).toString('base64');
    expect(verificador.verificarEd25519(HASH_R1, ASSINATURA_R1, outra)).toBe(false);
  });
});
