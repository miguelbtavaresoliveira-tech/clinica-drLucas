import type { PoliticaDeAcesso } from '../acesso/politica-de-acesso.js';
import { LimiteDeDispositivosAtingido } from '../erros.js';

export class PoliticaDeLimiteDeDispositivos {
  garantirQuePodeRegistrar(dispositivosAtivos: number, politica: PoliticaDeAcesso): void {
    if (dispositivosAtivos >= politica.maxDispositivosAtivos) {
      throw new LimiteDeDispositivosAtingido(politica.maxDispositivosAtivos);
    }
  }
}
