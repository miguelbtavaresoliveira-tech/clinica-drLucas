import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export interface Terminal {
  perguntar(texto: string): Promise<string>;
  /** Não ecoa o que é digitado. */
  perguntarSenha(texto: string): Promise<string>;
  escrever(texto: string): void;
  erro(texto: string): void;
}

export interface TerminalDoProcesso extends Terminal {
  fechar(): void;
}

/**
 * Terminal interativo sobre stdin/stdout. A senha nunca passa por argv nem por variável de ambiente.
 * As linhas são lidas por um iterador (e não por `question`) para funcionar também com entrada redirecionada,
 * em que várias linhas chegam de uma vez. Entrada encerrada devolve texto vazio.
 */
export function criarTerminalDoProcesso(): TerminalDoProcesso {
  let silenciado = false;
  const saida = new Writable({
    write(trecho: Buffer | string, codificacao: BufferEncoding, concluir: (erro?: Error | null) => void): void {
      if (!silenciado) process.stdout.write(trecho, codificacao);
      concluir();
    },
  });
  const leitor = createInterface({ input: process.stdin, output: saida, terminal: process.stdin.isTTY });
  const linhas = leitor[Symbol.asyncIterator]();

  const lerLinha = async (): Promise<string> => {
    const proxima = await linhas.next();
    return proxima.done === true ? '' : proxima.value;
  };

  return {
    perguntar: (texto) => {
      process.stdout.write(texto);
      return lerLinha();
    },
    async perguntarSenha(texto) {
      process.stdout.write(texto);
      silenciado = true;
      try {
        return await lerLinha();
      } finally {
        silenciado = false;
        process.stdout.write('\n');
      }
    },
    escrever: (texto) => {
      process.stdout.write(texto);
    },
    erro: (texto) => {
      process.stderr.write(`${texto}\n`);
    },
    fechar: () => {
      leitor.close();
    },
  };
}
