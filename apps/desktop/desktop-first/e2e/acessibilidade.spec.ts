import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { estadoBloqueado, estadoNormal, estadoRevogado, estadoSemConfiguracao } from './fixtures/estados';
import { DISPOSITIVOS_DE_TESTE, USUARIO_LUCAS, observarConsole } from './fixtures/ajudantes';
import { chamadasRegistradas, instalarMockTauri, type CenarioDeComandos } from './fixtures/tauri-mock';

// Capturas e axe são gerados uma vez (Chromium); o comportamento é coberto nos outros arquivos E2E.
test.skip(({ browserName }) => browserName !== 'chromium', 'auditoria visual só no Chromium');

const LARGURAS = [
  { largura: 1024, altura: 700 },
  { largura: 1280, altura: 800 },
  { largura: 1440, altura: 900 },
] as const;

interface Tela {
  nome: string;
  cenario: CenarioDeComandos;
  /** Leva o navegador até a tela (rota direta ou, quando depende do fluxo em memória, preenchendo o login). */
  ir: (page: Page) => Promise<void>;
  esperar: string;
}

const sessaoOnline = { ...estadoSemConfiguracao(), sessaoOnline: true };

const TELAS: Tela[] = [
  {
    nome: 'login',
    cenario: { estado_do_acesso: estadoSemConfiguracao() },
    ir: async (page) => {
      await page.goto('/#/entrar');
    },
    esperar: 'Acesse sua conta',
  },
  {
    nome: 'mfa-verificar',
    cenario: {
      estado_do_acesso: estadoSemConfiguracao(),
      api_iniciar_login: { desafio: 'desafio-axe', mfa: 'verificar', expiraEm: '2026-10-13T12:05:00.000Z' },
    },
    ir: async (page) => {
      await page.goto('/#/entrar');
      await page.getByLabel(/^E-mail/).fill('lucas@clinica.com');
      await page.getByLabel(/^Senha de Acesso/).fill('senha-de-login-forte-1');
      await page.getByRole('button', { name: 'Entrar no Sistema' }).click();
    },
    esperar: 'Digite o código do autenticador',
  },
  {
    nome: 'definir-senha-mestre',
    cenario: { estado_do_acesso: sessaoOnline },
    ir: async (page) => {
      await page.goto('/#/senha-mestre/definir');
    },
    esperar: 'Crie sua senha mestre',
  },
  {
    nome: 'desbloqueio',
    cenario: { estado_do_acesso: estadoBloqueado({ usuario: USUARIO_LUCAS }) },
    ir: async (page) => {
      await page.goto('/#/desbloquear');
    },
    esperar: 'Desbloqueie para continuar',
  },
  {
    nome: 'inicio',
    cenario: { estado_do_acesso: estadoNormal({ usuario: USUARIO_LUCAS }), api_renovar_sessao: estadoNormal({ usuario: USUARIO_LUCAS }), sinal_de_atividade: null },
    ir: async (page) => {
      await page.goto('/#/');
    },
    esperar: 'Olá, Lucas',
  },
  {
    nome: 'dispositivos',
    cenario: {
      estado_do_acesso: estadoNormal({ usuario: USUARIO_LUCAS }),
      api_renovar_sessao: estadoNormal({ usuario: USUARIO_LUCAS }),
      api_requisicao_autenticada: DISPOSITIVOS_DE_TESTE,
      sinal_de_atividade: null,
    },
    ir: async (page) => {
      await page.goto('/#/dispositivos');
    },
    esperar: 'Dispositivos',
  },
  {
    nome: 'seguranca',
    cenario: {
      estado_do_acesso: estadoNormal({ usuario: USUARIO_LUCAS, biometriaDisponivel: true }),
      api_renovar_sessao: estadoNormal({ usuario: USUARIO_LUCAS, biometriaDisponivel: true }),
      sinal_de_atividade: null,
    },
    ir: async (page) => {
      await page.goto('/#/seguranca');
    },
    esperar: 'Segurança',
  },
  {
    nome: 'dispositivo-revogado',
    cenario: { estado_do_acesso: estadoRevogado() },
    ir: async (page) => {
      await page.goto('/#/dispositivo-revogado');
    },
    esperar: 'Este computador foi desconectado',
  },
];

for (const tela of TELAS) {
  for (const { largura, altura } of LARGURAS) {
    test(`${tela.nome} @ ${String(largura)}x${String(altura)}: sem violações graves de acessibilidade e sem rolagem horizontal`, async ({ page }) => {
      const consoles = observarConsole(page);
      await page.setViewportSize({ width: largura, height: altura });
      await instalarMockTauri(page, tela.cenario);
      await tela.ir(page);
      await expect(page.getByRole('heading', { name: tela.esperar, exact: false }).first()).toBeVisible();
      if (tela.nome === 'dispositivos') await expect(page.getByText('Notebook Windows')).toBeVisible();

      const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        graves.map((v) => `${v.id} (${v.impact ?? '?'}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
        'violações serious/critical do axe',
      ).toEqual([]);

      const transbordou = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(transbordou, 'não deve haver rolagem horizontal').toBe(false);

      await page.screenshot({ path: `test-results/telas/${tela.nome}-${String(largura)}.png`, fullPage: true });
      consoles.afirmarLimpo();
    });
  }
}

test('login: navegação só por teclado até "Entrar no Sistema" e Enter envia', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await instalarMockTauri(page, {
    estado_do_acesso: estadoSemConfiguracao(),
    api_iniciar_login: { desafio: 'desafio-teclado', mfa: 'verificar', expiraEm: '2026-10-13T12:05:00.000Z' },
  });
  await page.goto('/#/entrar');
  await page.getByLabel(/^E-mail/).focus();
  await page.keyboard.type('lucas@clinica.com');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Esqueceu a senha?' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(/^Senha de Acesso/)).toBeFocused();
  await page.keyboard.type('senha-de-login-forte-1');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Mostrar senha' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Entrar no Sistema' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Digite o código do autenticador' })).toBeVisible();
  const chamadas = await chamadasRegistradas(page);
  expect(chamadas.find((c) => c.cmd === 'api_iniciar_login')?.args).toEqual({ email: 'lucas@clinica.com', senha: 'senha-de-login-forte-1' });
});
