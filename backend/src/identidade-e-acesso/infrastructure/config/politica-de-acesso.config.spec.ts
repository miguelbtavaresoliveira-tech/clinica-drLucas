import { describe, expect, it } from 'vitest';
import { DadoInvalido } from '../../domain/index.js';
import { SENHAS_COMUNS } from '../seguranca/senhas-comuns.js';
import { carregarConfiguracao } from './configuracao.js';
import { politicaDaConfiguracao } from './politica-de-acesso.config.js';

const envBase: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://clinica:senha@localhost:5432/clinica',
  JWT_ACCESS_SEGREDO: 'segredo-de-teste-com-32-caracteres!!',
  JWT_DESAFIO_SEGREDO: 'outro-segredo-de-teste-com-32-caracteres!!',
  TOTP_CHAVE_CIFRA_B64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USUARIO: 'u',
  SMTP_SENHA: 's',
  SMTP_REMETENTE: 'r@example.com',
  URL_REDEFINICAO_SENHA: 'https://example.com/redefinir',
};

describe('politicaDaConfiguracao', () => {
  it('a configuração padrão devolve os valores da SPEC §2, congelados', () => {
    const politica = politicaDaConfiguracao(carregarConfiguracao(envBase));
    expect(politica).toEqual({
      inatividadeMin: 10,
      limiteDiasOffline: 5,
      leituraPermitidaAposLimite: true,
      maxTentativasLogin: 5,
      bloqueioProgressivoMin: [1, 5, 15, 60],
      maxDispositivosAtivos: 3,
      tamanhoMinimoSenha: 12,
      validadeAccessMin: 15,
      validadeRefreshDias: 30,
      janelaReautenticacaoMin: 5,
      maxFalhasDesbloqueioLocal: 10,
    });
    expect(Object.isFrozen(politica)).toBe(true);
    expect(Object.isFrozen(politica.bloqueioProgressivoMin)).toBe(true);
  });

  it('respeita valores configurados', () => {
    const politica = politicaDaConfiguracao(
      carregarConfiguracao({ ...envBase, POLITICA_MAX_DISPOSITIVOS: '5', POLITICA_BLOQUEIO_PROGRESSIVO_MIN: '2,4' }),
    );
    expect(politica.maxDispositivosAtivos).toBe(5);
    expect(politica.bloqueioProgressivoMin).toEqual([2, 4]);
  });

  it('uma política inválida vinda de fora lança DadoInvalido', () => {
    const config = carregarConfiguracao(envBase);
    expect(() =>
      politicaDaConfiguracao({ ...config, politica: { ...config.politica, bloqueioProgressivoMin: [5, 1] } }),
    ).toThrow(DadoInvalido);
  });
});

describe('SENHAS_COMUNS', () => {
  it('tem 42 entradas, todas em minúsculas e sem duplicatas', () => {
    expect(SENHAS_COMUNS).toHaveLength(42);
    expect(SENHAS_COMUNS.every((s) => s === s.toLowerCase())).toBe(true);
    expect(new Set(SENHAS_COMUNS).size).toBe(42);
  });
});
