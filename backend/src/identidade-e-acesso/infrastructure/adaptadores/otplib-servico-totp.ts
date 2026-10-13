import { authenticator } from 'otplib';
import type { Relogio, ResultadoTotp, ServicoTotp } from '../../application/portas/index.js';

export const EMISSOR_TOTP = 'EVO Clínica';

const PASSO_SEGUNDOS = 30;
const REGEX_CODIGO = /^\d{6}$/;
const INVALIDO: ResultadoTotp = { valido: false, passo: -1 };

export class OtplibServicoTotp implements ServicoTotp {
  constructor(private readonly relogio: Relogio) {}

  /** 160 bits em base32 (32 caracteres). */
  novoSegredo(): string {
    return authenticator.generateSecret(20);
  }

  urlDoAutenticador(segredo: string, email: string): string {
    return authenticator.keyuri(email, EMISSOR_TOTP, segredo);
  }

  /** Janela ±1 passo (RFC 6238); passo igual ou anterior ao último aceito é recusado (RN-10). */
  verificar(segredo: string, codigo: string, ultimoPasso: number | null): ResultadoTotp {
    if (!REGEX_CODIGO.test(codigo)) return INVALIDO;
    const agoraMs = this.relogio.agora().getTime();
    let delta: number | null;
    try {
      delta = authenticator
        .clone({ step: PASSO_SEGUNDOS, digits: 6, window: 1, epoch: agoraMs })
        .checkDelta(codigo, segredo);
    } catch {
      return INVALIDO;
    }
    if (delta === null) return INVALIDO;
    const passo = Math.floor(agoraMs / (PASSO_SEGUNDOS * 1000)) + delta;
    if (ultimoPasso !== null && passo <= ultimoPasso) return { valido: false, passo };
    return { valido: true, passo };
  }
}
