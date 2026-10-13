import type { EventoDeDominio } from './comum/evento-de-dominio.js';
import type { DispositivoId } from './dispositivo/dispositivo-id.js';
import type { Plataforma } from './dispositivo/plataforma.js';
import type { SessaoDeLoginId } from './sessao-de-login/sessao-de-login-id.js';
import type { UsuarioId } from './usuario/usuario-id.js';

export type MotivoRevogacaoDeSessao =
  | 'logout'
  | 'reutilizacao-de-refresh'
  | 'nova-sessao-no-dispositivo'
  | 'senha-alterada'
  | 'dispositivo-revogado'
  | 'usuario-desativado'
  | 'acesso-redefinido';

export class UsuarioCriado implements EventoDeDominio {
  readonly tipo = 'UsuarioCriado' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly ocorridoEm: Date,
  ) {}
}

export class MfaConfigurado implements EventoDeDominio {
  readonly tipo = 'MfaConfigurado' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly ocorridoEm: Date,
  ) {}
}

export class SenhaAlterada implements EventoDeDominio {
  readonly tipo = 'SenhaAlterada' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly ocorridoEm: Date,
  ) {}
}

export class LoginRealizado implements EventoDeDominio {
  readonly tipo = 'LoginRealizado' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly dispositivoId: DispositivoId,
    readonly ocorridoEm: Date,
  ) {}
}

export class LoginFalhou implements EventoDeDominio {
  readonly tipo = 'LoginFalhou' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly motivo: 'senha' | 'mfa',
    readonly ocorridoEm: Date,
  ) {}
}

export class UsuarioBloqueado implements EventoDeDominio {
  readonly tipo = 'UsuarioBloqueado' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly bloqueadoAte: Date,
    readonly ocorridoEm: Date,
  ) {}
}

export class CodigoDeRecuperacaoUsado implements EventoDeDominio {
  readonly tipo = 'CodigoDeRecuperacaoUsado' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly restantes: number,
    readonly ocorridoEm: Date,
  ) {}
}

export class CodigosDeRecuperacaoRegenerados implements EventoDeDominio {
  readonly tipo = 'CodigosDeRecuperacaoRegenerados' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly ocorridoEm: Date,
  ) {}
}

export class UsuarioDesativado implements EventoDeDominio {
  readonly tipo = 'UsuarioDesativado' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly ocorridoEm: Date,
  ) {}
}

export class AcessoRedefinidoAdministrativamente implements EventoDeDominio {
  readonly tipo = 'AcessoRedefinidoAdministrativamente' as const;

  constructor(
    readonly usuarioId: UsuarioId,
    readonly ocorridoEm: Date,
  ) {}
}

export class DispositivoRegistrado implements EventoDeDominio {
  readonly tipo = 'DispositivoRegistrado' as const;

  constructor(
    readonly dispositivoId: DispositivoId,
    readonly usuarioId: UsuarioId,
    readonly plataforma: Plataforma,
    readonly ocorridoEm: Date,
  ) {}
}

export class DispositivoFoiRevogado implements EventoDeDominio {
  readonly tipo = 'DispositivoRevogado' as const;

  constructor(
    readonly dispositivoId: DispositivoId,
    readonly usuarioId: UsuarioId,
    readonly motivo: string,
    readonly ocorridoEm: Date,
  ) {}
}

export class SessaoRevogada implements EventoDeDominio {
  readonly tipo = 'SessaoRevogada' as const;

  constructor(
    readonly sessaoId: SessaoDeLoginId,
    readonly usuarioId: UsuarioId,
    readonly dispositivoId: DispositivoId,
    readonly motivo: MotivoRevogacaoDeSessao,
    readonly ocorridoEm: Date,
  ) {}
}

export type EventoDeIdentidade =
  | UsuarioCriado
  | MfaConfigurado
  | SenhaAlterada
  | LoginRealizado
  | LoginFalhou
  | UsuarioBloqueado
  | CodigoDeRecuperacaoUsado
  | CodigosDeRecuperacaoRegenerados
  | UsuarioDesativado
  | AcessoRedefinidoAdministrativamente
  | DispositivoRegistrado
  | DispositivoFoiRevogado
  | SessaoRevogada;
