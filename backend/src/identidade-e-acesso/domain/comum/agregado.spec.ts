import { describe, expect, it } from 'vitest';
import { Agregado } from './agregado.js';
import type { EventoDeDominio } from './evento-de-dominio.js';

class AgregadoDeTeste extends Agregado {
  emitir(evento: EventoDeDominio): void {
    this.registrar(evento);
  }
}

const evento = (tipo: string): EventoDeDominio => ({ tipo, ocorridoEm: new Date(0) });

describe('Agregado', () => {
  it('devolve os eventos na ordem de registro', () => {
    const a = new AgregadoDeTeste();
    a.emitir(evento('A'));
    a.emitir(evento('B'));
    expect(a.puxarEventos().map((e) => e.tipo)).toEqual(['A', 'B']);
  });

  it('esvazia a fila após puxar', () => {
    const a = new AgregadoDeTeste();
    a.emitir(evento('A'));
    a.puxarEventos();
    expect(a.puxarEventos()).toEqual([]);
  });

  it('devolve uma cópia: mutar o resultado não afeta o agregado', () => {
    const a = new AgregadoDeTeste();
    a.emitir(evento('A'));
    const copia = a.puxarEventos() as EventoDeDominio[];
    copia.length = 0;
    a.emitir(evento('B'));
    const segunda = a.puxarEventos() as EventoDeDominio[];
    segunda.push(evento('X'));
    expect(a.puxarEventos()).toEqual([]);
  });
});
