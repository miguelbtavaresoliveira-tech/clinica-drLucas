import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { DispositivoId, SessaoDeLogin, SessaoDeLoginId, UsuarioId } from '../../../domain/index.js';
import { ConflitoDeConcorrencia, type SessaoDeLoginRepositorio } from '../../../application/portas/index.js';
import { ehViolacaoDeUnicidade } from '../erros-de-banco.js';
import type { ExecutorDrizzle } from '../executor.js';
import { dadosDaSessao, paraSessaoDeLogin } from '../mapeadores.js';
import { sessoesDeLogin } from '../schema.js';

export class SessaoDeLoginRepositorioDrizzle implements SessaoDeLoginRepositorio {
  constructor(private readonly exec: ExecutorDrizzle) {}

  async porId(id: SessaoDeLoginId): Promise<SessaoDeLogin | null> {
    const [linha] = await this.exec.select().from(sessoesDeLogin).where(eq(sessoesDeLogin.id, id.valor)).limit(1);
    return linha === undefined ? null : paraSessaoDeLogin(linha);
  }

  async ativaDoDispositivo(id: DispositivoId): Promise<SessaoDeLogin | null> {
    const [linha] = await this.exec
      .select()
      .from(sessoesDeLogin)
      .where(and(eq(sessoesDeLogin.dispositivoId, id.valor), eq(sessoesDeLogin.situacao, 'ativa')))
      .limit(1);
    return linha === undefined ? null : paraSessaoDeLogin(linha);
  }

  async ativasDoUsuario(id: UsuarioId): Promise<SessaoDeLogin[]> {
    const linhas = await this.exec
      .select()
      .from(sessoesDeLogin)
      .where(and(eq(sessoesDeLogin.usuarioId, id.valor), eq(sessoesDeLogin.situacao, 'ativa')))
      .orderBy(desc(sessoesDeLogin.criadaEm));
    return linhas.map(paraSessaoDeLogin);
  }

  /** Casa o refresh atual OU o anterior (detecção de reutilização); havendo mais de uma, a mais recente. */
  async porRefreshHash(hash: string): Promise<SessaoDeLogin | null> {
    const [linha] = await this.exec
      .select()
      .from(sessoesDeLogin)
      .where(or(eq(sessoesDeLogin.refreshAtualHash, hash), eq(sessoesDeLogin.refreshAnteriorHash, hash)))
      .orderBy(desc(sessoesDeLogin.criadaEm))
      .limit(1);
    return linha === undefined ? null : paraSessaoDeLogin(linha);
  }

  async salvar(s: SessaoDeLogin): Promise<void> {
    const dados = dadosDaSessao(s);
    let novaVersao: number;
    try {
      if (s.versao === 0) {
        await this.exec.insert(sessoesDeLogin).values({ ...dados, versao: 1 });
        novaVersao = 1;
      } else {
        const [atualizada] = await this.exec
          .update(sessoesDeLogin)
          .set({ ...dados, versao: sql`${sessoesDeLogin.versao} + 1` })
          .where(and(eq(sessoesDeLogin.id, s.id.valor), eq(sessoesDeLogin.versao, s.versao)))
          .returning({ versao: sessoesDeLogin.versao });
        if (atualizada === undefined) throw new ConflitoDeConcorrencia();
        novaVersao = atualizada.versao;
      }
    } catch (e) {
      if (ehViolacaoDeUnicidade(e)) throw new ConflitoDeConcorrencia();
      throw e;
    }
    s.definirVersaoPersistida(novaVersao);
  }
}
