import { createHash } from 'node:crypto';
import type { CalculadoraDeHash } from '../../application/portas/index.js';

export class Sha256CalculadoraDeHash implements CalculadoraDeHash {
  sha256Hex(texto: string): string {
    return createHash('sha256').update(texto, 'utf8').digest('hex');
  }
}
