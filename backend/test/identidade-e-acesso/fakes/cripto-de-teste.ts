import { createHash, createPublicKey, verify } from 'node:crypto';
import type {
  CalculadoraDeHash,
  VerificadorDeAssinatura,
} from '../../../src/identidade-e-acesso/application/portas/index.js';

export function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

export class CalculadoraDeHashDeTeste implements CalculadoraDeHash {
  sha256Hex(texto: string): string {
    return sha256Hex(texto);
  }
}

const PREFIXO_SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

export class VerificadorDeAssinaturaDeTeste implements VerificadorDeAssinatura {
  verificarEd25519(mensagem: string, assinaturaB64: string, chavePublicaB64: string): boolean {
    try {
      const bruta = Buffer.from(chavePublicaB64, 'base64');
      if (bruta.length !== 32) return false;
      const chave = createPublicKey({ key: Buffer.concat([PREFIXO_SPKI_ED25519, bruta]), format: 'der', type: 'spki' });
      return verify(null, Buffer.from(mensagem, 'utf8'), chave, Buffer.from(assinaturaB64, 'base64'));
    } catch {
      return false;
    }
  }
}
