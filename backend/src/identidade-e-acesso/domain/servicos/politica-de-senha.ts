import type { PoliticaDeAcesso } from '../acesso/politica-de-acesso.js';
import { SenhaFraca, type MotivoSenhaFraca } from '../erros.js';
import type { Email } from '../usuario/email.js';

const TAMANHO_MAXIMO = 128;

export class PoliticaDeSenha {
  private readonly senhasComuns: ReadonlySet<string>;

  constructor(senhasComuns: ReadonlySet<string>) {
    this.senhasComuns = new Set([...senhasComuns].map((s) => s.toLowerCase()));
  }

  validar(senha: string, email: Email, politica: PoliticaDeAcesso): void {
    const motivos: MotivoSenhaFraca[] = [];
    const tamanho = Array.from(senha).length;
    const normalizada = senha.trim().toLowerCase();
    if (tamanho < politica.tamanhoMinimoSenha) motivos.push('curta');
    if (tamanho > TAMANHO_MAXIMO) motivos.push('longa');
    if (normalizada === email.valor || normalizada === email.parteLocal()) motivos.push('igual-ao-email');
    if (this.senhasComuns.has(senha.toLowerCase())) motivos.push('comum');
    if (motivos.length > 0) throw new SenhaFraca(motivos);
  }
}
