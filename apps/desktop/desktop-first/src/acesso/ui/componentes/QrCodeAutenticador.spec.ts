import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { limparToasts } from '../composables/useToast';
import NotificacaoToast from './NotificacaoToast.vue';
import QrCodeAutenticador from './QrCodeAutenticador.vue';

const URL = 'otpauth://totp/EVO%20Cl%C3%ADnica:lucas%40clinica.com?secret=GEZDGNBVGY3TQOJQ&issuer=EVO';
const SEGREDO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const escrever = vi.fn().mockResolvedValue(undefined);

describe('QrCodeAutenticador', () => {
  beforeEach(() => {
    limparToasts();
    escrever.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
  });

  it('gera o QR localmente como data URL PNG, com texto alternativo e tamanho fixo', async () => {
    render(QrCodeAutenticador, { props: { urlOtpauth: URL, segredo: SEGREDO } });
    const imagem = await screen.findByRole('img', { name: 'QR code para adicionar a conta ao aplicativo autenticador' });
    expect(imagem.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(imagem).toHaveAttribute('width', '192');
    expect(imagem).toHaveAttribute('height', '192');
  });

  it('nunca aponta para um recurso remoto', async () => {
    const { container } = render(QrCodeAutenticador, { props: { urlOtpauth: URL, segredo: SEGREDO } });
    await screen.findByRole('img');
    for (const el of container.querySelectorAll('[src],[href]')) {
      expect(el.getAttribute('src') ?? el.getAttribute('href')).not.toMatch(/^https?:/);
    }
  });

  it('mostra a chave em grupos de 4 caracteres, em fonte monoespaçada', () => {
    render(QrCodeAutenticador, { props: { urlOtpauth: URL, segredo: SEGREDO } });
    const chave = screen.getByText('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ');
    expect(chave.className).toContain('font-mono');
    expect(screen.getByText('Não consegue escanear? Digite esta chave:')).toBeInTheDocument();
  });

  it('copiar a chave grava o segredo sem espaços na área de transferência e avisa', async () => {
    render({
      components: { QrCodeAutenticador, NotificacaoToast },
      template: `<div><QrCodeAutenticador url-otpauth="${URL}" segredo="${SEGREDO}" /><NotificacaoToast /></div>`,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar chave' }));
    expect(escrever).toHaveBeenCalledWith(SEGREDO);
    expect(await screen.findByText('Chave copiada')).toBeInTheDocument();
  });

  it('se copiar falhar, avisa sem lançar erro', async () => {
    escrever.mockRejectedValueOnce(new Error('negado'));
    render({
      components: { QrCodeAutenticador, NotificacaoToast },
      template: `<div><QrCodeAutenticador url-otpauth="${URL}" segredo="${SEGREDO}" /><NotificacaoToast /></div>`,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar chave' }));
    expect(await screen.findByText(/Não foi possível copiar/)).toBeInTheDocument();
  });

  it('enquanto gera, mostra um esqueleto acessível', async () => {
    render(QrCodeAutenticador, { props: { urlOtpauth: URL, segredo: SEGREDO } });
    expect(screen.getByRole('status')).toHaveTextContent('Gerando QR code');
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});
