import { createHash, randomBytes } from 'node:crypto';
import type { GeradorDeCodigosDeRecuperacao } from '../../application/portas/index.js';

const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 10 bytes (80 bits) → 16 caracteres Crockford base32 (5 bits cada). */
function codificarCrockford(bytes: Uint8Array): string {
  let bits = 0;
  let acumulado = 0;
  let saida = '';
  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_CROCKFORD[(acumulado >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acumulado &= (1 << bits) - 1;
  }
  return saida;
}

export class GeradorDeCodigosCrockford implements GeradorDeCodigosDeRecuperacao {
  gerar(quantidade: number): { codigo: string; hash: string }[] {
    return Array.from({ length: quantidade }, () => {
      const bruto = codificarCrockford(randomBytes(10));
      const codigo = [0, 4, 8, 12].map((i) => bruto.slice(i, i + 4)).join('-');
      return { codigo, hash: this.hashDe(codigo) };
    });
  }

  hashDe(codigo: string): string {
    const normalizado = codigo
      .toUpperCase()
      .replace(/[-\s]/g, '')
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1');
    return createHash('sha256').update(normalizado, 'utf8').digest('hex');
  }
}
