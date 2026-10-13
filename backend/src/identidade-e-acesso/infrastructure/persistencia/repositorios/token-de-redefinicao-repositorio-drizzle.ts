import { and, eq, gt, isNull } from 'drizzle-orm';
import { UsuarioId } from '../../../domain/index.js';
import type { TokenDeRedefinicaoRepositorio } from '../../../application/portas/index.js';
import type { ExecutorDrizzle } from '../executor.js';
import { tokensDeRedefinicao } from '../schema.js';

export class TokenDeRedefinicaoRepositorioDrizzle implements TokenDeRedefinicaoRepositorio {
  constructor(private readonly exec: ExecutorDrizzle) {}

  async criar(d: { hash: string; usuarioId: UsuarioId; expiraEm: Date }): Promise<void> {
    await this.exec
      .insert(tokensDeRedefinicao)
      .values({ hash: d.hash, usuarioId: d.usuarioId.valor, expiraEm: d.expiraEm });
  }

  async usuarioDoTokenValido(hash: string, agora: Date): Promise<UsuarioId | null> {
    const [linha] = await this.exec
      .select({ usuarioId: tokensDeRedefinicao.usuarioId })
      .from(tokensDeRedefinicao)
      .where(
        and(eq(tokensDeRedefinicao.hash, hash), isNull(tokensDeRedefinicao.usadoEm), gt(tokensDeRedefinicao.expiraEm, agora)),
      )
      .limit(1);
    return linha === undefined ? null : UsuarioId.de(linha.usuarioId);
  }

  /** Atômico no banco: o token só pode ser consumido uma vez. */
  async consumir(hash: string, agora: Date): Promise<boolean> {
    const linhas = await this.exec
      .update(tokensDeRedefinicao)
      .set({ usadoEm: agora })
      .where(
        and(eq(tokensDeRedefinicao.hash, hash), isNull(tokensDeRedefinicao.usadoEm), gt(tokensDeRedefinicao.expiraEm, agora)),
      )
      .returning({ hash: tokensDeRedefinicao.hash });
    return linhas.length > 0;
  }

  async invalidarDoUsuario(usuarioId: UsuarioId, agora: Date): Promise<void> {
    await this.exec
      .update(tokensDeRedefinicao)
      .set({ usadoEm: agora })
      .where(and(eq(tokensDeRedefinicao.usuarioId, usuarioId.valor), isNull(tokensDeRedefinicao.usadoEm)));
  }
}
