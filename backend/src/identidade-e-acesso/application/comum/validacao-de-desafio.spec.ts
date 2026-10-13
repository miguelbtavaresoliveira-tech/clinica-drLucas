import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  semearUsuarioComMfa,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import { DesafioInvalido, UsuarioId } from '../../domain/index.js';
import { carregarDesafioValido } from './validacao-de-desafio.js';

describe('carregarDesafioValido', () => {
  it('carrega usuário de um desafio válido sem marcá-lo como usado', async () => {
    const amb = criarAmbienteDeTeste();
    const { usuario } = await semearUsuarioComMfa(amb);
    const agora = amb.relogio.agora();
    const { id, token } = amb.emissor.emitirDesafio(usuario.id, agora);
    await amb.repos.desafios.criar({ id, usuarioId: usuario.id, expiraEm: new Date(agora.getTime() + 60_000) });
    const r = await carregarDesafioValido(token, amb.emissor, amb.repos, agora);
    expect(r.desafioId).toBe(id);
    expect(r.usuario.id.valor).toBe(usuario.id.valor);
    expect((await amb.repos.desafios.porId(id))?.usadoEm).toBeNull();
  });

  it('token inválido lança DesafioInvalido', async () => {
    const amb = criarAmbienteDeTeste();
    await expect(carregarDesafioValido('lixo', amb.emissor, amb.repos, amb.relogio.agora())).rejects.toThrow(
      DesafioInvalido,
    );
  });

  it('desafio inexistente lança DesafioInvalido', async () => {
    const amb = criarAmbienteDeTeste();
    const { token } = amb.emissor.emitirDesafio(UsuarioId.novo(), amb.relogio.agora());
    await expect(carregarDesafioValido(token, amb.emissor, amb.repos, amb.relogio.agora())).rejects.toThrow(
      DesafioInvalido,
    );
  });

  it('desafio já usado lança DesafioInvalido', async () => {
    const amb = criarAmbienteDeTeste();
    const { usuario } = await semearUsuarioComMfa(amb);
    const agora = amb.relogio.agora();
    const { id, token } = amb.emissor.emitirDesafio(usuario.id, agora);
    await amb.repos.desafios.criar({ id, usuarioId: usuario.id, expiraEm: new Date(agora.getTime() + 60_000) });
    await amb.repos.desafios.marcarUsado(id, agora);
    await expect(carregarDesafioValido(token, amb.emissor, amb.repos, agora)).rejects.toThrow(DesafioInvalido);
  });

  it('desafio expirado (agora === expiraEm) lança DesafioInvalido', async () => {
    const amb = criarAmbienteDeTeste();
    const { usuario } = await semearUsuarioComMfa(amb);
    const agora = amb.relogio.agora();
    const { id, token } = amb.emissor.emitirDesafio(usuario.id, agora);
    await amb.repos.desafios.criar({ id, usuarioId: usuario.id, expiraEm: agora });
    await expect(carregarDesafioValido(token, amb.emissor, amb.repos, agora)).rejects.toThrow(DesafioInvalido);
  });

  it('desafio de outro usuário lança DesafioInvalido', async () => {
    const amb = criarAmbienteDeTeste();
    const { usuario } = await semearUsuarioComMfa(amb);
    const agora = amb.relogio.agora();
    const { id, token } = amb.emissor.emitirDesafio(usuario.id, agora);
    await amb.repos.desafios.criar({ id, usuarioId: UsuarioId.novo(), expiraEm: new Date(agora.getTime() + 60_000) });
    await expect(carregarDesafioValido(token, amb.emissor, amb.repos, agora)).rejects.toThrow(DesafioInvalido);
  });

  it('usuário inexistente lança DesafioInvalido', async () => {
    const amb = criarAmbienteDeTeste();
    const agora = amb.relogio.agora();
    const fantasma = UsuarioId.novo();
    const { id, token } = amb.emissor.emitirDesafio(fantasma, agora);
    await amb.repos.desafios.criar({ id, usuarioId: fantasma, expiraEm: new Date(agora.getTime() + 60_000) });
    await expect(carregarDesafioValido(token, amb.emissor, amb.repos, agora)).rejects.toThrow(DesafioInvalido);
  });
});
