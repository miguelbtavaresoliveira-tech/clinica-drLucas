import { EmailInvalido } from '../erros.js';

const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAMANHO_MAXIMO = 254;

export class Email {
  private constructor(readonly valor: string) {}

  static criar(bruto: string): Email {
    const valor = bruto.trim().toLowerCase();
    if (valor.length > TAMANHO_MAXIMO || !FORMATO.test(valor)) throw new EmailInvalido();
    return new Email(valor);
  }

  parteLocal(): string {
    return this.valor.slice(0, this.valor.indexOf('@'));
  }

  igual(outro: Email): boolean {
    return this.valor === outro.valor;
  }
}
