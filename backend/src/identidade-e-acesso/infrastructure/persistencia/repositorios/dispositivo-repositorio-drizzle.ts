import { and, asc, eq, sql } from 'drizzle-orm';
import type { Dispositivo, DispositivoId, UsuarioId } from '../../../domain/index.js';
import { ConflitoDeConcorrencia, type DispositivoRepositorio } from '../../../application/portas/index.js';
import { ehViolacaoDeUnicidade } from '../erros-de-banco.js';
import type { ExecutorDrizzle } from '../executor.js';
import { dadosDoDispositivo, paraDispositivo } from '../mapeadores.js';
import { dispositivos } from '../schema.js';

export class DispositivoRepositorioDrizzle implements DispositivoRepositorio {
  constructor(private readonly exec: ExecutorDrizzle) {}

  async porId(id: DispositivoId): Promise<Dispositivo | null> {
    const [linha] = await this.exec.select().from(dispositivos).where(eq(dispositivos.id, id.valor)).limit(1);
    return linha === undefined ? null : paraDispositivo(linha);
  }

  async ativosDoUsuario(id: UsuarioId): Promise<Dispositivo[]> {
    const linhas = await this.exec
      .select()
      .from(dispositivos)
      .where(and(eq(dispositivos.usuarioId, id.valor), eq(dispositivos.situacao, 'ativo')))
      .orderBy(asc(dispositivos.registradoEm));
    return linhas.map(paraDispositivo);
  }

  async todosDoUsuario(id: UsuarioId): Promise<Dispositivo[]> {
    const linhas = await this.exec
      .select()
      .from(dispositivos)
      .where(eq(dispositivos.usuarioId, id.valor))
      .orderBy(asc(dispositivos.registradoEm));
    return linhas.map(paraDispositivo);
  }

  async salvar(d: Dispositivo): Promise<void> {
    const dados = dadosDoDispositivo(d);
    let novaVersao: number;
    try {
      if (d.versao === 0) {
        await this.exec.insert(dispositivos).values({ ...dados, versao: 1 });
        novaVersao = 1;
      } else {
        const [atualizado] = await this.exec
          .update(dispositivos)
          .set({ ...dados, versao: sql`${dispositivos.versao} + 1` })
          .where(and(eq(dispositivos.id, d.id.valor), eq(dispositivos.versao, d.versao)))
          .returning({ versao: dispositivos.versao });
        if (atualizado === undefined) throw new ConflitoDeConcorrencia();
        novaVersao = atualizado.versao;
      }
    } catch (e) {
      if (ehViolacaoDeUnicidade(e)) throw new ConflitoDeConcorrencia();
      throw e;
    }
    d.definirVersaoPersistida(novaVersao);
  }
}
