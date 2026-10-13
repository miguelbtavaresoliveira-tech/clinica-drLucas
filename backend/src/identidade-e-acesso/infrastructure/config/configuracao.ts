import { z } from 'zod';

export interface ParametrosDePolitica {
  inatividadeMin: number;
  limiteDiasOffline: number;
  leituraPermitidaAposLimite: boolean;
  maxTentativasLogin: number;
  bloqueioProgressivoMin: number[];
  maxDispositivosAtivos: number;
  tamanhoMinimoSenha: number;
  validadeAccessMin: number;
  validadeRefreshDias: number;
  janelaReautenticacaoMin: number;
  maxFalhasDesbloqueioLocal: number;
}

export interface ConfiguracaoSmtp {
  host: string;
  porta: number;
  seguro: boolean;
  usuario: string;
  senha: string;
  remetente: string;
}

export interface Configuracao {
  ambiente: 'development' | 'test' | 'production';
  porta: number;
  databaseUrl: string;
  jwtAccessSegredo: string;
  jwtDesafioSegredo: string;
  totpChaveCifra: Uint8Array;
  smtp: ConfiguracaoSmtp | null;
  urlRedefinicaoSenha: string;
  trustProxy: boolean;
  politica: ParametrosDePolitica;
}

export class ConfiguracaoInvalida extends Error {
  constructor(readonly variaveis: readonly string[]) {
    super(`Configuração inválida: ${variaveis.join(', ')}`);
    this.name = 'ConfiguracaoInvalida';
  }
}

const inteiro = (padrao: number, minimo: number, maximo?: number) => {
  const base = z.coerce.number().int().min(minimo);
  return (maximo === undefined ? base : base.max(maximo)).default(padrao);
};

const booleano = (padrao: boolean) =>
  z
    .enum(['true', 'false'])
    .default(padrao ? 'true' : 'false')
    .transform((v) => v === 'true');

const listaCrescente = z
  .string()
  .default('1,5,15,60')
  .transform((s) => s.split(',').map((parte) => Number(parte.trim())))
  .refine((lista) => lista.every((n) => Number.isInteger(n) && n >= 1))
  .refine((lista) => lista.every((n, i) => i === 0 || n > (lista[i - 1] as number)));

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: inteiro(3000, 1, 65535),
    DATABASE_URL: z
      .string()
      .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'))
      .refine((v) => URL.canParse(v)),
    JWT_ACCESS_SEGREDO: z.string().min(32),
    JWT_DESAFIO_SEGREDO: z.string().min(32),
    TOTP_CHAVE_CIFRA_B64: z.string().refine((v) => Buffer.from(v, 'base64').length === 32),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORTA: inteiro(587, 1, 65535),
    SMTP_SEGURO: booleano(false),
    SMTP_USUARIO: z.string().min(1).optional(),
    SMTP_SENHA: z.string().min(1).optional(),
    SMTP_REMETENTE: z.email().optional(),
    URL_REDEFINICAO_SENHA: z.string().refine((v) => URL.canParse(v)),
    TRUST_PROXY: z
      .enum(['0', '1'])
      .default('0')
      .transform((v) => v === '1'),
    POLITICA_INATIVIDADE_MIN: inteiro(10, 1),
    POLITICA_LIMITE_DIAS_OFFLINE: inteiro(5, 1),
    POLITICA_LEITURA_APOS_LIMITE: booleano(true),
    POLITICA_MAX_TENTATIVAS_LOGIN: inteiro(5, 1),
    POLITICA_BLOQUEIO_PROGRESSIVO_MIN: listaCrescente,
    POLITICA_MAX_DISPOSITIVOS: inteiro(3, 1),
    POLITICA_TAMANHO_MINIMO_SENHA: inteiro(12, 12),
    POLITICA_VALIDADE_ACCESS_MIN: inteiro(15, 1, 60),
    POLITICA_VALIDADE_REFRESH_DIAS: inteiro(30, 1, 90),
    POLITICA_JANELA_REAUTENTICACAO_MIN: inteiro(5, 1),
    POLITICA_MAX_FALHAS_DESBLOQUEIO_LOCAL: inteiro(10, 1),
  })
  .superRefine((d, ctx) => {
    const invalida = (variavel: string): void => {
      ctx.addIssue({ code: 'custom', message: 'inválida', path: [variavel] });
    };
    if (d.JWT_ACCESS_SEGREDO === d.JWT_DESAFIO_SEGREDO) invalida('JWT_DESAFIO_SEGREDO');
    const producao = d.NODE_ENV === 'production';
    const https = d.URL_REDEFINICAO_SENHA.startsWith('https://');
    const localhost = d.URL_REDEFINICAO_SENHA.startsWith('http://localhost');
    if (!https && (producao || !localhost)) invalida('URL_REDEFINICAO_SENHA');
    if (producao && d.SMTP_HOST === undefined) invalida('SMTP_HOST');
    if (d.SMTP_HOST !== undefined) {
      if (d.SMTP_USUARIO === undefined) invalida('SMTP_USUARIO');
      if (d.SMTP_SENHA === undefined) invalida('SMTP_SENHA');
      if (d.SMTP_REMETENTE === undefined) invalida('SMTP_REMETENTE');
    }
  });

export function carregarConfiguracao(env: Record<string, string | undefined>): Configuracao {
  const entrada = Object.fromEntries(Object.entries(env).filter(([, valor]) => valor !== undefined && valor !== ''));
  const resultado = esquema.safeParse(entrada);
  if (!resultado.success) {
    const nomes = resultado.error.issues.map((i) => String(i.path[0] ?? 'DESCONHECIDA'));
    throw new ConfiguracaoInvalida([...new Set(nomes)]);
  }
  const d = resultado.data;
  const smtp =
    d.SMTP_HOST !== undefined && d.SMTP_USUARIO !== undefined && d.SMTP_SENHA !== undefined && d.SMTP_REMETENTE !== undefined
      ? {
          host: d.SMTP_HOST,
          porta: d.SMTP_PORTA,
          seguro: d.SMTP_SEGURO,
          usuario: d.SMTP_USUARIO,
          senha: d.SMTP_SENHA,
          remetente: d.SMTP_REMETENTE,
        }
      : null;

  return {
    ambiente: d.NODE_ENV,
    porta: d.PORT,
    databaseUrl: d.DATABASE_URL,
    jwtAccessSegredo: d.JWT_ACCESS_SEGREDO,
    jwtDesafioSegredo: d.JWT_DESAFIO_SEGREDO,
    totpChaveCifra: new Uint8Array(Buffer.from(d.TOTP_CHAVE_CIFRA_B64, 'base64')),
    smtp,
    urlRedefinicaoSenha: d.URL_REDEFINICAO_SENHA,
    trustProxy: d.TRUST_PROXY,
    politica: {
      inatividadeMin: d.POLITICA_INATIVIDADE_MIN,
      limiteDiasOffline: d.POLITICA_LIMITE_DIAS_OFFLINE,
      leituraPermitidaAposLimite: d.POLITICA_LEITURA_APOS_LIMITE,
      maxTentativasLogin: d.POLITICA_MAX_TENTATIVAS_LOGIN,
      bloqueioProgressivoMin: d.POLITICA_BLOQUEIO_PROGRESSIVO_MIN,
      maxDispositivosAtivos: d.POLITICA_MAX_DISPOSITIVOS,
      tamanhoMinimoSenha: d.POLITICA_TAMANHO_MINIMO_SENHA,
      validadeAccessMin: d.POLITICA_VALIDADE_ACCESS_MIN,
      validadeRefreshDias: d.POLITICA_VALIDADE_REFRESH_DIAS,
      janelaReautenticacaoMin: d.POLITICA_JANELA_REAUTENTICACAO_MIN,
      maxFalhasDesbloqueioLocal: d.POLITICA_MAX_FALHAS_DESBLOQUEIO_LOCAL,
    },
  };
}
