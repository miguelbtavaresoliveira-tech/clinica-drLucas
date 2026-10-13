import { criarPoliticaDeAcesso, type PoliticaDeAcesso } from '../../domain/index.js';
import type { Configuracao } from './configuracao.js';

/** Valida e congela a política vinda das variáveis de ambiente. */
export function politicaDaConfiguracao(c: Configuracao): PoliticaDeAcesso {
  return criarPoliticaDeAcesso({ ...c.politica });
}
