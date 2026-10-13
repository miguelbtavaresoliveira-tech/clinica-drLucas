import { expect, test } from '@playwright/test';
import { estadoRevogado, estadoSomenteLeitura } from './fixtures/estados';
import { observarConsole } from './fixtures/ajudantes';
import { emitirEstado, instalarMockTauri } from './fixtures/tauri-mock';

test.use({ viewport: { width: 1280, height: 800 } });

test('somente leitura mostra o aviso; revogação e offline expirado trocam a tela sozinhos', async ({ page }) => {
  const consoles = observarConsole(page);
  await instalarMockTauri(page, {
    estado_do_acesso: estadoSomenteLeitura(),
    api_renovar_sessao: { erro: { codigo: 'SEM_CONEXAO', mensagem: 'x' } },
    sinal_de_atividade: null,
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /^Olá/ })).toBeVisible();
  await expect(page.getByText(/Modo somente leitura/)).toBeVisible();
  await expect(page.getByText('Sem conexão. Trabalhando no modo local.')).toBeVisible();

  // o servidor revogou este computador: a próxima conexão leva à tela de revogação
  await emitirEstado(page, estadoRevogado());
  await expect(page.getByRole('heading', { name: 'Este computador foi desconectado' })).toBeVisible();

  // limite offline estourado: tela de conexão
  await emitirEstado(page, { ...estadoSomenteLeitura(), situacao: 'offline_expirado' });
  await expect(page.getByRole('heading', { name: 'Conecte-se para continuar' })).toBeVisible();

  consoles.afirmarLimpo();
});

test('revogado só enxerga a tela de revogação, mesmo digitando outra rota', async ({ page }) => {
  await instalarMockTauri(page, { estado_do_acesso: estadoRevogado() });
  await page.goto('/#/seguranca');
  await expect(page.getByRole('heading', { name: 'Este computador foi desconectado' })).toBeVisible();
  await page.goto('/#/entrar');
  await expect(page.getByRole('heading', { name: 'Este computador foi desconectado' })).toBeVisible();
});

test('redefinir o computador revogado exige digitar DESCARTAR e volta para o login', async ({ page }) => {
  await instalarMockTauri(page, {
    estado_do_acesso: estadoRevogado(),
    redefinir_computador_revogado: {
      situacao: 'sem_configuracao',
      exigeLoginCompleto: true,
      biometriaDisponivel: false,
      biometriaHabilitada: false,
      segundosAteNovaTentativa: 0,
      sessaoOnline: false,
      usuario: null,
      eventosPendentes: 0,
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Redefinir este computador' }).click();
  const apagar = page.getByRole('button', { name: 'Apagar dados e redefinir' });
  await expect(apagar).toBeDisabled();
  await page.getByLabel('Digite DESCARTAR para confirmar').fill('descartar');
  await expect(apagar).toBeDisabled();
  await page.getByLabel('Digite DESCARTAR para confirmar').fill('DESCARTAR');
  await expect(apagar).toBeEnabled();
  await apagar.click();
  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
});
