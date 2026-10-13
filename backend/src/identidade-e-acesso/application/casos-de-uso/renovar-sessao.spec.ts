import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  entrar,
  semearUsuarioComMfa,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import {
  ContextoDeAcesso,
  DispositivoId,
  DispositivoRevogado,
  PROPRIETARIO,
  RefreshReutilizado,
  SessaoExpirada,
  UsuarioId,
} from '../../domain/index.js';
import { EncerrarSessao } from './encerrar-sessao.js';
import { RenovarSessao } from './renovar-sessao.js';

async function montar() {
  const amb = criarAmbienteDeTeste();
  const { usuario } = await semearUsuarioComMfa(amb);
  const login = await entrar(amb, usuario.id);
  const renovar = new RenovarSessao({
    uow: amb.uow,
    emissor: amb.emissor,
    relogio: amb.relogio,
    politica: amb.politica,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  const encerrar = new EncerrarSessao({
    uow: amb.uow,
    relogio: amb.relogio,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  return { amb, usuario, login, renovar, encerrar };
}

describe('RenovarSessao', () => {
  it('rotação feliz: novo refresh funciona e o check-in é atualizado', async () => {
    const { amb, login, renovar } = await montar();
    amb.relogio.avancar(60_000);
    const saida = await renovar.executar({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId, ip: null });
    expect(saida.refreshToken).not.toBe(login.refreshToken);
    expect(saida.accessExpiraEm.getTime()).toBe(amb.relogio.agora().getTime() + 15 * 60_000);
    expect(saida.politica).toBe(amb.politica);
    const dispositivo = await amb.repos.dispositivos.porId(DispositivoId.de(login.dispositivoId));
    expect(dispositivo?.ultimoCheckIn).toEqual(amb.relogio.agora());
    amb.relogio.avancar(60_000);
    await expect(
      renovar.executar({ refreshToken: saida.refreshToken, dispositivoId: login.dispositivoId, ip: null }),
    ).resolves.toBeDefined();
  });

  it('reutilização: RefreshReutilizado, sessão revogada e o refresh novo também falha', async () => {
    const { amb, usuario, login, renovar } = await montar();
    const saida = await renovar.executar({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId, ip: null });
    await expect(
      renovar.executar({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId, ip: '4.4.4.4' }),
    ).rejects.toThrow(RefreshReutilizado);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
    await expect(
      renovar.executar({ refreshToken: saida.refreshToken, dispositivoId: login.dispositivoId, ip: null }),
    ).rejects.toThrow(SessaoExpirada);
    const auditada = amb.repos.auditoria.registros.find((r) => r.tipo === 'refresh-reutilizado');
    expect(auditada).toMatchObject({ ip: '4.4.4.4', detalhe: { motivo: 'reutilizacao-de-refresh' } });
    expect(amb.barramento.publicados.some((e) => e.tipo === 'SessaoRevogada')).toBe(true);
  });

  it('token desconhecido lança SessaoExpirada', async () => {
    const { login, renovar } = await montar();
    await expect(
      renovar.executar({ refreshToken: 'desconhecido', dispositivoId: login.dispositivoId, ip: null }),
    ).rejects.toThrow(SessaoExpirada);
  });

  it('dispositivo revogado não renova: DispositivoRevogado e a sessão é revogada', async () => {
    const { amb, usuario, login, renovar } = await montar();
    const dispositivo = (await amb.repos.dispositivos.porId(DispositivoId.de(login.dispositivoId)))!;
    dispositivo.revogar('perdido', amb.relogio.agora());
    await amb.repos.dispositivos.salvar(dispositivo);
    await expect(
      renovar.executar({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId, ip: null }),
    ).rejects.toThrow(DispositivoRevogado);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
  });

  it.each([['outro UUID', DispositivoId.novo().valor], ['formato inválido', 'nao-e-uuid']])(
    'dispositivoId divergente (%s) lança SessaoExpirada',
    async (_nome, dispositivoId) => {
      const { login, renovar } = await montar();
      await expect(renovar.executar({ refreshToken: login.refreshToken, dispositivoId, ip: null })).rejects.toThrow(
        SessaoExpirada,
      );
    },
  );

  it('sessão expirada (30 dias depois) lança SessaoExpirada', async () => {
    const { amb, login, renovar } = await montar();
    amb.relogio.avancar(30 * 86_400_000);
    await expect(
      renovar.executar({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId, ip: null }),
    ).rejects.toThrow(SessaoExpirada);
  });

  it('usuário desativado lança SessaoExpirada e a sessão é revogada', async () => {
    const { amb, usuario, login, renovar } = await montar();
    const u = (await amb.repos.usuarios.porId(usuario.id))!;
    u.desativar(amb.relogio.agora());
    await amb.repos.usuarios.salvar(u);
    await expect(
      renovar.executar({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId, ip: null }),
    ).rejects.toThrow(SessaoExpirada);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
  });
});

describe('EncerrarSessao', () => {
  it('logout revoga a sessão, audita e a segunda chamada não lança', async () => {
    const { amb, usuario, login, renovar, encerrar } = await montar();
    const ctx = new ContextoDeAcesso(usuario.id, DispositivoId.de(login.dispositivoId), [PROPRIETARIO]);
    await encerrar.executar({ ctx, ip: null });
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
    expect(amb.repos.auditoria.registros.at(-1)).toMatchObject({ tipo: 'sessao-revogada', detalhe: { motivo: 'logout' } });
    await expect(encerrar.executar({ ctx, ip: null })).resolves.toBeUndefined();
    await expect(
      renovar.executar({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId, ip: null }),
    ).rejects.toThrow(SessaoExpirada);
  });

  it('não revoga sessão de outro usuário no mesmo dispositivo', async () => {
    const { amb, usuario, login, encerrar } = await montar();
    const ctx = new ContextoDeAcesso(UsuarioId.novo(), DispositivoId.de(login.dispositivoId), [PROPRIETARIO]);
    await encerrar.executar({ ctx, ip: null });
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(1);
  });
});
