// Mock do IPC do Tauri para testes Playwright (contexto de navegador real,
// não jsdom — por isso não reaproveita `@tauri-apps/api/mocks`, que é para
// Vitest). Reproduz o formato que `@tauri-apps/api/core.js` e `event.js`
// esperam de `window.__TAURI_INTERNALS__` (lido em node_modules dessas duas
// libs; versão instalada: @tauri-apps/api 2.12.3).
import type { Page } from '@playwright/test';

export interface FormaDeErroSerializavel {
  codigo: string;
  mensagem: string;
  segundosRestantes?: number;
  status?: number;
  tentarApos?: string;
}

export type RespostaDeComando = unknown | { erro: FormaDeErroSerializavel };

export type CenarioDeComandos = Record<string, RespostaDeComando>;

declare global {
  interface Window {
    __chamadasDeTeste?: Array<{ cmd: string; args: unknown }>;
    __emitirEventoDeTeste?: (evento: string, payload: unknown) => void;
  }
}

export async function instalarMockTauri(page: Page, cenario: CenarioDeComandos): Promise<void> {
  await page.addInitScript((cenarioInjetado: CenarioDeComandos) => {
    window.__chamadasDeTeste = [];

    const internals = (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> })
      .__TAURI_INTERNALS__ ?? {};
    const eventInternals = (
      window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__?: Record<string, unknown> }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ ?? {};

    const callbacks = new Map<number, (dados: unknown) => void>();
    const escutadoresPorEvento = new Map<string, number[]>();

    function registrarCallback(callback: (dados: unknown) => void): number {
      const id = Math.floor(Math.random() * 2 ** 31);
      callbacks.set(id, callback);
      return id;
    }

    function tratarListen(args: { event: string; handler: number }): number {
      const lista = escutadoresPorEvento.get(args.event) ?? [];
      lista.push(args.handler);
      escutadoresPorEvento.set(args.event, lista);
      return args.handler;
    }

    function tratarUnlisten(args: { event: string; eventId: number }): null {
      const lista = escutadoresPorEvento.get(args.event);
      if (lista) {
        const indice = lista.indexOf(args.eventId);
        if (indice !== -1) {
          lista.splice(indice, 1);
        }
      }
      return null;
    }

    async function invoke(cmd: string, args: unknown): Promise<unknown> {
      window.__chamadasDeTeste?.push({ cmd, args });

      if (cmd === 'plugin:event|listen') {
        return tratarListen(args as { event: string; handler: number });
      }
      if (cmd === 'plugin:event|unlisten') {
        return tratarUnlisten(args as { event: string; eventId: number });
      }
      if (cmd === 'plugin:event|emit') {
        return null;
      }

      const resposta = cenarioInjetado[cmd];
      if (resposta !== undefined && typeof resposta === 'object' && resposta !== null && 'erro' in resposta) {
        throw (resposta as { erro: unknown }).erro;
      }
      return resposta ?? null;
    }

    internals.invoke = invoke;
    internals.transformCallback = (callback: (dados: unknown) => void) => registrarCallback(callback);
    internals.unregisterCallback = (id: number) => callbacks.delete(id);
    internals.runCallback = (id: number, dados: unknown) => callbacks.get(id)?.(dados);
    eventInternals.unregisterListener = () => {};

    (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__ = internals;
    (
      window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: Record<string, unknown> }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ = eventInternals;

    window.__emitirEventoDeTeste = (evento: string, payload: unknown) => {
      const lista = escutadoresPorEvento.get(evento) ?? [];
      for (const id of lista) {
        callbacks.get(id)?.({ event: evento, payload, id });
      }
    };
  }, cenario);
}

export async function emitirEstado(page: Page, estado: unknown): Promise<void> {
  await page.evaluate((estadoInjetado) => {
    window.__emitirEventoDeTeste?.('acesso://estado-alterado', estadoInjetado);
  }, estado);
}

export async function chamadasRegistradas(page: Page): Promise<Array<{ cmd: string; args: unknown }>> {
  return page.evaluate(() => window.__chamadasDeTeste ?? []);
}
