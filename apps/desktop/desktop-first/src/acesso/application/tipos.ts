// Tipos compartilhados entre a camada de infraestrutura (Tauri) e a aplicação.
// Devem ficar idênticos ao contrato de `06-DESKTOP-RUST.md` e ao formato HTTP
// de `05-BACKEND-INTERFACE.md`. Qualquer mudança nesses arquivos exige revisar este.

export type Situacao =
  | 'sem_configuracao'
  | 'bloqueado'
  | 'normal'
  | 'somente_leitura'
  | 'offline_expirado'
  | 'revogado';

export interface UsuarioResumo {
  id: string;
  nome: string;
  email: string;
}

export interface EstadoDoAcesso {
  situacao: Situacao;
  exigeLoginCompleto: boolean;
  biometriaDisponivel: boolean;
  biometriaHabilitada: boolean;
  segundosAteNovaTentativa: number;
  sessaoOnline: boolean;
  usuario: UsuarioResumo | null;
  eventosPendentes: number;
}

export interface ResumoDoLogin {
  usuario: UsuarioResumo;
  usouCodigoDeRecuperacao: boolean;
  codigosRestantes: number;
  proximoPasso: 'configurar_desbloqueio' | 'desbloquear' | 'pronto';
}

export interface RespostaIniciarLogin {
  desafio: string;
  mfa: 'configurar' | 'verificar';
  expiraEm: string;
}

export interface SegredoMfa {
  segredo: string;
  urlOtpauth: string;
}

export type CodigoInformado =
  | { tipo: 'totp'; valor: string }
  | { tipo: 'recuperacao'; valor: string };

export interface ItemDeDispositivo {
  id: string;
  apelido: string;
  plataforma: 'macos' | 'windows';
  registradoEm: string;
  ultimoCheckIn: string;
  situacao: 'ativo' | 'revogado';
  revogadoEm: string | null;
  atual: boolean;
}
