import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmCofreDeSegredos } from './aes-gcm-cofre-de-segredos.js';

const SEGREDO = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe('AesGcmCofreDeSegredos', () => {
  const chave = new Uint8Array(randomBytes(32));
  const cofre = new AesGcmCofreDeSegredos(chave);

  it('ida e volta, no formato 0x01 || iv || cifrado || tag', async () => {
    const cifrado = await cofre.cifrar(SEGREDO);
    expect(cifrado[0]).toBe(0x01);
    expect(cifrado.length).toBe(1 + 12 + SEGREDO.length + 16);
    expect(await cofre.decifrar(cifrado)).toBe(SEGREDO);
  });

  it('o texto em claro não aparece nos bytes cifrados', async () => {
    const cifrado = await cofre.cifrar(SEGREDO);
    expect(Buffer.from(cifrado).includes(Buffer.from(SEGREDO))).toBe(false);
  });

  it('duas cifras do mesmo texto diferem (IV aleatório)', async () => {
    const [a, b] = [await cofre.cifrar(SEGREDO), await cofre.cifrar(SEGREDO)];
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('alterar 1 byte do cifrado falha a autenticação', async () => {
    const cifrado = await cofre.cifrar(SEGREDO);
    cifrado[20] = (cifrado[20] as number) ^ 0xff;
    await expect(cofre.decifrar(cifrado)).rejects.toThrow('Falha ao decifrar segredo');
  });

  it('alterar o IV ou a tag falha a autenticação', async () => {
    const original = await cofre.cifrar(SEGREDO);
    const comIvAlterado = Uint8Array.from(original);
    comIvAlterado[2] = (comIvAlterado[2] as number) ^ 1;
    await expect(cofre.decifrar(comIvAlterado)).rejects.toThrow('Falha ao decifrar segredo');
    const comTagAlterada = Uint8Array.from(original);
    comTagAlterada[comTagAlterada.length - 1] = (comTagAlterada.at(-1) as number) ^ 1;
    await expect(cofre.decifrar(comTagAlterada)).rejects.toThrow('Falha ao decifrar segredo');
  });

  it('chave diferente falha', async () => {
    const outro = new AesGcmCofreDeSegredos(new Uint8Array(randomBytes(32)));
    await expect(outro.decifrar(await cofre.cifrar(SEGREDO))).rejects.toThrow('Falha ao decifrar segredo');
  });

  it('versão desconhecida e dados curtos lançam erro de formato', async () => {
    const cifrado = await cofre.cifrar(SEGREDO);
    cifrado[0] = 0x02;
    await expect(cofre.decifrar(cifrado)).rejects.toThrow('Segredo cifrado em formato desconhecido');
    await expect(cofre.decifrar(new Uint8Array(29))).rejects.toThrow('Segredo cifrado em formato desconhecido');
  });

  it('chave de 31 bytes no construtor lança', () => {
    expect(() => new AesGcmCofreDeSegredos(new Uint8Array(31))).toThrow('Chave de cifra inválida');
  });

  it('as mensagens de erro não contêm o texto original', async () => {
    const cifrado = await cofre.cifrar(SEGREDO);
    cifrado[20] = (cifrado[20] as number) ^ 0xff;
    const erro = await cofre.decifrar(cifrado).catch((e: Error) => e);
    expect((erro as Error).message).not.toContain(SEGREDO);
  });
});
