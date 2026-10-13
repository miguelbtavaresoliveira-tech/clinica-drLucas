import { ErroDeDominio } from './comum/erro-de-dominio.js';

export type MotivoSenhaFraca = 'curta' | 'longa' | 'igual-ao-email' | 'comum' | 'igual-a-atual';

export class CredenciaisInvalidas extends ErroDeDominio {
  readonly codigo = 'CREDENCIAIS_INVALIDAS' as const;

  constructor() {
    super('Credenciais inválidas.');
  }
}

export class ContaBloqueada extends ErroDeDominio {
  readonly codigo = 'CONTA_BLOQUEADA' as const;

  constructor(readonly ate: Date) {
    super('Conta temporariamente bloqueada.');
  }
}

export class ContaDesativada extends ErroDeDominio {
  readonly codigo = 'CONTA_DESATIVADA' as const;

  constructor() {
    super('Conta desativada.');
  }
}

export class MfaObrigatorio extends ErroDeDominio {
  readonly codigo = 'MFA_OBRIGATORIO' as const;

  constructor() {
    super('Configure a autenticação em dois fatores.');
  }
}

export class CodigoMfaInvalido extends ErroDeDominio {
  readonly codigo = 'CODIGO_MFA_INVALIDO' as const;

  constructor() {
    super('Código de verificação inválido.');
  }
}

export class SenhaFraca extends ErroDeDominio {
  readonly codigo = 'SENHA_FRACA' as const;

  constructor(readonly motivos: readonly MotivoSenhaFraca[]) {
    super('A senha não atende à política.');
  }
}

export class EmailJaCadastrado extends ErroDeDominio {
  readonly codigo = 'EMAIL_JA_CADASTRADO' as const;

  constructor() {
    super('E-mail já cadastrado.');
  }
}

export class EmailInvalido extends ErroDeDominio {
  readonly codigo = 'EMAIL_INVALIDO' as const;

  constructor() {
    super('E-mail inválido.');
  }
}

export class UltimoProprietario extends ErroDeDominio {
  readonly codigo = 'ULTIMO_PROPRIETARIO' as const;

  constructor() {
    super('Não é possível desativar o último proprietário.');
  }
}

export class LimiteDeDispositivosAtingido extends ErroDeDominio {
  readonly codigo = 'LIMITE_DE_DISPOSITIVOS_ATINGIDO' as const;

  constructor(readonly maximo: number) {
    super('Limite de dispositivos atingido.');
  }
}

export class DispositivoRevogado extends ErroDeDominio {
  readonly codigo = 'DISPOSITIVO_REVOGADO' as const;

  constructor() {
    super('Dispositivo revogado.');
  }
}

export class DispositivoNaoEncontrado extends ErroDeDominio {
  readonly codigo = 'DISPOSITIVO_NAO_ENCONTRADO' as const;

  constructor() {
    super('Dispositivo não encontrado.');
  }
}

export class SessaoExpirada extends ErroDeDominio {
  readonly codigo = 'SESSAO_EXPIRADA' as const;

  constructor() {
    super('Sessão expirada.');
  }
}

export class RefreshReutilizado extends ErroDeDominio {
  readonly codigo = 'REFRESH_REUTILIZADO' as const;

  constructor() {
    super('Sessão encerrada por segurança.');
  }
}

export class ReautenticacaoNecessaria extends ErroDeDominio {
  readonly codigo = 'REAUTENTICACAO_NECESSARIA' as const;

  constructor() {
    super('Confirme sua identidade para continuar.');
  }
}

export class SemPermissao extends ErroDeDominio {
  readonly codigo = 'SEM_PERMISSAO' as const;

  constructor(readonly permissao: string) {
    super('Sem permissão para esta ação.');
  }
}

export class DesafioInvalido extends ErroDeDominio {
  readonly codigo = 'DESAFIO_INVALIDO' as const;

  constructor() {
    super('Sessão de login expirada. Entre novamente.');
  }
}

export class TokenDeRedefinicaoInvalido extends ErroDeDominio {
  readonly codigo = 'TOKEN_DE_REDEFINICAO_INVALIDO' as const;

  constructor() {
    super('Link de redefinição inválido ou expirado.');
  }
}

export class MfaJaConfigurado extends ErroDeDominio {
  readonly codigo = 'MFA_JA_CONFIGURADO' as const;

  constructor() {
    super('A autenticação em dois fatores já está configurada.');
  }
}

export class ProprietarioJaExiste extends ErroDeDominio {
  readonly codigo = 'PROPRIETARIO_JA_EXISTE' as const;

  constructor() {
    super('Já existe um proprietário ativo.');
  }
}

export class UsuarioNaoEncontrado extends ErroDeDominio {
  readonly codigo = 'USUARIO_NAO_ENCONTRADO' as const;

  constructor() {
    super('Usuário não encontrado.');
  }
}

export class AuditoriaInvalida extends ErroDeDominio {
  readonly codigo = 'AUDITORIA_INVALIDA' as const;

  constructor(readonly motivo: string) {
    super('Lote de auditoria inválido.');
  }
}

export class IdentificadorInvalido extends ErroDeDominio {
  readonly codigo = 'IDENTIFICADOR_INVALIDO' as const;

  constructor() {
    super('Identificador inválido.');
  }
}

export class DadoInvalido extends ErroDeDominio {
  readonly codigo = 'DADO_INVALIDO' as const;

  constructor(readonly campo: string) {
    super(`Dado inválido: ${campo}.`);
  }
}
