// Erro único do app (vindo do Rust ou da API) e tradução para mensagens amigáveis.

export interface ExtrasDoErro {
  segundosRestantes?: number;
  status?: number;
  tentarApos?: string;
}

export class ErroDoApp extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly extras: ExtrasDoErro = {},
  ) {
    super(mensagem);
    this.name = 'ErroDoApp';
  }
}

interface FormaDeErro {
  codigo: string;
  mensagem: string;
  segundosRestantes?: number;
  status?: number;
  tentarApos?: string;
}

function ehFormaDeErro(valor: unknown): valor is FormaDeErro {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const registro = valor as Record<string, unknown>;
  return typeof registro.codigo === 'string' && typeof registro.mensagem === 'string';
}

export function paraErroDoApp(e: unknown): ErroDoApp {
  if (e instanceof ErroDoApp) {
    return e;
  }
  if (ehFormaDeErro(e)) {
    return new ErroDoApp(e.codigo, e.mensagem, {
      segundosRestantes: e.segundosRestantes,
      status: e.status,
      tentarApos: e.tentarApos,
    });
  }
  return new ErroDoApp('INTERNO', 'Erro interno.');
}

function formatarHora(iso: string | undefined): string {
  if (!iso) {
    return '--:--';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function mensagemAmigavel(e: ErroDoApp): { titulo: string; texto: string } {
  switch (e.codigo) {
    case 'CREDENCIAIS_INVALIDAS':
      return {
        titulo: 'Credenciais não encontradas',
        texto: 'E-mail ou senha incorretos. Verifique os dados e tente novamente.',
      };
    case 'CONTA_BLOQUEADA':
      return {
        titulo: 'Conta temporariamente bloqueada',
        texto: `Muitas tentativas. Tente novamente após ${formatarHora(e.extras.tentarApos)}.`,
      };
    case 'MUITAS_REQUISICOES':
      return { titulo: 'Muitas tentativas', texto: 'Aguarde um minuto e tente novamente.' };
    case 'CODIGO_MFA_INVALIDO':
      return {
        titulo: 'Código inválido',
        texto: 'O código não confere ou já foi usado. Entre novamente.',
      };
    case 'DESAFIO_INVALIDO':
      return { titulo: 'Sessão de login expirada', texto: 'Entre novamente com e-mail e senha.' };
    case 'SEM_CONEXAO':
      return { titulo: 'Sem conexão com o servidor', texto: 'Verifique a internet e tente novamente.' };
    case 'SESSAO_EXPIRADA':
      return { titulo: 'Sessão expirada', texto: 'Entre novamente para sincronizar.' };
    case 'LIMITE_DE_DISPOSITIVOS_ATINGIDO':
      return {
        titulo: 'Limite de computadores atingido',
        texto: 'Revogue um computador em Dispositivos, a partir de outro computador conectado.',
      };
    case 'DISPOSITIVO_REVOGADO':
      return { titulo: 'Computador desconectado', texto: 'O acesso deste computador foi revogado.' };
    case 'SENHA_FRACA':
      return {
        titulo: 'Senha fraca',
        texto: 'Use ao menos 12 caracteres, diferente do e-mail e que não seja comum.',
      };
    case 'SENHA_MESTRE_INCORRETA':
      return { titulo: 'Senha mestre incorreta', texto: 'Verifique a senha e tente novamente.' };
    case 'AGUARDE_ANTES_DE_TENTAR':
      return {
        titulo: 'Aguarde',
        texto: `Tente novamente em ${e.extras.segundosRestantes ?? 0} s.`,
      };
    case 'EXIGE_LOGIN_COMPLETO':
      return {
        titulo: 'Entre com e-mail e senha',
        texto: 'Por segurança, faça o login completo para liberar o desbloqueio.',
      };
    case 'REAUTENTICACAO_NECESSARIA':
      return { titulo: 'Confirme sua identidade', texto: 'Digite sua senha mestre para continuar.' };
    case 'TOKEN_DE_REDEFINICAO_INVALIDO':
      return {
        titulo: 'Código de redefinição inválido',
        texto: 'Peça um novo e-mail de redefinição.',
      };
    case 'BIOMETRIA_INDISPONIVEL':
      return { titulo: 'Biometria indisponível', texto: 'Use sua senha mestre.' };
    case 'SOMENTE_LEITURA':
      return {
        titulo: 'Modo somente leitura',
        texto: 'Conecte-se à internet para voltar a editar.',
      };
    default:
      return {
        titulo: 'Não foi possível concluir',
        texto: 'Tente novamente. Se persistir, reinicie o aplicativo.',
      };
  }
}
