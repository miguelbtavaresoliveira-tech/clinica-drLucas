// Ajudantes comuns dos testes E2E.
import { expect, type Page } from '@playwright/test';

/** Registra erros e avisos do console do navegador; o teste falha se houver algum. */
export function observarConsole(page: Page): { avisos: string[]; afirmarLimpo: () => void } {
  const avisos: string[] = [];
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error' || mensagem.type() === 'warning') avisos.push(`${mensagem.type()}: ${mensagem.text()}`);
  });
  page.on('pageerror', (erro) => {
    avisos.push(`pageerror: ${erro.message}`);
  });
  return {
    avisos,
    afirmarLimpo: () => {
      expect(avisos, 'o console do navegador não deve ter erros nem avisos').toEqual([]);
    },
  };
}

export const SEGREDO_DE_TESTE = {
  segredo: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  urlOtpauth: 'otpauth://totp/EVO:lucas?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=EVO',
};

export const CODIGOS_DE_TESTE = Array.from({ length: 10 }, (_, i) => `ABCD-EFGH-JKMN-${String(1000 + i)}`);

export const USUARIO_LUCAS = { id: 'f7f6a4b0-0000-4000-8000-000000000001', nome: 'Lucas Damasceno', email: 'lucas@clinica.com' };

export const DISPOSITIVOS_DE_TESTE = {
  dispositivos: [
    {
      id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
      apelido: 'MacBook da clínica',
      plataforma: 'macos',
      registradoEm: '2026-10-01T12:00:00.000Z',
      ultimoCheckIn: '2026-10-13T12:30:00.000Z',
      situacao: 'ativo',
      revogadoEm: null,
      atual: true,
    },
    {
      id: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      apelido: 'Notebook Windows',
      plataforma: 'windows',
      registradoEm: '2026-10-05T12:00:00.000Z',
      ultimoCheckIn: '2026-10-12T09:00:00.000Z',
      situacao: 'ativo',
      revogadoEm: null,
      atual: false,
    },
  ],
};
