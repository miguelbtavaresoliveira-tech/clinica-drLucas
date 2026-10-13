import { describe, expect, it, vi } from 'vitest';
import type { RedefinirAcessoAdministrativo } from '../../application/index.js';
import { SenhaFraca, UsuarioNaoEncontrado } from '../../domain/index.js';
import { executarRedefinicao } from './executar-redefinicao.js';
import type { Terminal } from './terminal.js';

function terminalFalso(respostas: string[]) {
  const fila = [...respostas];
  const saida: string[] = [];
  const erros: string[] = [];
  const responder = (texto: string): Promise<string> => {
    saida.push(texto);
    return Promise.resolve(fila.shift() ?? '');
  };
  const terminal: Terminal = {
    perguntar: responder,
    perguntarSenha: responder,
    escrever: (texto) => {
      saida.push(texto);
    },
    erro: (texto) => {
      erros.push(texto);
    },
  };
  return { terminal, saida, erros, tudo: () => [...saida, ...erros].join('\n') };
}

const casoFalso = (executar: () => Promise<void>) => {
  const fn = vi.fn(executar);
  return { caso: { executar: fn } as unknown as RedefinirAcessoAdministrativo, fn };
};

const NOVA = 'nova-senha-digitada-forte-9';

describe('executarRedefinicao', () => {
  it('avisa do efeito destrutivo antes de perguntar qualquer coisa', async () => {
    const { terminal, saida } = terminalFalso(['l@c.com', NOVA, NOVA, 'REDEFINIR']);
    await executarRedefinicao(casoFalso(() => Promise.resolve()).caso, terminal);
    expect(saida[0]).toBe('Isto apaga o MFA, os códigos de recuperação e encerra todas as sessões.\n');
  });

  it('feliz: digitou REDEFINIR, devolve 0 e chama o caso de uso', async () => {
    const { terminal } = terminalFalso(['l@c.com', NOVA, NOVA, 'REDEFINIR']);
    const { caso, fn } = casoFalso(() => Promise.resolve());
    expect(await executarRedefinicao(caso, terminal)).toBe(0);
    expect(fn).toHaveBeenCalledWith({ email: 'l@c.com', novaSenha: NOVA });
  });

  it.each(['redefinir', 'sim', '', 'REDEFINIR TUDO'])('confirmação %j devolve 1 e não chama o caso de uso', async (digitado) => {
    const { terminal, erros } = terminalFalso(['l@c.com', NOVA, NOVA, digitado]);
    const { caso, fn } = casoFalso(() => Promise.resolve());
    expect(await executarRedefinicao(caso, terminal)).toBe(1);
    expect(fn).not.toHaveBeenCalled();
    expect(erros).toEqual(['Confirmação não digitada. Nada foi alterado.']);
  });

  it('senhas diferentes devolvem 1 sem pedir a confirmação nem chamar o caso de uso', async () => {
    const { terminal, saida } = terminalFalso(['l@c.com', NOVA, 'outra', 'REDEFINIR']);
    const { caso, fn } = casoFalso(() => Promise.resolve());
    expect(await executarRedefinicao(caso, terminal)).toBe(1);
    expect(fn).not.toHaveBeenCalled();
    expect(saida.some((s) => s.includes('REDEFINIR'))).toBe(false);
  });

  it('UsuarioNaoEncontrado e SenhaFraca devolvem 1 com mensagem e motivos', async () => {
    const naoEncontrado = terminalFalso(['x@c.com', NOVA, NOVA, 'REDEFINIR']);
    expect(await executarRedefinicao(casoFalso(() => Promise.reject(new UsuarioNaoEncontrado())).caso, naoEncontrado.terminal)).toBe(1);
    expect(naoEncontrado.erros).toEqual(['Usuário não encontrado.']);

    const fraca = terminalFalso(['x@c.com', 'curta', 'curta', 'REDEFINIR']);
    expect(await executarRedefinicao(casoFalso(() => Promise.reject(new SenhaFraca(['curta']))).caso, fraca.terminal)).toBe(1);
    expect(fraca.erros).toEqual(['A senha não atende à política.', 'Motivos: curta']);
  });

  it('erro inesperado vira mensagem genérica', async () => {
    const t = terminalFalso(['x@c.com', NOVA, NOVA, 'REDEFINIR']);
    expect(await executarRedefinicao(casoFalso(() => Promise.reject(new Error(NOVA))).caso, t.terminal)).toBe(1);
    expect(t.erros).toEqual(['Falha inesperada.']);
  });

  it('nenhuma saída contém a senha digitada', async () => {
    for (const executar of [() => Promise.resolve(), () => Promise.reject(new Error(NOVA)), () => Promise.reject(new SenhaFraca(['curta']))]) {
      const t = terminalFalso(['x@c.com', NOVA, NOVA, 'REDEFINIR']);
      await executarRedefinicao(casoFalso(executar).caso, t.terminal);
      expect(t.tudo()).not.toContain(NOVA);
    }
  });
});
