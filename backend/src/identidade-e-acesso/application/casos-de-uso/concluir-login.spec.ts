import { describe, expect, it } from 'vitest';
import {
  CHAVE_PUBLICA_DE_TESTE,
  criarAmbienteDeTeste,
  semearDesafio,
  semearDispositivo,
  semearUsuarioComMfa,
  semearUsuarioSemMfa,
  type AmbienteDeTeste,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import {
  CodigoMfaInvalido,
  DesafioInvalido,
  DispositivoRevogado,
  LimiteDeDispositivosAtingido,
  MfaObrigatorio,
  PoliticaDeLimiteDeDispositivos,
  SessaoDeLogin,
  UsuarioId,
  type Usuario,
} from '../../domain/index.js';
import { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import { ConcluirLogin, type EntradaConcluirLogin } from './concluir-login.js';

function montar() {
  const amb = criarAmbienteDeTeste();
  const caso = new ConcluirLogin({
    uow: amb.uow,
    emissor: amb.emissor,
    verificadorDeMfa: new VerificadorDeMfa(amb.totp, amb.cofre, amb.codigos),
    relogio: amb.relogio,
    politica: amb.politica,
    limiteDeDispositivos: new PoliticaDeLimiteDeDispositivos(),
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  return { amb, caso };
}

const informado = (id: string | null = null): EntradaConcluirLogin['dispositivo'] => ({
  id,
  apelido: 'MacBook da clínica',
  plataforma: 'macos',
  chavePublicaAuditoria: CHAVE_PUBLICA_DE_TESTE,
});

async function prepararComMfa(amb: AmbienteDeTeste) {
  const semeado = await semearUsuarioComMfa(amb);
  const desafio = await semearDesafio(amb, semeado.usuario.id);
  return { ...semeado, desafio };
}

const tipos = (amb: AmbienteDeTeste): string[] => amb.repos.auditoria.registros.map((r) => r.tipo);

describe('ConcluirLogin', () => {
  it('login completo: tokens, dispositivo novo, sessão com hash do refresh e auditoria', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio, codigoValido } = await prepararComMfa(amb);
    const saida = await caso.executar({
      desafio,
      codigo: { tipo: 'totp', valor: codigoValido },
      dispositivo: informado(),
      ip: '3.3.3.3',
    });
    expect(saida.accessToken.startsWith('access.')).toBe(true);
    expect(saida.accessExpiraEm.getTime()).toBe(amb.relogio.agora().getTime() + 15 * 60_000);
    expect(saida.usouCodigoDeRecuperacao).toBe(false);
    expect(saida.codigosRestantes).toBe(10);
    expect(saida.politica).toBe(amb.politica);
    expect(saida.usuario).toEqual({
      id: usuario.id.valor,
      nome: 'Lucas',
      email: 'lucas@clinica.com',
      papeis: ['proprietario'],
    });
    const sessoes = await amb.repos.sessoes.ativasDoUsuario(usuario.id);
    expect(sessoes).toHaveLength(1);
    expect(sessoes[0]?.refreshAtualHash).toBe(amb.emissor.hashDe(saida.refreshToken));
    expect(sessoes[0]?.refreshAtualHash).not.toBe(saida.refreshToken);
    expect(JSON.stringify([...amb.uow.estado.sessoes.values()])).not.toContain(saida.refreshToken);
    expect((await amb.repos.dispositivos.ativosDoUsuario(usuario.id)).map((d) => d.id.valor)).toEqual([saida.dispositivoId]);
    expect((await amb.repos.usuarios.porId(usuario.id))?.tentativasFalhas).toBe(0);
    expect(tipos(amb)).toEqual(['login-ok', 'dispositivo-registrado']);
    expect(amb.barramento.publicados.map((ev) => ev.tipo)).toEqual(['LoginRealizado', 'DispositivoRegistrado']);
    expect(amb.repos.auditoria.registros.every((r) => r.ip === '3.3.3.3')).toBe(true);
  });

  it('o desafio é de uso único', async () => {
    const { amb, caso } = montar();
    const { desafio, codigoValido } = await prepararComMfa(amb);
    const entrada = { desafio, codigo: { tipo: 'totp', valor: codigoValido }, dispositivo: informado(), ip: null } as const;
    await caso.executar(entrada);
    await expect(caso.executar(entrada)).rejects.toThrow(DesafioInvalido);
  });

  it('código errado: CodigoMfaInvalido, desafio consumido e falha contada (persistidos)', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio } = await prepararComMfa(amb);
    await expect(
      caso.executar({ desafio, codigo: { tipo: 'totp', valor: '000000' }, dispositivo: informado(), ip: null }),
    ).rejects.toThrow(CodigoMfaInvalido);
    const { id } = amb.emissor.verificarDesafio(desafio);
    expect((await amb.repos.desafios.porId(id))?.usadoEm).not.toBeNull();
    expect((await amb.repos.usuarios.porId(usuario.id))?.tentativasFalhas).toBe(1);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
    expect(tipos(amb)).toEqual(['login-falhou']);
  });

  it('código de recuperação: usouCodigoDeRecuperacao, 9 restantes e auditoria', async () => {
    const { amb, caso } = montar();
    const { desafio, codigosDeRecuperacao } = await prepararComMfa(amb);
    const saida = await caso.executar({
      desafio,
      codigo: { tipo: 'recuperacao', valor: codigosDeRecuperacao[0] as string },
      dispositivo: informado(),
      ip: null,
    });
    expect(saida.usouCodigoDeRecuperacao).toBe(true);
    expect(saida.codigosRestantes).toBe(9);
    expect(tipos(amb)).toContain('codigo-de-recuperacao-usado');
    expect(JSON.stringify(amb.repos.auditoria.registros)).not.toContain(codigosDeRecuperacao[0]);
  });

  it('dispositivo existente ativo é reutilizado e a sessão anterior é revogada', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio, codigoValido } = await prepararComMfa(amb);
    const dispositivo = await semearDispositivo(amb, usuario.id);
    const antiga = SessaoDeLogin.iniciar({
      usuarioId: usuario.id,
      dispositivoId: dispositivo.id,
      refreshHash: 'a'.repeat(64),
      agora: amb.relogio.agora(),
      politica: amb.politica,
    });
    await amb.repos.sessoes.salvar(antiga);
    const saida = await caso.executar({
      desafio,
      codigo: { tipo: 'totp', valor: codigoValido },
      dispositivo: informado(dispositivo.id.valor),
      ip: null,
    });
    expect(saida.dispositivoId).toBe(dispositivo.id.valor);
    const antigaSalva = await amb.repos.sessoes.porId(antiga.id);
    expect(antigaSalva?.situacao).toBe('revogada');
    expect(antigaSalva?.motivoRevogacao).toBe('nova-sessao-no-dispositivo');
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(1);
    expect(tipos(amb)).toEqual(['login-ok', 'sessao-revogada']);
  });

  it('dispositivo revogado: DispositivoRevogado e nenhuma sessão criada', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio, codigoValido } = await prepararComMfa(amb);
    const dispositivo = await semearDispositivo(amb, usuario.id);
    dispositivo.revogar('perdido', amb.relogio.agora());
    await amb.repos.dispositivos.salvar(dispositivo);
    await expect(
      caso.executar({
        desafio,
        codigo: { tipo: 'totp', valor: codigoValido },
        dispositivo: informado(dispositivo.id.valor),
        ip: null,
      }),
    ).rejects.toThrow(DispositivoRevogado);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
    expect((await amb.repos.usuarios.porId(usuario.id))?.ultimoPassoTotp()).toBe(1001);
  });

  it('dispositivo novo acima do limite: LimiteDeDispositivosAtingido', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio, codigoValido } = await prepararComMfa(amb);
    for (let i = 0; i < 3; i++) await semearDispositivo(amb, usuario.id);
    await expect(
      caso.executar({ desafio, codigo: { tipo: 'totp', valor: codigoValido }, dispositivo: informado(), ip: null }),
    ).rejects.toThrow(LimiteDeDispositivosAtingido);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
    expect(await amb.repos.dispositivos.ativosDoUsuario(usuario.id)).toHaveLength(3);
  });

  it.each([
    ['id nulo', null],
    ['id inválido', 'nao-e-uuid'],
    ['id inexistente', UsuarioId.novo().valor],
  ])('%s registra um dispositivo novo', async (_nome, id) => {
    const { amb, caso } = montar();
    const { usuario, desafio, codigoValido } = await prepararComMfa(amb);
    const saida = await caso.executar({
      desafio,
      codigo: { tipo: 'totp', valor: codigoValido },
      dispositivo: informado(id),
      ip: null,
    });
    expect(saida.dispositivoId).not.toBe(id);
    expect(await amb.repos.dispositivos.ativosDoUsuario(usuario.id)).toHaveLength(1);
  });

  it('dispositivo de outro usuário não é reutilizado: registra um novo', async () => {
    const { amb, caso } = montar();
    const { desafio, codigoValido, usuario } = await prepararComMfa(amb);
    const outro = await semearUsuarioSemMfa(amb, { email: 'outro@clinica.com' });
    const deOutro = await semearDispositivo(amb, outro.usuario.id);
    const saida = await caso.executar({
      desafio,
      codigo: { tipo: 'totp', valor: codigoValido },
      dispositivo: informado(deOutro.id.valor),
      ip: null,
    });
    expect(saida.dispositivoId).not.toBe(deOutro.id.valor);
    expect(await amb.repos.dispositivos.ativosDoUsuario(usuario.id)).toHaveLength(1);
  });

  it('dados de dispositivo inválidos (plataforma) falham sem criar sessão', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio, codigoValido } = await prepararComMfa(amb);
    await expect(
      caso.executar({
        desafio,
        codigo: { tipo: 'totp', valor: codigoValido },
        dispositivo: { ...informado(), plataforma: 'linux' },
        ip: null,
      }),
    ).rejects.toThrow('Dado inválido: plataforma.');
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
  });

  it('usuário sem MFA configurado lança MfaObrigatorio', async () => {
    const { amb, caso } = montar();
    const { desafio } = await semearUsuarioSemMfa(amb);
    await expect(
      caso.executar({ desafio, codigo: { tipo: 'totp', valor: '123456' }, dispositivo: informado(), ip: null }),
    ).rejects.toThrow(MfaObrigatorio);
  });

  it('conta desativada depois do desafio não conclui o login', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio, codigoValido } = await prepararComMfa(amb);
    const u: Usuario = (await amb.repos.usuarios.porId(usuario.id))!;
    u.desativar(amb.relogio.agora());
    await amb.repos.usuarios.salvar(u);
    await expect(
      caso.executar({ desafio, codigo: { tipo: 'totp', valor: codigoValido }, dispositivo: informado(), ip: null }),
    ).rejects.toThrow('Conta desativada.');
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
  });
});
