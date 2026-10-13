import { describe, expect, it } from 'vitest';
import { DispositivoId } from './dispositivo/dispositivo-id.js';
import * as ev from './eventos.js';
import { SessaoDeLoginId } from './sessao-de-login/sessao-de-login-id.js';
import { UsuarioId } from './usuario/usuario-id.js';

const u = UsuarioId.novo();
const d = DispositivoId.novo();
const s = SessaoDeLoginId.novo();
const t = new Date('2026-01-01T00:00:00Z');

const casos: [string, ev.EventoDeIdentidade, string][] = [
  ['UsuarioCriado', new ev.UsuarioCriado(u, t), 'UsuarioCriado'],
  ['MfaConfigurado', new ev.MfaConfigurado(u, t), 'MfaConfigurado'],
  ['SenhaAlterada', new ev.SenhaAlterada(u, t), 'SenhaAlterada'],
  ['LoginRealizado', new ev.LoginRealizado(u, d, t), 'LoginRealizado'],
  ['LoginFalhou', new ev.LoginFalhou(u, 'senha', t), 'LoginFalhou'],
  ['UsuarioBloqueado', new ev.UsuarioBloqueado(u, t, t), 'UsuarioBloqueado'],
  ['CodigoDeRecuperacaoUsado', new ev.CodigoDeRecuperacaoUsado(u, 7, t), 'CodigoDeRecuperacaoUsado'],
  ['CodigosDeRecuperacaoRegenerados', new ev.CodigosDeRecuperacaoRegenerados(u, t), 'CodigosDeRecuperacaoRegenerados'],
  ['UsuarioDesativado', new ev.UsuarioDesativado(u, t), 'UsuarioDesativado'],
  ['AcessoRedefinidoAdministrativamente', new ev.AcessoRedefinidoAdministrativamente(u, t), 'AcessoRedefinidoAdministrativamente'],
  ['DispositivoRegistrado', new ev.DispositivoRegistrado(d, u, 'macos', t), 'DispositivoRegistrado'],
  ['DispositivoFoiRevogado', new ev.DispositivoFoiRevogado(d, u, 'manual', t), 'DispositivoRevogado'],
  ['SessaoRevogada', new ev.SessaoRevogada(s, u, d, 'logout', t), 'SessaoRevogada'],
];

describe('eventos de identidade', () => {
  it('declara os 13 eventos', () => {
    expect(casos).toHaveLength(13);
  });

  it.each(casos)('%s tem tipo correto e ocorridoEm', (_nome, evento, tipo) => {
    expect(evento.tipo).toBe(tipo);
    expect(evento.ocorridoEm).toBe(t);
  });

  it.each(casos)('%s não carrega dado sensível', (_nome, evento) => {
    const proibidos = ['senha', 'codigo', 'hash', 'segredo', 'token'];
    for (const chave of Object.keys(evento)) expect(proibidos).not.toContain(chave);
  });

  it('preserva os campos', () => {
    expect(new ev.LoginRealizado(u, d, t)).toMatchObject({ usuarioId: u, dispositivoId: d });
    expect(new ev.CodigoDeRecuperacaoUsado(u, 7, t).restantes).toBe(7);
    expect(new ev.SessaoRevogada(s, u, d, 'logout', t)).toMatchObject({ sessaoId: s, motivo: 'logout' });
  });
});
