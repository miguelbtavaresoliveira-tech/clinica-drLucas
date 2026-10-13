// Regras puras de navegação do contexto de acesso. A autorização real fica no Rust e no
// servidor; estas regras só evitam telas sem sentido para a situação atual do app.
import type { EstadoDoAcesso } from './tipos';

export type NomeDaRota =
  | 'inicio'
  | 'login'
  | 'mfa-configurar'
  | 'mfa-verificar'
  | 'redefinir-senha'
  | 'definir-senha-mestre'
  | 'desbloqueio'
  | 'dispositivos'
  | 'seguranca'
  | 'conectar'
  | 'dispositivo-revogado';

export interface ContextoDeNavegacao {
  estado: EstadoDoAcesso;
  mfaPendente: 'configurar' | 'verificar' | null;
}

export function rotaPadrao(e: EstadoDoAcesso): NomeDaRota {
  switch (e.situacao) {
    case 'revogado':
      return 'dispositivo-revogado';
    case 'sem_configuracao':
      return 'login';
    case 'bloqueado':
      return e.exigeLoginCompleto ? 'login' : 'desbloqueio';
    case 'offline_expirado':
      return 'conectar';
    case 'normal':
    case 'somente_leitura':
      return 'inicio';
  }
}

const ROTAS_DO_APP_LIBERADO: readonly NomeDaRota[] = ['inicio', 'dispositivos', 'seguranca'];

/** `null` = pode entrar; caso contrário, a rota para onde redirecionar. */
export function destinoPara(rota: NomeDaRota, c: ContextoDeNavegacao): NomeDaRota | null {
  const { estado, mfaPendente } = c;

  if (estado.situacao === 'revogado') return rota === 'dispositivo-revogado' ? null : 'dispositivo-revogado';
  if (rota === 'dispositivo-revogado') return rotaPadrao(estado);

  if (rota === 'login' || rota === 'redefinir-senha') return null;

  if (rota === 'mfa-configurar') return mfaPendente === 'configurar' ? null : 'login';
  if (rota === 'mfa-verificar') return mfaPendente !== null ? null : 'login';

  if (rota === 'definir-senha-mestre') {
    return estado.situacao === 'sem_configuracao' && estado.sessaoOnline ? null : rotaPadrao(estado);
  }
  if (rota === 'desbloqueio') return estado.situacao === 'bloqueado' ? null : rotaPadrao(estado);
  if (rota === 'conectar') return estado.situacao === 'offline_expirado' ? null : rotaPadrao(estado);

  if (ROTAS_DO_APP_LIBERADO.includes(rota)) {
    return estado.situacao === 'normal' || estado.situacao === 'somente_leitura' ? null : rotaPadrao(estado);
  }
  return null;
}
