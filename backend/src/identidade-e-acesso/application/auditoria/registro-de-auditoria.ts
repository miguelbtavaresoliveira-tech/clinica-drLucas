export const TIPOS_DE_AUDITORIA = [
  'usuario-criado',
  'usuario-desativado',
  'acesso-redefinido-administrativamente',
  'login-ok',
  'login-falhou',
  'usuario-bloqueado',
  'mfa-configurado',
  'codigo-de-recuperacao-usado',
  'codigos-de-recuperacao-regenerados',
  'senha-alterada',
  'redefinicao-de-senha-solicitada',
  'dispositivo-registrado',
  'dispositivo-revogado',
  'sessao-revogada',
  'refresh-reutilizado',
  'reautenticacao-sensivel',
  'desbloqueio-local-configurado',
  'desbloqueio-local-ok',
  'desbloqueio-local-falhou',
  'senha-mestre-alterada',
  'biometria-ativada',
  'biometria-desativada',
  'app-bloqueado',
  'desbloqueio-local-redefinido',
  'modo-somente-leitura',
] as const;

export type TipoDeAuditoria = (typeof TIPOS_DE_AUDITORIA)[number];

export const TIPOS_DE_AUDITORIA_DO_APP: readonly TipoDeAuditoria[] = [
  'desbloqueio-local-configurado',
  'desbloqueio-local-ok',
  'desbloqueio-local-falhou',
  'senha-mestre-alterada',
  'biometria-ativada',
  'biometria-desativada',
  'app-bloqueado',
  'desbloqueio-local-redefinido',
  'modo-somente-leitura',
  'reautenticacao-sensivel',
];

export type DetalheDeAuditoria = Readonly<Record<string, string | number | boolean | null>>;

export interface RegistroDeAuditoriaDoServidor {
  readonly origem: 'servidor';
  readonly id: string;
  readonly tipo: TipoDeAuditoria;
  readonly ocorridoEm: Date;
  readonly usuarioId: string | null;
  readonly dispositivoId: string | null;
  readonly ip: string | null;
  readonly detalhe: DetalheDeAuditoria;
}

export interface RegistroDeAuditoriaDoApp {
  readonly origem: 'app';
  readonly id: string;
  readonly tipo: TipoDeAuditoria;
  readonly ocorridoEm: Date;
  readonly usuarioId: string;
  readonly dispositivoId: string;
  readonly ip: string | null;
  readonly detalhe: DetalheDeAuditoria;
  readonly hashAnterior: string | null;
  readonly hash: string;
  readonly assinatura: string;
}

export type RegistroDeAuditoria = RegistroDeAuditoriaDoServidor | RegistroDeAuditoriaDoApp;
