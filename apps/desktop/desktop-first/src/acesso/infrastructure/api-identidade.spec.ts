import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it } from 'vitest';
import {
  confirmarReconfiguracaoMfa,
  iniciarReconfiguracaoMfa,
  listarDispositivos,
  regenerarCodigos,
  revogarDispositivo,
  trocarSenha,
} from './api-identidade';

afterEach(() => {
  clearMocks();
});

const ID_VALIDO = 'f7f6a4b0-1111-4000-8000-000000000001';

describe('listarDispositivos', () => {
  it('chama GET /dispositivos e devolve a lista', async () => {
    mockIPC((cmd, args) => {
      expect(cmd).toBe('api_requisicao_autenticada');
      expect(args).toEqual({ metodo: 'GET', caminho: '/dispositivos', corpo: null });
      return { dispositivos: [{ id: ID_VALIDO }] };
    });

    const dispositivos = await listarDispositivos();

    expect(dispositivos).toEqual([{ id: ID_VALIDO }]);
  });
});

describe('revogarDispositivo', () => {
  it('monta o caminho com o id e envia motivo e código MFA', async () => {
    let caminhoRecebido = '';
    mockIPC((cmd, args) => {
      caminhoRecebido = (args as { caminho: string }).caminho;
      expect(cmd).toBe('api_requisicao_autenticada');
      expect(args).toEqual({
        metodo: 'POST',
        caminho: `/dispositivos/${ID_VALIDO}/revogar`,
        corpo: { motivo: 'Computador perdido', codigoMfa: '123456' },
      });
      return null;
    });

    await revogarDispositivo(ID_VALIDO, 'Computador perdido', '123456');

    expect(caminhoRecebido).toBe(`/dispositivos/${ID_VALIDO}/revogar`);
  });

  it('rejeita id malicioso sem invocar o comando', async () => {
    let invocado = false;
    mockIPC(() => {
      invocado = true;
      return null;
    });

    await expect(revogarDispositivo('../auth/refresh', 'motivo qualquer', '123456')).rejects.toMatchObject({
      codigo: 'INTERNO',
    });
    expect(invocado).toBe(false);
  });
});

describe('trocarSenha', () => {
  it('envia a senha atual e a nova para a rota de troca', async () => {
    mockIPC((cmd, args) => {
      expect(cmd).toBe('api_requisicao_autenticada');
      expect(args).toEqual({
        metodo: 'POST',
        caminho: '/auth/senha/trocar',
        corpo: { senhaAtual: 'atual-123', novaSenha: 'nova-456789' },
      });
      return null;
    });

    await trocarSenha('atual-123', 'nova-456789');
  });
});

describe('regenerarCodigos', () => {
  it('envia o código MFA e devolve os novos códigos de recuperação', async () => {
    mockIPC((cmd, args) => {
      expect(cmd).toBe('api_requisicao_autenticada');
      expect(args).toEqual({ metodo: 'POST', caminho: '/auth/mfa/codigos', corpo: { codigoMfa: '654321' } });
      return { codigosDeRecuperacao: ['AAAA-BBBB-CCCC-DDDD'] };
    });

    const codigos = await regenerarCodigos('654321');

    expect(codigos).toEqual(['AAAA-BBBB-CCCC-DDDD']);
  });
});

describe('iniciarReconfiguracaoMfa', () => {
  it('envia a senha atual e devolve o segredo', async () => {
    mockIPC((cmd, args) => {
      expect(cmd).toBe('api_requisicao_autenticada');
      expect(args).toEqual({
        metodo: 'POST',
        caminho: '/auth/mfa/reconfigurar',
        corpo: { senhaAtual: 'atual-123' },
      });
      return { segredo: 'SEGREDO', urlOtpauth: 'otpauth://totp/x' };
    });

    const segredo = await iniciarReconfiguracaoMfa('atual-123');

    expect(segredo).toEqual({ segredo: 'SEGREDO', urlOtpauth: 'otpauth://totp/x' });
  });
});

describe('confirmarReconfiguracaoMfa', () => {
  it('envia o código e devolve os novos códigos de recuperação', async () => {
    mockIPC((cmd, args) => {
      expect(cmd).toBe('api_requisicao_autenticada');
      expect(args).toEqual({
        metodo: 'POST',
        caminho: '/auth/mfa/reconfigurar/confirmar',
        corpo: { codigo: '111111' },
      });
      return { codigosDeRecuperacao: ['EEEE-FFFF-GGGG-HHHH'] };
    });

    const codigos = await confirmarReconfiguracaoMfa('111111');

    expect(codigos).toEqual(['EEEE-FFFF-GGGG-HHHH']);
  });
});
