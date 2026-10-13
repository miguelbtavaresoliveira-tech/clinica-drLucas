import { DadoInvalido } from '../erros.js';

export interface PoliticaDeAcesso {
  readonly inatividadeMin: number;
  readonly limiteDiasOffline: number;
  readonly leituraPermitidaAposLimite: boolean;
  readonly maxTentativasLogin: number;
  readonly bloqueioProgressivoMin: readonly number[];
  readonly maxDispositivosAtivos: number;
  readonly tamanhoMinimoSenha: number;
  readonly validadeAccessMin: number;
  readonly validadeRefreshDias: number;
  readonly janelaReautenticacaoMin: number;
  readonly maxFalhasDesbloqueioLocal: number;
}

export const POLITICA_PADRAO: PoliticaDeAcesso = Object.freeze({
  inatividadeMin: 10,
  limiteDiasOffline: 5,
  leituraPermitidaAposLimite: true,
  maxTentativasLogin: 5,
  bloqueioProgressivoMin: Object.freeze([1, 5, 15, 60]),
  maxDispositivosAtivos: 3,
  tamanhoMinimoSenha: 12,
  validadeAccessMin: 15,
  validadeRefreshDias: 30,
  janelaReautenticacaoMin: 5,
  maxFalhasDesbloqueioLocal: 10,
});

const CAMPOS_INTEIROS = [
  'inatividadeMin',
  'limiteDiasOffline',
  'maxTentativasLogin',
  'maxDispositivosAtivos',
  'tamanhoMinimoSenha',
  'validadeAccessMin',
  'validadeRefreshDias',
  'janelaReautenticacaoMin',
  'maxFalhasDesbloqueioLocal',
] as const;

export function criarPoliticaDeAcesso(p: PoliticaDeAcesso): PoliticaDeAcesso {
  for (const campo of CAMPOS_INTEIROS) {
    if (!Number.isInteger(p[campo]) || p[campo] < 1) throw new DadoInvalido(campo);
  }
  if (p.tamanhoMinimoSenha < 12) throw new DadoInvalido('tamanhoMinimoSenha');
  const escada = p.bloqueioProgressivoMin;
  const valida =
    escada.length > 0 &&
    escada.every((n, i) => Number.isInteger(n) && n >= 1 && (i === 0 || n > (escada[i - 1] as number)));
  if (!valida) throw new DadoInvalido('bloqueioProgressivoMin');
  return Object.freeze({ ...p, bloqueioProgressivoMin: Object.freeze([...escada]) });
}
