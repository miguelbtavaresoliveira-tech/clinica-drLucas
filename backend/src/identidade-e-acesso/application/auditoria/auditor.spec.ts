import { describe, expect, it } from 'vitest';
import {
  AcessoRedefinidoAdministrativamente,
  CodigoDeRecuperacaoUsado,
  CodigosDeRecuperacaoRegenerados,
  DispositivoFoiRevogado,
  DispositivoId,
  DispositivoRegistrado,
  LoginFalhou,
  LoginRealizado,
  MfaConfigurado,
  SenhaAlterada,
  SessaoDeLoginId,
  SessaoRevogada,
  UsuarioBloqueado,
  UsuarioCriado,
  UsuarioDesativado,
  UsuarioId,
  type EventoDeDominio,
} from '../../domain/index.js';
import { RepositorioDeAuditoriaEmMemoria, EstadoEmMemoria } from '../../../../test/identidade-e-acesso/fakes/index.js';
import { Auditor } from './auditor.js';

const T = new Date('2026-10-13T12:00:00.000Z');
const u = UsuarioId.novo();
const d = DispositivoId.novo();
const s = SessaoDeLoginId.novo();
const meta = { ip: '10.0.0.1', dispositivoId: null };

const casos: [string, EventoDeDominio, string, Record<string, string | number | boolean | null>][] = [
  ['UsuarioCriado', new UsuarioCriado(u, T), 'usuario-criado', {}],
  ['UsuarioDesativado', new UsuarioDesativado(u, T), 'usuario-desativado', {}],
  ['AcessoRedefinidoAdministrativamente', new AcessoRedefinidoAdministrativamente(u, T), 'acesso-redefinido-administrativamente', {}],
  ['MfaConfigurado', new MfaConfigurado(u, T), 'mfa-configurado', {}],
  ['SenhaAlterada', new SenhaAlterada(u, T), 'senha-alterada', {}],
  ['LoginRealizado', new LoginRealizado(u, d, T), 'login-ok', {}],
  ['LoginFalhou', new LoginFalhou(u, 'mfa', T), 'login-falhou', { motivo: 'mfa' }],
  ['UsuarioBloqueado', new UsuarioBloqueado(u, T, T), 'usuario-bloqueado', { bloqueadoAte: T.toISOString() }],
  ['CodigoDeRecuperacaoUsado', new CodigoDeRecuperacaoUsado(u, 9, T), 'codigo-de-recuperacao-usado', { restantes: 9 }],
  ['CodigosDeRecuperacaoRegenerados', new CodigosDeRecuperacaoRegenerados(u, T), 'codigos-de-recuperacao-regenerados', {}],
  ['DispositivoRegistrado', new DispositivoRegistrado(d, u, 'macos', T), 'dispositivo-registrado', { plataforma: 'macos' }],
  ['DispositivoRevogado', new DispositivoFoiRevogado(d, u, 'perdido', T), 'dispositivo-revogado', { motivo: 'perdido' }],
  ['SessaoRevogada (reutilização)', new SessaoRevogada(s, u, d, 'reutilizacao-de-refresh', T), 'refresh-reutilizado', { motivo: 'reutilizacao-de-refresh' }],
  ['SessaoRevogada (demais)', new SessaoRevogada(s, u, d, 'logout', T), 'sessao-revogada', { motivo: 'logout' }],
];

describe('Auditor', () => {
  const auditor = new Auditor();

  it.each(casos)('%s', (_nome, evento, tipo, detalhe) => {
    const [r] = auditor.paraRegistros([evento], meta);
    expect(r).toMatchObject({ origem: 'servidor', tipo, detalhe, ip: '10.0.0.1', ocorridoEm: T, usuarioId: u.valor });
    expect(r?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('dispositivoId vem do evento quando existe e de meta quando não', () => {
    const outro = DispositivoId.novo();
    const [doEvento] = auditor.paraRegistros([new LoginRealizado(u, d, T)], { ip: null, dispositivoId: outro });
    expect(doEvento?.dispositivoId).toBe(d.valor);
    const [daMeta] = auditor.paraRegistros([new SenhaAlterada(u, T)], { ip: null, dispositivoId: outro });
    expect(daMeta?.dispositivoId).toBe(outro.valor);
    const [nenhum] = auditor.paraRegistros([new SenhaAlterada(u, T)], { ip: null, dispositivoId: null });
    expect(nenhum?.dispositivoId).toBeNull();
  });

  it('nenhum detalhe contém chaves sensíveis', () => {
    const proibidas = ['senha', 'codigo', 'token', 'hash', 'segredo', 'email'];
    for (const r of auditor.paraRegistros(
      casos.map((c) => c[1]),
      meta,
    )) {
      for (const chave of Object.keys(r.detalhe)) expect(proibidas).not.toContain(chave);
    }
  });

  it('registrar grava na ordem dos eventos', async () => {
    const repo = new RepositorioDeAuditoriaEmMemoria(new EstadoEmMemoria());
    await auditor.registrar(repo, [new UsuarioBloqueado(u, T, T), new LoginFalhou(u, 'senha', T)], meta);
    expect(repo.registros.map((r) => r.tipo)).toEqual(['usuario-bloqueado', 'login-falhou']);
  });

  it('evento desconhecido lança erro explícito', () => {
    expect(() => auditor.paraRegistros([{ tipo: 'Inventado', ocorridoEm: T }], meta)).toThrow(
      'Evento sem mapeamento de auditoria: Inventado',
    );
  });

  it('avulso monta o registro sem evento', () => {
    const r = auditor.avulso('redefinicao-de-senha-solicitada', {
      ocorridoEm: T,
      usuarioId: u,
      dispositivoId: null,
      ip: null,
    });
    expect(r).toMatchObject({ origem: 'servidor', tipo: 'redefinicao-de-senha-solicitada', usuarioId: u.valor, detalhe: {} });
  });
});
