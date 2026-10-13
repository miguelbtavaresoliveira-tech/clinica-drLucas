import { describe, expect, it, vi } from 'vitest';
import type { CriarPrimeiroProprietario } from '../../application/index.js';
import { EmailInvalido, ProprietarioJaExiste, SenhaFraca } from '../../domain/index.js';
import { executarCriacao } from './executar-criacao.js';
import type { Terminal } from './terminal.js';

function terminalFalso(respostas: string[]) {
  const fila = [...respostas];
  const saida: string[] = [];
  const erros: string[] = [];
  const terminal: Terminal = {
    perguntar: (texto) => {
      saida.push(texto);
      return Promise.resolve(fila.shift() ?? '');
    },
    perguntarSenha: (texto) => {
      saida.push(texto);
      return Promise.resolve(fila.shift() ?? '');
    },
    escrever: (texto) => {
      saida.push(texto);
    },
    erro: (texto) => {
      erros.push(texto);
    },
  };
  return { terminal, saida, erros, tudo: () => [...saida, ...erros].join('\n') };
}

function casoFalso(executar: () => Promise<{ usuarioId: string }>) {
  const fn = vi.fn(executar);
  return { caso: { executar: fn } as unknown as CriarPrimeiroProprietario, fn };
}

const SENHA = 'senha-digitada-muito-forte-1';

describe('executarCriacao', () => {
  it('criação feliz: devolve 0 e imprime o id', async () => {
    const { terminal, saida } = terminalFalso(['Lucas', 'lucas@clinica.com', SENHA, SENHA]);
    const { caso, fn } = casoFalso(() => Promise.resolve({ usuarioId: 'id-123' }));
    expect(await executarCriacao(caso, terminal)).toBe(0);
    expect(fn).toHaveBeenCalledWith({ nome: 'Lucas', email: 'lucas@clinica.com', senha: SENHA });
    expect(saida).toContain('Proprietário criado: id-123\n');
  });

  it('senhas diferentes: devolve 1 e não chama o caso de uso', async () => {
    const { terminal, erros } = terminalFalso(['Lucas', 'lucas@clinica.com', SENHA, 'outra-senha']);
    const { caso, fn } = casoFalso(() => Promise.resolve({ usuarioId: 'x' }));
    expect(await executarCriacao(caso, terminal)).toBe(1);
    expect(erros).toEqual(['As senhas não conferem.']);
    expect(fn).not.toHaveBeenCalled();
  });

  it('ProprietarioJaExiste: devolve 1 com a mensagem', async () => {
    const { terminal, erros } = terminalFalso(['Lucas', 'l@c.com', SENHA, SENHA]);
    const { caso } = casoFalso(() => Promise.reject(new ProprietarioJaExiste()));
    expect(await executarCriacao(caso, terminal)).toBe(1);
    expect(erros).toEqual(['Já existe um proprietário ativo.']);
  });

  it('SenhaFraca: devolve 1 com os motivos', async () => {
    const { terminal, erros } = terminalFalso(['Lucas', 'l@c.com', 'curta', 'curta']);
    const { caso } = casoFalso(() => Promise.reject(new SenhaFraca(['curta', 'comum'])));
    expect(await executarCriacao(caso, terminal)).toBe(1);
    expect(erros).toEqual(['A senha não atende à política.', 'Motivos: curta, comum']);
  });

  it('outro erro de domínio mostra só a mensagem', async () => {
    const { terminal, erros } = terminalFalso(['Lucas', 'invalido', SENHA, SENHA]);
    const { caso } = casoFalso(() => Promise.reject(new EmailInvalido()));
    expect(await executarCriacao(caso, terminal)).toBe(1);
    expect(erros).toEqual(['E-mail inválido.']);
  });

  it('erro inesperado: mensagem genérica, sem vazar detalhes', async () => {
    const { terminal, erros } = terminalFalso(['Lucas', 'l@c.com', SENHA, SENHA]);
    const { caso } = casoFalso(() => Promise.reject(new Error(`falha com ${SENHA} e senha=abc`)));
    expect(await executarCriacao(caso, terminal)).toBe(1);
    expect(erros).toEqual(['Falha inesperada.']);
  });

  it('nenhuma saída contém a senha digitada', async () => {
    const casos = [
      casoFalso(() => Promise.resolve({ usuarioId: 'id' })),
      casoFalso(() => Promise.reject(new ProprietarioJaExiste())),
      casoFalso(() => Promise.reject(new Error(SENHA))),
    ];
    for (const { caso } of casos) {
      const t = terminalFalso(['Lucas', 'l@c.com', SENHA, SENHA]);
      await executarCriacao(caso, t.terminal);
      expect(t.tudo()).not.toContain(SENHA);
    }
    const divergente = terminalFalso(['Lucas', 'l@c.com', SENHA, `${SENHA}x`]);
    await executarCriacao(casoFalso(() => Promise.resolve({ usuarioId: 'i' })).caso, divergente.terminal);
    expect(divergente.tudo()).not.toContain(SENHA);
  });
});
