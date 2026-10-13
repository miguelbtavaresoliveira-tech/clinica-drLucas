import type { CofreDeSegredos } from '../../../src/identidade-e-acesso/application/portas/index.js';

export class CofreFalso implements CofreDeSegredos {
  cifrar(texto: string): Promise<Uint8Array> {
    const dados = new TextEncoder().encode(texto);
    const saida = new Uint8Array(1 + 12 + dados.length + 16);
    saida[0] = 0x01;
    saida.set(dados, 13);
    return Promise.resolve(saida);
  }

  decifrar(dados: Uint8Array): Promise<string> {
    return Promise.resolve(new TextDecoder().decode(dados.slice(13, dados.length - 16)));
  }
}
