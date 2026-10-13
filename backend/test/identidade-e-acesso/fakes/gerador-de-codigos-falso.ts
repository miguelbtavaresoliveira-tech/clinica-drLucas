import type { GeradorDeCodigosDeRecuperacao } from '../../../src/identidade-e-acesso/application/portas/index.js';
import { sha256Hex } from './cripto-de-teste.js';

export class GeradorDeCodigosFalso implements GeradorDeCodigosDeRecuperacao {
  /** nunca reinicia: cada geração produz códigos novos */
  private n = 0;

  gerar(quantidade: number): { codigo: string; hash: string }[] {
    return Array.from({ length: quantidade }, () => {
      this.n += 1;
      const digitos = String(this.n).padStart(12, '0');
      const codigo = `TEST-${digitos.slice(0, 4)}-${digitos.slice(4, 8)}-${digitos.slice(8, 12)}`;
      return { codigo, hash: this.hashDe(codigo) };
    });
  }

  hashDe(codigo: string): string {
    const normalizado = codigo
      .toUpperCase()
      .replace(/[-\s]/g, '')
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1');
    return sha256Hex(normalizado);
  }
}
