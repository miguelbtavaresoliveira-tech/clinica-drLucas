import type { ResultadoTotp, ServicoTotp } from '../../../src/identidade-e-acesso/application/portas/index.js';

export class ServicoTotpFalso implements ServicoTotp {
  /** código → passo */
  readonly codigosValidos = new Map<string, number>();
  chamadasDeVerificar = 0;
  private contador = 0;

  novoSegredo(): string {
    this.contador += 1;
    return `SEGREDO${String(this.contador)}`;
  }

  urlDoAutenticador(segredo: string, _email: string): string {
    return `otpauth://totp/teste?secret=${segredo}`;
  }

  verificar(_segredo: string, codigo: string, ultimoPasso: number | null): ResultadoTotp {
    this.chamadasDeVerificar += 1;
    const passo = this.codigosValidos.get(codigo);
    return {
      valido: passo !== undefined && (ultimoPasso === null || passo > ultimoPasso),
      passo: passo ?? -1,
    };
  }
}
