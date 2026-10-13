import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Email } from '../../domain/index.js';
import type { ConfiguracaoSmtp } from '../config/configuracao.js';
import { EnviadorDeEmailDesabilitado } from './enviador-de-email-desabilitado.js';
import { SmtpEnviadorDeEmail } from './smtp-enviador-de-email.js';

const CONFIG: ConfiguracaoSmtp = {
  host: 'smtp.exemplo.com',
  porta: 587,
  seguro: false,
  usuario: 'usuario',
  senha: 'senha-do-smtp',
  remetente: 'nao-responda@exemplo.com',
};
const DADOS = {
  link: 'https://app.exemplo.com/redefinir?token=TOKEN-SECRETO-123',
  token: 'TOKEN-SECRETO-123',
  expiraEm: new Date('2026-10-13T12:30:00.000Z'),
};
const PARA = Email.criar('paciente.sigiloso@exemplo.com');

const textoEnviado = (sendMail: ReturnType<typeof vi.fn>): { text: string } => {
  const [mensagem] = sendMail.mock.calls[0] as [{ text: string }];
  return mensagem;
};

describe('SmtpEnviadorDeEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('envia com remetente, destinatário e assunto exatos, só em texto', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await new SmtpEnviadorDeEmail(CONFIG, { sendMail }).enviarRedefinicaoDeSenha(PARA, DADOS);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mensagem = sendMail.mock.calls[0]?.[0] as Record<string, string>;
    expect(mensagem.from).toBe('nao-responda@exemplo.com');
    expect(mensagem.to).toBe('paciente.sigiloso@exemplo.com');
    expect(mensagem.subject).toBe('Redefinição de senha — EVO Clínica');
    expect(mensagem).not.toHaveProperty('html');
  });

  it('o texto contém token, link e a data em America/Sao_Paulo', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await new SmtpEnviadorDeEmail(CONFIG, { sendMail }).enviarRedefinicaoDeSenha(PARA, DADOS);
    const { text } = textoEnviado(sendMail);
    expect(text).toContain('TOKEN-SECRETO-123');
    expect(text).toContain(`Ou abra: ${DADOS.link}`);
    expect(text).toContain('O código vale até 13/10/2026 09:30 e só pode ser usado uma vez.');
    expect(text).toContain('código do seu aplicativo autenticador');
    expect(text).toContain('Sua senha continua a mesma.');
  });

  it('meia-noite local aparece como 00:00 (e não 24:00)', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await new SmtpEnviadorDeEmail(CONFIG, { sendMail }).enviarRedefinicaoDeSenha(PARA, {
      ...DADOS,
      expiraEm: new Date('2026-10-13T03:00:00.000Z'),
    });
    expect(textoEnviado(sendMail).text).toContain('13/10/2026 00:00');
  });

  it('falha do transporte lança mensagem fixa e não vaza token nem e-mail no erro nem no log', async () => {
    const erroDoLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sendMail = vi.fn().mockRejectedValue(new Error('550 rejeitado para paciente.sigiloso@exemplo.com TOKEN-SECRETO-123'));
    const erro = await new SmtpEnviadorDeEmail(CONFIG, { sendMail })
      .enviarRedefinicaoDeSenha(PARA, DADOS)
      .catch((e: Error) => e);
    expect((erro as Error).message).toBe('Falha ao enviar e-mail.');
    const visivel = JSON.stringify([(erro as Error).message, erroDoLog.mock.calls]);
    expect(visivel).not.toContain('TOKEN-SECRETO-123');
    expect(visivel).not.toContain('paciente.sigiloso');
    expect(erroDoLog).toHaveBeenCalledWith('Falha ao enviar e-mail de redefinição.');
  });

  it('o transporte padrão exige TLS quando a conexão não é segura (sem enviar nada)', () => {
    expect(() => new SmtpEnviadorDeEmail(CONFIG)).not.toThrow();
  });
});

describe('EnviadorDeEmailDesabilitado', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolve e registra só a mensagem fixa, sem destinatário nem token', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(new EnviadorDeEmailDesabilitado().enviarRedefinicaoDeSenha()).resolves.toBeUndefined();
    expect(aviso).toHaveBeenCalledWith('SMTP não configurado; e-mail de redefinição não enviado.');
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});
