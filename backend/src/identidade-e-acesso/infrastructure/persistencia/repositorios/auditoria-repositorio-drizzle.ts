import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { REGEX_UUID, type DispositivoId } from '../../../domain/index.js';
import type { RegistroDeAuditoria } from '../../../application/auditoria/registro-de-auditoria.js';
import { serializarCanonico } from '../../../application/auditoria/serializacao-canonica.js';
import type { CalculadoraDeHash, RepositorioDeAuditoria } from '../../../application/portas/index.js';
import type { ExecutorDrizzle } from '../executor.js';
import { auditoriaDeAcesso } from '../schema.js';

/** O advisory lock só vale dentro de transação: use este repositório via `DrizzleUnidadeDeTrabalho`. */
export class AuditoriaRepositorioDrizzle implements RepositorioDeAuditoria {
  constructor(
    private readonly exec: ExecutorDrizzle,
    private readonly hash: CalculadoraDeHash,
  ) {}

  async registrar(reg: RegistroDeAuditoria): Promise<void> {
    if (reg.origem === 'app') {
      await this.exec.insert(auditoriaDeAcesso).values({
        idOrigem: reg.id,
        ocorridoEm: reg.ocorridoEm,
        tipo: reg.tipo,
        usuarioId: reg.usuarioId,
        dispositivoId: reg.dispositivoId,
        origem: 'app',
        ip: reg.ip,
        detalhe: reg.detalhe,
        hashAnterior: reg.hashAnterior,
        hash: reg.hash,
        assinatura: reg.assinatura,
      });
      return;
    }

    // Serializa a cadeia do servidor: cada registro aponta para o hash do anterior.
    await this.exec.execute(sql`SELECT pg_advisory_xact_lock(hashtext('identidade.auditoria.servidor'))`);
    const [ultimo] = await this.exec
      .select({ hash: auditoriaDeAcesso.hash })
      .from(auditoriaDeAcesso)
      .where(eq(auditoriaDeAcesso.origem, 'servidor'))
      .orderBy(desc(auditoriaDeAcesso.id))
      .limit(1);
    const hashAnterior = ultimo?.hash ?? null;
    const hash = this.hash.sha256Hex(
      serializarCanonico({
        id: reg.id,
        ocorridoEm: reg.ocorridoEm,
        tipo: reg.tipo,
        usuarioId: reg.usuarioId,
        dispositivoId: reg.dispositivoId,
        detalhe: reg.detalhe,
        hashAnterior,
      }),
    );
    await this.exec.insert(auditoriaDeAcesso).values({
      idOrigem: reg.id,
      ocorridoEm: reg.ocorridoEm,
      tipo: reg.tipo,
      usuarioId: reg.usuarioId,
      dispositivoId: reg.dispositivoId,
      origem: 'servidor',
      ip: reg.ip,
      detalhe: reg.detalhe,
      hashAnterior,
      hash,
      assinatura: null,
    });
  }

  async ultimoHashDoApp(dispositivoId: DispositivoId): Promise<string | null> {
    const [linha] = await this.exec
      .select({ hash: auditoriaDeAcesso.hash })
      .from(auditoriaDeAcesso)
      .where(and(eq(auditoriaDeAcesso.origem, 'app'), eq(auditoriaDeAcesso.dispositivoId, dispositivoId.valor)))
      .orderBy(desc(auditoriaDeAcesso.id))
      .limit(1);
    return linha?.hash ?? null;
  }

  /** Ids que não são UUID não podem existir: são filtrados antes da consulta (evita erro de cast no banco). */
  async idsExistentes(ids: readonly string[]): Promise<Set<string>> {
    const validos = ids.filter((id) => REGEX_UUID.test(id));
    if (validos.length === 0) return new Set();
    const linhas = await this.exec
      .select({ idOrigem: auditoriaDeAcesso.idOrigem })
      .from(auditoriaDeAcesso)
      .where(inArray(auditoriaDeAcesso.idOrigem, validos));
    return new Set(linhas.map((l) => l.idOrigem));
  }
}
