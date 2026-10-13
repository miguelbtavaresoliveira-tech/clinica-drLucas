import { DesafioInvalido, SessaoExpirada, UsuarioId } from '../../../src/identidade-e-acesso/domain/index.js';
import type { DadosDoAccess, EmissorDeTokens } from '../../../src/identidade-e-acesso/application/portas/index.js';
import { sha256Hex } from './cripto-de-teste.js';

export class EmissorDeTokensFalso implements EmissorDeTokens {
  private contador = 0;

  emitirAccess(dados: DadosDoAccess, _expiraEm: Date): string {
    return `access.${Buffer.from(JSON.stringify(dados)).toString('base64url')}`;
  }

  verificarAccess(token: string): DadosDoAccess {
    if (!token.startsWith('access.')) throw new SessaoExpirada();
    try {
      return JSON.parse(Buffer.from(token.slice('access.'.length), 'base64url').toString('utf8')) as DadosDoAccess;
    } catch {
      throw new SessaoExpirada();
    }
  }

  gerarTokenOpaco(): { token: string; hash: string } {
    this.contador += 1;
    const token = `opaco-${String(this.contador)}`;
    return { token, hash: sha256Hex(token) };
  }

  hashDe(token: string): string {
    return sha256Hex(token);
  }

  emitirDesafio(usuarioId: UsuarioId, _expiraEm: Date): { id: string; token: string } {
    const id = crypto.randomUUID();
    return { id, token: `desafio.${id}.${usuarioId.valor}` };
  }

  verificarDesafio(token: string): { id: string; usuarioId: UsuarioId } {
    const partes = token.split('.');
    if (partes.length !== 3 || partes[0] !== 'desafio') throw new DesafioInvalido();
    try {
      return { id: partes[1] as string, usuarioId: UsuarioId.de(partes[2] as string) };
    } catch {
      throw new DesafioInvalido();
    }
  }
}
