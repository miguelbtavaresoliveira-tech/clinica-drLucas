import type { DispositivoId, EventoDeDominio, UsuarioId } from '../../domain/index.js';
import type { RepositorioDeAuditoria } from '../portas/repositorios.js';
import type {
  DetalheDeAuditoria,
  RegistroDeAuditoriaDoServidor,
  TipoDeAuditoria,
} from './registro-de-auditoria.js';

export interface MetadadosDeAuditoria {
  readonly ip: string | null;
  readonly dispositivoId: DispositivoId | null;
}

interface Traducao {
  readonly tipo: TipoDeAuditoria;
  readonly detalhe: DetalheDeAuditoria;
}

/** Campos de eventos de domínio lidos de forma estrutural (os eventos não compartilham uma classe base). */
type Campos = Readonly<Record<string, unknown>>;

function idDe(valor: unknown): string | null {
  if (typeof valor === 'object' && valor !== null && 'valor' in valor && typeof valor.valor === 'string') {
    return valor.valor;
  }
  return null;
}

export class Auditor {
  paraRegistros(eventos: readonly EventoDeDominio[], meta: MetadadosDeAuditoria): RegistroDeAuditoriaDoServidor[] {
    return eventos.map((evento) => {
      const campos = evento as unknown as Campos;
      const { tipo, detalhe } = this.traduzir(evento, campos);
      return {
        origem: 'servidor',
        id: crypto.randomUUID(),
        tipo,
        ocorridoEm: evento.ocorridoEm,
        usuarioId: idDe(campos['usuarioId']),
        dispositivoId: idDe(campos['dispositivoId']) ?? meta.dispositivoId?.valor ?? null,
        ip: meta.ip,
        detalhe,
      };
    });
  }

  avulso(
    tipo: TipoDeAuditoria,
    d: {
      ocorridoEm: Date;
      usuarioId: UsuarioId | null;
      dispositivoId: DispositivoId | null;
      ip: string | null;
      detalhe?: DetalheDeAuditoria;
    },
  ): RegistroDeAuditoriaDoServidor {
    return {
      origem: 'servidor',
      id: crypto.randomUUID(),
      tipo,
      ocorridoEm: d.ocorridoEm,
      usuarioId: d.usuarioId?.valor ?? null,
      dispositivoId: d.dispositivoId?.valor ?? null,
      ip: d.ip,
      detalhe: d.detalhe ?? {},
    };
  }

  async registrar(
    repo: RepositorioDeAuditoria,
    eventos: readonly EventoDeDominio[],
    meta: MetadadosDeAuditoria,
  ): Promise<void> {
    for (const registro of this.paraRegistros(eventos, meta)) {
      await repo.registrar(registro);
    }
  }

  private traduzir(evento: EventoDeDominio, c: Campos): Traducao {
    switch (evento.tipo) {
      case 'UsuarioCriado':
        return { tipo: 'usuario-criado', detalhe: {} };
      case 'UsuarioDesativado':
        return { tipo: 'usuario-desativado', detalhe: {} };
      case 'AcessoRedefinidoAdministrativamente':
        return { tipo: 'acesso-redefinido-administrativamente', detalhe: {} };
      case 'MfaConfigurado':
        return { tipo: 'mfa-configurado', detalhe: {} };
      case 'SenhaAlterada':
        return { tipo: 'senha-alterada', detalhe: {} };
      case 'LoginRealizado':
        return { tipo: 'login-ok', detalhe: {} };
      case 'LoginFalhou':
        return { tipo: 'login-falhou', detalhe: { motivo: String(c['motivo']) } };
      case 'UsuarioBloqueado':
        return { tipo: 'usuario-bloqueado', detalhe: { bloqueadoAte: (c['bloqueadoAte'] as Date).toISOString() } };
      case 'CodigoDeRecuperacaoUsado':
        return { tipo: 'codigo-de-recuperacao-usado', detalhe: { restantes: c['restantes'] as number } };
      case 'CodigosDeRecuperacaoRegenerados':
        return { tipo: 'codigos-de-recuperacao-regenerados', detalhe: {} };
      case 'DispositivoRegistrado':
        return { tipo: 'dispositivo-registrado', detalhe: { plataforma: String(c['plataforma']) } };
      case 'DispositivoRevogado':
        return { tipo: 'dispositivo-revogado', detalhe: { motivo: String(c['motivo']) } };
      case 'SessaoRevogada': {
        const motivo = String(c['motivo']);
        const tipo = motivo === 'reutilizacao-de-refresh' ? 'refresh-reutilizado' : 'sessao-revogada';
        return { tipo, detalhe: { motivo } };
      }
      default:
        throw new Error(`Evento sem mapeamento de auditoria: ${evento.tipo}`);
    }
  }
}
