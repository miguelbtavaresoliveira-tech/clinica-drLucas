import { and, asc, count, eq, notInArray, sql } from 'drizzle-orm';
import type { Email, Usuario, UsuarioId } from '../../../domain/index.js';
import { ConflitoDeConcorrencia, type UsuarioRepositorio } from '../../../application/portas/index.js';
import { ehViolacaoDeUnicidade } from '../erros-de-banco.js';
import type { ExecutorDrizzle } from '../executor.js';
import { dadosDoUsuario, dadosDosCodigos, paraUsuario, type LinhaDeUsuario } from '../mapeadores.js';
import { codigosDeRecuperacao, usuarios } from '../schema.js';

export class UsuarioRepositorioDrizzle implements UsuarioRepositorio {
  constructor(private readonly exec: ExecutorDrizzle) {}

  async porId(id: UsuarioId): Promise<Usuario | null> {
    const [linha] = await this.exec.select().from(usuarios).where(eq(usuarios.id, id.valor)).limit(1);
    return linha === undefined ? null : this.montar(linha);
  }

  async porEmail(email: Email): Promise<Usuario | null> {
    const [linha] = await this.exec.select().from(usuarios).where(eq(usuarios.email, email.valor)).limit(1);
    return linha === undefined ? null : this.montar(linha);
  }

  async contarProprietariosAtivos(): Promise<number> {
    const [linha] = await this.exec
      .select({ total: count() })
      .from(usuarios)
      .where(sql`${usuarios.situacao} = 'ativo' AND 'proprietario' = ANY(${usuarios.papeis})`);
    return linha?.total ?? 0;
  }

  async salvar(u: Usuario): Promise<void> {
    const dados = dadosDoUsuario(u);
    let novaVersao: number;
    try {
      if (u.versao === 0) {
        await this.exec.insert(usuarios).values({ ...dados, versao: 1 });
        novaVersao = 1;
      } else {
        const [atualizado] = await this.exec
          .update(usuarios)
          .set({ ...dados, versao: sql`${usuarios.versao} + 1` })
          .where(and(eq(usuarios.id, u.id.valor), eq(usuarios.versao, u.versao)))
          .returning({ versao: usuarios.versao });
        if (atualizado === undefined) throw new ConflitoDeConcorrencia();
        novaVersao = atualizado.versao;
      }
    } catch (e) {
      if (ehViolacaoDeUnicidade(e)) throw new ConflitoDeConcorrencia();
      throw e;
    }
    await this.sincronizarCodigos(u);
    u.definirVersaoPersistida(novaVersao);
  }

  private async montar(linha: LinhaDeUsuario): Promise<Usuario> {
    const codigos = await this.exec
      .select()
      .from(codigosDeRecuperacao)
      .where(eq(codigosDeRecuperacao.usuarioId, linha.id))
      .orderBy(asc(codigosDeRecuperacao.criadoEm), asc(codigosDeRecuperacao.id));
    return paraUsuario(linha, codigos);
  }

  /** Remove do banco os códigos que saíram do agregado e grava (ou atualiza o uso de) os atuais. */
  private async sincronizarCodigos(u: Usuario): Promise<void> {
    const atuais = dadosDosCodigos(u);
    const ids = atuais.map((c) => c.id);
    await this.exec
      .delete(codigosDeRecuperacao)
      .where(
        ids.length === 0
          ? eq(codigosDeRecuperacao.usuarioId, u.id.valor)
          : and(eq(codigosDeRecuperacao.usuarioId, u.id.valor), notInArray(codigosDeRecuperacao.id, ids)),
      );
    if (atuais.length === 0) return;
    await this.exec
      .insert(codigosDeRecuperacao)
      .values(atuais)
      .onConflictDoUpdate({ target: codigosDeRecuperacao.id, set: { usadoEm: sql`excluded.usado_em` } });
  }
}
