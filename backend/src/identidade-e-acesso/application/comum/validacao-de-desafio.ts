import { DesafioInvalido, type Usuario } from '../../domain/index.js';
import type { EmissorDeTokens } from '../portas/servicos.js';
import type { RepositoriosDaTransacao } from '../portas/unidade-de-trabalho.js';

/** Valida o desafio de login sem marcá-lo como usado. */
export async function carregarDesafioValido(
  token: string,
  emissor: EmissorDeTokens,
  r: RepositoriosDaTransacao,
  agora: Date,
): Promise<{ desafioId: string; usuario: Usuario }> {
  const { id, usuarioId } = emissor.verificarDesafio(token);
  const linha = await r.desafios.porId(id);
  if (linha === null || linha.usadoEm !== null || agora.getTime() >= linha.expiraEm.getTime()) {
    throw new DesafioInvalido();
  }
  if (!linha.usuarioId.igual(usuarioId)) throw new DesafioInvalido();
  const usuario = await r.usuarios.porId(usuarioId);
  if (usuario === null) throw new DesafioInvalido();
  return { desafioId: id, usuario };
}
