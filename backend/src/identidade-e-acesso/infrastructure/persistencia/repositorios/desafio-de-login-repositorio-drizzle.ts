import { and, eq, gt, isNull } from 'drizzle-orm';
import { UsuarioId } from '../../../domain/index.js';
import type { DesafioDeLogin, DesafioDeLoginRepositorio } from '../../../application/portas/index.js';
import { REGEX_UUID } from '../../../domain/index.js';
import type { ExecutorDrizzle } from '../executor.js';
import { desafiosDeLogin } from '../schema.js';

export class DesafioDeLoginRepositorioDrizzle implements DesafioDeLoginRepositorio {
  constructor(private readonly exec: ExecutorDrizzle) {}

  async criar(d: { id: string; usuarioId: UsuarioId; expiraEm: Date }): Promise<void> {
    await this.exec.insert(desafiosDeLogin).values({ id: d.id, usuarioId: d.usuarioId.valor, expiraEm: d.expiraEm });
  }

  async porId(id: string): Promise<DesafioDeLogin | null> {
    if (!REGEX_UUID.test(id)) return null;
    const [linha] = await this.exec.select().from(desafiosDeLogin).where(eq(desafiosDeLogin.id, id)).limit(1);
    if (linha === undefined) return null;
    return {
      id: linha.id,
      usuarioId: UsuarioId.de(linha.usuarioId),
      expiraEm: linha.expiraEm,
      usadoEm: linha.usadoEm,
    };
  }

  /** Atômico no banco: só uma chamada concorrente recebe `true`. */
  async marcarUsado(id: string, agora: Date): Promise<boolean> {
    if (!REGEX_UUID.test(id)) return false;
    const linhas = await this.exec
      .update(desafiosDeLogin)
      .set({ usadoEm: agora })
      .where(and(eq(desafiosDeLogin.id, id), isNull(desafiosDeLogin.usadoEm), gt(desafiosDeLogin.expiraEm, agora)))
      .returning({ id: desafiosDeLogin.id });
    return linhas.length > 0;
  }
}
