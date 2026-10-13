import {
  AuditoriaInvalida,
  DispositivoRevogado,
  REGEX_UUID,
  type ContextoDeAcesso,
} from '../../domain/index.js';
import {
  TIPOS_DE_AUDITORIA,
  TIPOS_DE_AUDITORIA_DO_APP,
  type RegistroDeAuditoriaDoApp,
  type TipoDeAuditoria,
} from '../auditoria/registro-de-auditoria.js';
import { ehDetalheValido, serializarCanonico } from '../auditoria/serializacao-canonica.js';
import { MAX_REGISTROS_POR_LOTE_DE_AUDITORIA, TOLERANCIA_DE_RELOGIO_DO_APP_MIN } from '../comum/constantes.js';
import type { CalculadoraDeHash, Relogio, UnidadeDeTrabalho, VerificadorDeAssinatura } from '../portas/index.js';

export interface DependenciasReceberAuditoria {
  uow: UnidadeDeTrabalho;
  relogio: Relogio;
  hash: CalculadoraDeHash;
  assinatura: VerificadorDeAssinatura;
}

export interface RegistroRecebido {
  id: string;
  ocorridoEm: string;
  tipo: string;
  usuarioId: string;
  dispositivoId: string;
  detalhe: unknown;
  hashAnterior: string | null;
  hash: string;
  assinatura: string;
}

export interface EntradaReceberAuditoria {
  ctx: ContextoDeAcesso;
  registros: RegistroRecebido[];
  ip: string | null;
}

export interface SaidaReceberAuditoria {
  aceitos: number;
  ignorados: number;
}

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REGEX_HASH = /^[0-9a-f]{64}$/;

function ehTipoDoApp(tipo: string): tipo is TipoDeAuditoria {
  return (TIPOS_DE_AUDITORIA as readonly string[]).includes(tipo) && (TIPOS_DE_AUDITORIA_DO_APP as readonly string[]).includes(tipo);
}

export class ReceberAuditoriaDoApp {
  constructor(private readonly d: DependenciasReceberAuditoria) {}

  async executar(e: EntradaReceberAuditoria): Promise<SaidaReceberAuditoria> {
    if (e.registros.length < 1 || e.registros.length > MAX_REGISTROS_POR_LOTE_DE_AUDITORIA) {
      throw new AuditoriaInvalida('tamanho-do-lote');
    }
    const agora = this.d.relogio.agora();

    return this.d.uow.executar(async (r) => {
      const dispositivo = await r.dispositivos.porId(e.ctx.dispositivoId);
      if (dispositivo === null || !dispositivo.estaAtivo()) throw new DispositivoRevogado();

      const existentes = await r.auditoria.idsExistentes(e.registros.map((x) => x.id));
      const novos: RegistroRecebido[] = [];
      for (const registro of e.registros) {
        if (existentes.has(registro.id)) {
          if (novos.length > 0) throw new AuditoriaInvalida('ordem');
        } else {
          novos.push(registro);
        }
      }

      // Valida tudo antes de gravar qualquer registro: o lote é aceito inteiro ou rejeitado inteiro.
      let anterior = await r.auditoria.ultimoHashDoApp(dispositivo.id);
      const aGravar: RegistroDeAuditoriaDoApp[] = [];
      for (const n of novos) {
        const gravado = this.validar(n, e, dispositivo.chavePublicaAuditoria, anterior, agora);
        aGravar.push(gravado);
        anterior = gravado.hash;
      }
      for (const registro of aGravar) await r.auditoria.registrar(registro);
      return { aceitos: aGravar.length, ignorados: existentes.size };
    });
  }

  private validar(
    n: RegistroRecebido,
    e: EntradaReceberAuditoria,
    chavePublica: string,
    anterior: string | null,
    agora: Date,
  ): RegistroDeAuditoriaDoApp {
    if (typeof n.id !== 'string' || !REGEX_UUID.test(n.id)) throw new AuditoriaInvalida('id');
    if (typeof n.tipo !== 'string' || !ehTipoDoApp(n.tipo)) throw new AuditoriaInvalida('tipo');
    if (n.usuarioId !== e.ctx.usuarioId.valor) throw new AuditoriaInvalida('usuario');
    if (n.dispositivoId !== e.ctx.dispositivoId.valor) throw new AuditoriaInvalida('dispositivo');

    if (typeof n.ocorridoEm !== 'string' || !REGEX_DATA.test(n.ocorridoEm)) throw new AuditoriaInvalida('data');
    const ocorridoEm = new Date(n.ocorridoEm);
    if (Number.isNaN(ocorridoEm.getTime()) || ocorridoEm.toISOString() !== n.ocorridoEm) throw new AuditoriaInvalida('data');
    if (ocorridoEm.getTime() > agora.getTime() + TOLERANCIA_DE_RELOGIO_DO_APP_MIN * 60_000) throw new AuditoriaInvalida('data');

    if (!ehDetalheValido(n.detalhe)) throw new AuditoriaInvalida('detalhe');
    if (n.hashAnterior !== anterior) throw new AuditoriaInvalida('encadeamento');

    if (typeof n.hash !== 'string' || !REGEX_HASH.test(n.hash)) throw new AuditoriaInvalida('hash');
    const esperado = this.d.hash.sha256Hex(
      serializarCanonico({
        id: n.id,
        ocorridoEm,
        tipo: n.tipo,
        usuarioId: n.usuarioId,
        dispositivoId: n.dispositivoId,
        detalhe: n.detalhe,
        hashAnterior: n.hashAnterior,
      }),
    );
    if (esperado !== n.hash) throw new AuditoriaInvalida('hash');

    if (typeof n.assinatura !== 'string' || !this.d.assinatura.verificarEd25519(n.hash, n.assinatura, chavePublica)) {
      throw new AuditoriaInvalida('assinatura');
    }

    return {
      origem: 'app',
      id: n.id,
      tipo: n.tipo,
      ocorridoEm,
      usuarioId: n.usuarioId,
      dispositivoId: n.dispositivoId,
      ip: e.ip,
      detalhe: n.detalhe,
      hashAnterior: n.hashAnterior,
      hash: n.hash,
      assinatura: n.assinatura,
    };
  }
}
