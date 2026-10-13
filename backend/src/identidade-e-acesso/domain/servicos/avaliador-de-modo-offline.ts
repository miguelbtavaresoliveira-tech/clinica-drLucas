import type { PoliticaDeAcesso } from '../acesso/politica-de-acesso.js';

export type ModoDeOperacao = 'normal' | 'somente-leitura' | 'bloqueado';

const MS_POR_DIA = 86_400_000;

export class AvaliadorDeModoOffline {
  avaliar(d: {
    agora: Date;
    ultimoCheckIn: Date;
    marcaDagua: Date | null;
    politica: PoliticaDeAcesso;
  }): ModoDeOperacao {
    const relogioRetrocedeu = d.marcaDagua !== null && d.agora.getTime() < d.marcaDagua.getTime();
    const alemDoLimite =
      d.agora.getTime() - d.ultimoCheckIn.getTime() > d.politica.limiteDiasOffline * MS_POR_DIA;
    if (!relogioRetrocedeu && !alemDoLimite) return 'normal';
    return d.politica.leituraPermitidaAposLimite ? 'somente-leitura' : 'bloqueado';
  }
}
