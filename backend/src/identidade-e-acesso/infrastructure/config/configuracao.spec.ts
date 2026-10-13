import { describe, expect, it } from 'vitest';
import { carregarConfiguracao, ConfiguracaoInvalida } from './configuracao.js';

function envValido(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgres://clinica:senha@localhost:5432/clinica',
    JWT_ACCESS_SEGREDO: 'segredo-de-teste-com-32-caracteres!!',
    JWT_DESAFIO_SEGREDO: 'outro-segredo-de-teste-com-32-caracteres!!',
    TOTP_CHAVE_CIFRA_B64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORTA: '587',
    SMTP_SEGURO: 'false',
    SMTP_USUARIO: 'usuario',
    SMTP_SENHA: 'senha',
    SMTP_REMETENTE: 'remetente@example.com',
    URL_REDEFINICAO_SENHA: 'https://example.com/redefinir',
    TRUST_PROXY: '0',
  };
}

function variaveisInvalidas(env: Record<string, string | undefined>): readonly string[] {
  try {
    carregarConfiguracao(env);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfiguracaoInvalida);
    return (e as ConfiguracaoInvalida).variaveis;
  }
  throw new Error('esperava ConfiguracaoInvalida');
}

describe('carregarConfiguracao', () => {
  it('env válido retorna a política nos padrões e chave TOTP de 32 bytes', () => {
    const c = carregarConfiguracao(envValido());
    expect(c.politica).toEqual({
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
    expect(c.totpChaveCifra.length).toBe(32);
    expect(c.smtp?.host).toBe('smtp.example.com');
    expect(c.trustProxy).toBe(false);
    expect(c.ambiente).toBe('test');
  });

  it('sem DATABASE_URL lança com a variável nomeada', () => {
    const { DATABASE_URL: _removida, ...env } = envValido();
    expect(variaveisInvalidas(env)).toContain('DATABASE_URL');
  });

  it('JWT_ACCESS_SEGREDO com 31 caracteres lança', () => {
    expect(variaveisInvalidas({ ...envValido(), JWT_ACCESS_SEGREDO: 'a'.repeat(31) })).toContain('JWT_ACCESS_SEGREDO');
    expect(() => carregarConfiguracao({ ...envValido(), JWT_ACCESS_SEGREDO: 'a'.repeat(32) })).not.toThrow();
  });

  it('segredos JWT iguais lançam apontando JWT_DESAFIO_SEGREDO', () => {
    const env = { ...envValido(), JWT_DESAFIO_SEGREDO: envValido().JWT_ACCESS_SEGREDO as string };
    expect(variaveisInvalidas(env)).toContain('JWT_DESAFIO_SEGREDO');
  });

  it('TOTP_CHAVE_CIFRA_B64 com 16 bytes lança', () => {
    expect(variaveisInvalidas({ ...envValido(), TOTP_CHAVE_CIFRA_B64: 'AAAAAAAAAAAAAAAAAAAAAA==' })).toContain(
      'TOTP_CHAVE_CIFRA_B64',
    );
  });

  it.each(['1,a', '5,1', '1,1', '0,5'])('POLITICA_BLOQUEIO_PROGRESSIVO_MIN=%s lança', (valor) => {
    expect(variaveisInvalidas({ ...envValido(), POLITICA_BLOQUEIO_PROGRESSIVO_MIN: valor })).toContain(
      'POLITICA_BLOQUEIO_PROGRESSIVO_MIN',
    );
  });

  it('POLITICA_TAMANHO_MINIMO_SENHA=8 lança', () => {
    expect(variaveisInvalidas({ ...envValido(), POLITICA_TAMANHO_MINIMO_SENHA: '8' })).toContain(
      'POLITICA_TAMANHO_MINIMO_SENHA',
    );
  });

  it('production sem SMTP_HOST lança', () => {
    const { SMTP_HOST: _removido, ...env } = envValido();
    expect(variaveisInvalidas({ ...env, NODE_ENV: 'production' })).toContain('SMTP_HOST');
  });

  it('SMTP_HOST definido exige usuário, senha e remetente', () => {
    const { SMTP_USUARIO: _u, SMTP_SENHA: _s, SMTP_REMETENTE: _r, ...env } = envValido();
    expect(variaveisInvalidas(env)).toEqual(['SMTP_USUARIO', 'SMTP_SENHA', 'SMTP_REMETENTE']);
  });

  it('fora de production, sem SMTP_HOST, smtp é null', () => {
    const { SMTP_HOST: _h, SMTP_USUARIO: _u, SMTP_SENHA: _s, SMTP_REMETENTE: _r, ...env } = envValido();
    expect(carregarConfiguracao(env).smtp).toBeNull();
  });

  it('production com URL_REDEFINICAO_SENHA http://localhost lança; em development é aceita', () => {
    const env = { ...envValido(), URL_REDEFINICAO_SENHA: 'http://localhost/x' };
    expect(variaveisInvalidas({ ...env, NODE_ENV: 'production' })).toContain('URL_REDEFINICAO_SENHA');
    expect(() => carregarConfiguracao({ ...env, NODE_ENV: 'development' })).not.toThrow();
    expect(variaveisInvalidas({ ...env, URL_REDEFINICAO_SENHA: 'http://exemplo.com/x' })).toContain(
      'URL_REDEFINICAO_SENHA',
    );
  });

  it('nunca inclui valores na mensagem do erro', () => {
    const segredo = 'curto-mas-secreto';
    let mensagem = '';
    try {
      carregarConfiguracao({ ...envValido(), JWT_ACCESS_SEGREDO: segredo });
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).toBe('Configuração inválida: JWT_ACCESS_SEGREDO');
    expect(mensagem).not.toContain(segredo);
  });
});
