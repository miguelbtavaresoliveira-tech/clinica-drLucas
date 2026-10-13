import { describe, expect, it } from 'vitest';
import { ErroDoApp, mensagemAmigavel, paraErroDoApp } from './erros';

describe('paraErroDoApp', () => {
  it('mantém um ErroDoApp existente', () => {
    const original = new ErroDoApp('SENHA_FRACA', 'fraca');
    expect(paraErroDoApp(original)).toBe(original);
  });

  it('converte { codigo, mensagem } em ErroDoApp', () => {
    const erro = paraErroDoApp({ codigo: 'SEM_CONEXAO', mensagem: 'sem rede' });
    expect(erro).toBeInstanceOf(ErroDoApp);
    expect(erro.codigo).toBe('SEM_CONEXAO');
    expect(erro.message).toBe('sem rede');
  });

  it('preserva os extras quando presentes', () => {
    const erro = paraErroDoApp({
      codigo: 'AGUARDE_ANTES_DE_TENTAR',
      mensagem: 'aguarde',
      segundosRestantes: 42,
    });
    expect(erro.extras.segundosRestantes).toBe(42);
  });

  it('converte qualquer outra coisa (string) em ErroDoApp INTERNO', () => {
    const erro = paraErroDoApp('falha crua');
    expect(erro.codigo).toBe('INTERNO');
    expect(erro.message).toBe('Erro interno.');
  });

  it('converte undefined em ErroDoApp INTERNO', () => {
    const erro = paraErroDoApp(undefined);
    expect(erro.codigo).toBe('INTERNO');
  });

  it('converte objeto sem mensagem em ErroDoApp INTERNO', () => {
    const erro = paraErroDoApp({ codigo: 'X' });
    expect(erro.codigo).toBe('INTERNO');
  });
});

describe('mensagemAmigavel', () => {
  const tabela: Array<[string, { titulo: string; texto: string }, Record<string, unknown>?]> = [
    [
      'CREDENCIAIS_INVALIDAS',
      {
        titulo: 'Credenciais não encontradas',
        texto: 'E-mail ou senha incorretos. Verifique os dados e tente novamente.',
      },
    ],
    [
      'MUITAS_REQUISICOES',
      { titulo: 'Muitas tentativas', texto: 'Aguarde um minuto e tente novamente.' },
    ],
    [
      'CODIGO_MFA_INVALIDO',
      { titulo: 'Código inválido', texto: 'O código não confere ou já foi usado. Entre novamente.' },
    ],
    [
      'DESAFIO_INVALIDO',
      { titulo: 'Sessão de login expirada', texto: 'Entre novamente com e-mail e senha.' },
    ],
    [
      'SEM_CONEXAO',
      { titulo: 'Sem conexão com o servidor', texto: 'Verifique a internet e tente novamente.' },
    ],
    ['SESSAO_EXPIRADA', { titulo: 'Sessão expirada', texto: 'Entre novamente para sincronizar.' }],
    [
      'LIMITE_DE_DISPOSITIVOS_ATINGIDO',
      {
        titulo: 'Limite de computadores atingido',
        texto: 'Revogue um computador em Dispositivos, a partir de outro computador conectado.',
      },
    ],
    [
      'DISPOSITIVO_REVOGADO',
      { titulo: 'Computador desconectado', texto: 'O acesso deste computador foi revogado.' },
    ],
    [
      'SENHA_FRACA',
      {
        titulo: 'Senha fraca',
        texto: 'Use ao menos 12 caracteres, diferente do e-mail e que não seja comum.',
      },
    ],
    [
      'SENHA_MESTRE_INCORRETA',
      { titulo: 'Senha mestre incorreta', texto: 'Verifique a senha e tente novamente.' },
    ],
    [
      'EXIGE_LOGIN_COMPLETO',
      {
        titulo: 'Entre com e-mail e senha',
        texto: 'Por segurança, faça o login completo para liberar o desbloqueio.',
      },
    ],
    [
      'REAUTENTICACAO_NECESSARIA',
      { titulo: 'Confirme sua identidade', texto: 'Digite sua senha mestre para continuar.' },
    ],
    [
      'TOKEN_DE_REDEFINICAO_INVALIDO',
      {
        titulo: 'Código de redefinição inválido',
        texto: 'Peça um novo e-mail de redefinição.',
      },
    ],
    ['BIOMETRIA_INDISPONIVEL', { titulo: 'Biometria indisponível', texto: 'Use sua senha mestre.' }],
    [
      'SOMENTE_LEITURA',
      { titulo: 'Modo somente leitura', texto: 'Conecte-se à internet para voltar a editar.' },
    ],
    [
      'CODIGO_DESCONHECIDO_QUALQUER',
      {
        titulo: 'Não foi possível concluir',
        texto: 'Tente novamente. Se persistir, reinicie o aplicativo.',
      },
    ],
  ];

  it.each(tabela)('%s retorna o título e o texto exatos', (codigo, esperado) => {
    const erro = new ErroDoApp(codigo, 'mensagem original');
    expect(mensagemAmigavel(erro)).toEqual(esperado);
  });

  it('CONTA_BLOQUEADA formata tentarApos no horário de São Paulo', () => {
    const erro = new ErroDoApp('CONTA_BLOQUEADA', 'bloqueada', {
      tentarApos: '2026-10-13T12:30:00.000Z',
    });
    expect(mensagemAmigavel(erro)).toEqual({
      titulo: 'Conta temporariamente bloqueada',
      texto: 'Muitas tentativas. Tente novamente após 09:30.',
    });
  });

  it('AGUARDE_ANTES_DE_TENTAR interpola os segundos restantes', () => {
    const erro = new ErroDoApp('AGUARDE_ANTES_DE_TENTAR', 'aguarde', { segundosRestantes: 17 });
    expect(mensagemAmigavel(erro)).toEqual({
      titulo: 'Aguarde',
      texto: 'Tente novamente em 17 s.',
    });
  });
});
