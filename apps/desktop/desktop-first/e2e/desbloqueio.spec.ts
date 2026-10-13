import { expect, test } from '@playwright/test';
import { estadoBloqueado, estadoNormal } from './fixtures/estados';
import { USUARIO_LUCAS, observarConsole } from './fixtures/ajudantes';
import { emitirEstado, instalarMockTauri } from './fixtures/tauri-mock';

test.use({ viewport: { width: 1280, height: 800 } });

test('desbloqueio: senha errada, espera, senha certa e bloqueio por inatividade', async ({ page }) => {
  const consoles = observarConsole(page);
  await instalarMockTauri(page, {
    estado_do_acesso: estadoBloqueado({ usuario: USUARIO_LUCAS }),
    desbloquear_com_senha: {
      sequencia: [
        { erro: { codigo: 'SENHA_MESTRE_INCORRETA', mensagem: 'x' } },
        { erro: { codigo: 'AGUARDE_ANTES_DE_TENTAR', mensagem: 'x', segundosRestantes: 3 } },
        estadoNormal({ usuario: USUARIO_LUCAS }),
      ],
    },
    api_renovar_sessao: estadoNormal({ usuario: USUARIO_LUCAS }),
    sinal_de_atividade: null,
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Desbloqueie para continuar' })).toBeVisible();
  const campo = page.getByLabel(/^Senha mestre/);
  await expect(campo).toBeFocused();

  // senha errada
  await campo.fill('senha-errada-1');
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(page.getByText(/Senha mestre incorreta/)).toBeVisible();
  await expect(campo).toHaveValue('');

  // o Rust impõe um atraso: o botão fica desabilitado com a contagem
  await campo.fill('senha-errada-2');
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  const aguardar = page.getByRole('button', { name: /Tente novamente em \d s/ });
  await expect(aguardar).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Desbloquear', exact: true })).toBeEnabled({ timeout: 8000 });

  // senha certa
  await campo.fill('senha-mestre-bem-forte');
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Olá, Lucas' })).toBeVisible();

  // bloqueio por inatividade: o Rust emite o estado e o app volta para o desbloqueio sozinho
  await emitirEstado(page, estadoBloqueado({ usuario: USUARIO_LUCAS }));
  await expect(page.getByRole('heading', { name: 'Desbloqueie para continuar' })).toBeVisible();

  consoles.afirmarLimpo();
});

test('desbloqueio que exige login completo esconde o formulário', async ({ page }) => {
  await instalarMockTauri(page, { estado_do_acesso: estadoBloqueado({ exigeLoginCompleto: true }) });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  await expect(page.getByText('Por segurança, entre com e-mail, senha e código')).toBeVisible();
});
