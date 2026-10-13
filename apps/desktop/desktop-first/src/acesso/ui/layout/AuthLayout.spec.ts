import { render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import AuthLayout from './AuthLayout.vue';

describe('AuthLayout', () => {
  it('renderiza o conteúdo do slot na área principal', () => {
    render(AuthLayout, { slots: { default: '<h2>Acesse sua conta</h2>' } });
    expect(screen.getByRole('heading', { level: 2, name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 2 }));
  });

  it('tem header, main e footer semânticos e um único h1 institucional', () => {
    render(AuthLayout);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent('Gestão clínica inteligente para o tratamento da dor crônica e coluna.');
  });

  it('mostra a versão no cabeçalho e no rodapé', () => {
    render(AuthLayout);
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.getByText(`EVO v${__APP_VERSION__}`)).toBeInTheDocument();
  });

  it.each(['Status Operacional', 'WhatsApp', 'HIPAA', 'Visualizar Estado', 'Tablet', 'Política de Privacidade', 'TLS 1.3'])(
    'não contém o texto removido "%s"',
    (texto) => {
      const { container } = render(AuthLayout);
      expect(container.textContent ?? '').not.toContain(texto);
    },
  );

  it('mostra os textos substitutos do Figma', () => {
    render(AuthLayout);
    expect(screen.getByText('Conexão cifrada • LGPD')).toBeInTheDocument();
    expect(screen.getByText('Acesso protegido')).toBeInTheDocument();
    expect(screen.getByText('Acesso restrito a usuários autorizados')).toBeInTheDocument();
    expect(screen.getByText('Dr. Lucas Damasceno', { selector: 'div' })).toBeInTheDocument();
  });

  it('não carrega nenhum recurso remoto (sem <img> nem links externos)', () => {
    const { container } = render(AuthLayout);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('a[href]')).toHaveLength(0);
    // o xmlns dos SVGs é só um namespace; recursos remotos seriam atributos src/href/url()
    expect(container.querySelectorAll('[src],[href]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/url\(\s*['"]?https?:/);
  });

  it('não usa text-slate-400 sobre fundo branco (contraste AA)', () => {
    const { container } = render(AuthLayout);
    const direita = container.querySelector('footer');
    expect(direita?.innerHTML).not.toContain('text-slate-400');
  });

  it('o layout só é dividido em duas colunas em telas largas', () => {
    const { container } = render(AuthLayout);
    const cartao = container.querySelector('main > div');
    expect(cartao?.className).toContain('lg:flex-row');
    expect(cartao?.className).toContain('max-w-6xl');
  });
});
