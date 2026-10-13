import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { CofreDeSegredos } from '../../application/portas/index.js';

const VERSAO = 0x01;
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;
const TAMANHO_MINIMO = 1 + TAMANHO_IV + 1 + TAMANHO_TAG;
const AAD = Buffer.from('identidade.mfa.v1');

/** Formato: 0x01 || iv(12) || cifrado || tag(16), com AAD fixo. */
export class AesGcmCofreDeSegredos implements CofreDeSegredos {
  private readonly chave: Buffer;

  constructor(chave: Uint8Array) {
    if (chave.length !== 32) throw new Error('Chave de cifra inválida');
    this.chave = Buffer.from(chave);
  }

  cifrar(texto: string): Promise<Uint8Array> {
    const iv = randomBytes(TAMANHO_IV);
    const cifra = createCipheriv('aes-256-gcm', this.chave, iv);
    cifra.setAAD(AAD);
    const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
    return Promise.resolve(new Uint8Array(Buffer.concat([Buffer.from([VERSAO]), iv, cifrado, cifra.getAuthTag()])));
  }

  decifrar(dados: Uint8Array): Promise<string> {
    if (dados.length < TAMANHO_MINIMO || dados[0] !== VERSAO) {
      return Promise.reject(new Error('Segredo cifrado em formato desconhecido'));
    }
    const buffer = Buffer.from(dados);
    const iv = buffer.subarray(1, 1 + TAMANHO_IV);
    const tag = buffer.subarray(buffer.length - TAMANHO_TAG);
    const cifrado = buffer.subarray(1 + TAMANHO_IV, buffer.length - TAMANHO_TAG);
    try {
      const decifra = createDecipheriv('aes-256-gcm', this.chave, iv);
      decifra.setAAD(AAD);
      decifra.setAuthTag(tag);
      return Promise.resolve(Buffer.concat([decifra.update(cifrado), decifra.final()]).toString('utf8'));
    } catch {
      return Promise.reject(new Error('Falha ao decifrar segredo'));
    }
  }
}
