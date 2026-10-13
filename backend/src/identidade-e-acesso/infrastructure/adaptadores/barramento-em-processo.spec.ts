import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginFalhou, SenhaAlterada, UsuarioId } from '../../domain/index.js';
import { BarramentoEmProcesso } from './barramento-em-processo.js';

const T = new Date('2026-10-13T12:00:00.000Z');

describe('BarramentoEmProcesso', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('entrega só aos assinantes do tipo, na ordem de assinatura e na ordem dos eventos', async () => {
    const barramento = new BarramentoEmProcesso();
    const chamadas: string[] = [];
    barramento.assinar('SenhaAlterada', (e) => {
      chamadas.push(`a:${e.tipo}`);
      return Promise.resolve();
    });
    barramento.assinar('SenhaAlterada', (e) => {
      chamadas.push(`b:${e.tipo}`);
      return Promise.resolve();
    });
    barramento.assinar('LoginFalhou', (e) => {
      chamadas.push(`c:${e.tipo}`);
      return Promise.resolve();
    });
    const u = UsuarioId.novo();
    await barramento.publicar([new SenhaAlterada(u, T), new LoginFalhou(u, 'senha', T)]);
    expect(chamadas).toEqual(['a:SenhaAlterada', 'b:SenhaAlterada', 'c:LoginFalhou']);
  });

  it('assinante que lança não impede o próximo e o log não contém dados do evento', async () => {
    const erro = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const barramento = new BarramentoEmProcesso();
    const u = UsuarioId.novo();
    const seguinte = vi.fn(() => Promise.resolve());
    barramento.assinar('SenhaAlterada', () => Promise.reject(new Error(`segredo ${u.valor}`)));
    barramento.assinar('SenhaAlterada', seguinte);
    await expect(barramento.publicar([new SenhaAlterada(u, T)])).resolves.toBeUndefined();
    expect(seguinte).toHaveBeenCalledTimes(1);
    expect(erro).toHaveBeenCalledWith('Falha em assinante de SenhaAlterada');
    expect(JSON.stringify(erro.mock.calls)).not.toContain(u.valor);
  });

  it('publicar sem assinantes não faz nada', async () => {
    await expect(new BarramentoEmProcesso().publicar([new SenhaAlterada(UsuarioId.novo(), T)])).resolves.toBeUndefined();
  });
});
