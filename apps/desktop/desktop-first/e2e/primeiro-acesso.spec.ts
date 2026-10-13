import { expect, test } from '@playwright/test';
import { estadoNormal, estadoSemConfiguracao } from './fixtures/estados';
import { CODIGOS_DE_TESTE, SEGREDO_DE_TESTE, USUARIO_LUCAS, observarConsole } from './fixtures/ajudantes';
import { chamadasRegistradas, emitirEstado, instalarMockTauri } from './fixtures/tauri-mock';

test.use({ viewport: { width: 1280, height: 800 } });

test('primeiro acesso: login → MFA → códigos → senha mestre → início', async ({ page }) => {
  const consoles = observarConsole(page);
  await instalarMockTauri(page, {
    estado_do_acesso: estadoSemConfiguracao(),
    api_iniciar_login: { desafio: 'desafio-e2e', mfa: 'configurar', expiraEm: '2026-10-13T12:05:00.000Z' },
    api_gerar_segredo_mfa: SEGREDO_DE_TESTE,
    api_confirmar_mfa: { codigosDeRecuperacao: CODIGOS_DE_TESTE },
    api_concluir_login: {
      usuario: USUARIO_LUCAS,
      usouCodigoDeRecuperacao: false,
      codigosRestantes: 10,
      proximoPasso: 'configurar_desbloqueio',
    },
    configurar_desbloqueio: estadoNormal({ usuario: USUARIO_LUCAS }),
  });

  await page.goto('/');

  // 1) login
  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  await page.getByLabel(/^E-mail/).fill('lucas@clinica.com');
  await page.getByLabel(/^Senha de Acesso/).fill('senha-de-login-forte-1');
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click();

  // 2) configurar o autenticador: QR local (data URL) e confirmação do código
  await expect(page.getByRole('heading', { name: 'Configure o aplicativo autenticador' })).toBeVisible();
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible();
  await page.getByLabel('Código do aplicativo').fill('123456');
  await page.getByRole('button', { name: 'Confirmar' }).click();

  // 3) códigos de recuperação: 10 códigos e confirmação de que foram guardados
  await expect(page.getByRole('heading', { name: 'Guarde seus códigos de recuperação' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Códigos de recuperação' }).getByRole('listitem')).toHaveCount(10);
  const continuar = page.getByRole('button', { name: 'Continuar' });
  await expect(continuar).toBeDisabled();
  await page.getByLabel('Guardei os códigos em local seguro').check();
  await continuar.click();

  // 4) verificar o código; o Rust informa a sessão online antes de a tela decidir a rota
  await expect(page.getByRole('heading', { name: 'Digite o código do autenticador' })).toBeVisible();
  await expect(page.getByText(/Digite o código atual do aplicativo/)).toBeVisible();
  await emitirEstado(page, { ...estadoSemConfiguracao(), sessaoOnline: true });
  await page.getByLabel('Código do autenticador').fill('654321');

  // 5) senha mestre
  await expect(page.getByRole('heading', { name: 'Crie sua senha mestre' })).toBeVisible();
  const proteger = page.getByRole('button', { name: 'Proteger dados' });
  await expect(proteger).toBeDisabled();
  await page.getByLabel(/^Senha mestre/).fill('senha-mestre-bem-forte');
  await page.getByLabel(/^Confirme a senha mestre/).fill('senha-mestre-bem-forte');
  await expect(proteger).toBeEnabled();
  await proteger.click();

  // 6) início
  await expect(page.getByRole('heading', { level: 1, name: 'Olá, Lucas' })).toBeVisible();

  // Nenhum token trafega pelo JavaScript (D-005)
  const chamadas = await chamadasRegistradas(page);
  const comandos = chamadas.map((c) => c.cmd);
  expect(comandos).toEqual(
    expect.arrayContaining(['api_iniciar_login', 'api_gerar_segredo_mfa', 'api_confirmar_mfa', 'api_concluir_login', 'configurar_desbloqueio']),
  );
  const argumentos = JSON.stringify(chamadas.map((c) => c.args));
  expect(argumentos).not.toMatch(/refreshToken|accessToken|refresh_token|access_token/);
  expect(argumentos).toContain('desafio-e2e');

  consoles.afirmarLimpo();
});

test('primeiro acesso: o desafio e os códigos não ficam no armazenamento do navegador', async ({ page }) => {
  await instalarMockTauri(page, {
    estado_do_acesso: estadoSemConfiguracao(),
    api_iniciar_login: { desafio: 'desafio-secreto-e2e', mfa: 'configurar', expiraEm: '2026-10-13T12:05:00.000Z' },
    api_gerar_segredo_mfa: SEGREDO_DE_TESTE,
    api_confirmar_mfa: { codigosDeRecuperacao: CODIGOS_DE_TESTE },
  });
  await page.goto('/');
  await page.getByLabel(/^E-mail/).fill('lucas@clinica.com');
  await page.getByLabel(/^Senha de Acesso/).fill('senha-de-login-forte-1');
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click();
  await page.getByLabel('Código do aplicativo').fill('123456');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('list', { name: 'Códigos de recuperação' })).toBeVisible();

  const armazenado = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(armazenado).not.toContain('desafio-secreto-e2e');
  expect(armazenado).not.toContain('ABCD-EFGH');
  expect(armazenado).not.toContain('GEZD');
});
