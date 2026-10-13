import { createPublicKey, verify } from 'node:crypto';
import type { VerificadorDeAssinatura } from '../../application/portas/index.js';

const PREFIXO_SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
const TAMANHO_CHAVE = 32;
const TAMANHO_ASSINATURA = 64;

export class Ed25519VerificadorDeAssinatura implements VerificadorDeAssinatura {
  verificarEd25519(mensagem: string, assinaturaB64: string, chavePublicaB64: string): boolean {
    try {
      const chave = Buffer.from(chavePublicaB64, 'base64');
      const assinatura = Buffer.from(assinaturaB64, 'base64');
      if (chave.length !== TAMANHO_CHAVE || assinatura.length !== TAMANHO_ASSINATURA) return false;
      const publica = createPublicKey({
        key: Buffer.concat([PREFIXO_SPKI_ED25519, chave]),
        format: 'der',
        type: 'spki',
      });
      return verify(null, Buffer.from(mensagem, 'utf8'), publica, assinatura);
    } catch {
      return false;
    }
  }
}
