import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Email } from '../../domain/index.js';
import type { EnviadorDeEmail } from '../../application/portas/index.js';
import type { ConfiguracaoSmtp } from '../config/configuracao.js';

export type TransporteDeEmail = Pick<Transporter, 'sendMail'>;

const ASSUNTO = 'Redefinição de senha — EVO Clínica';

function formatarData(d: Date): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('day')}/${valor('month')}/${valor('year')} ${valor('hour')}:${valor('minute')}`;
}

export class SmtpEnviadorDeEmail implements EnviadorDeEmail {
  private readonly logger = new Logger(SmtpEnviadorDeEmail.name);
  private readonly transporte: TransporteDeEmail;

  constructor(
    private readonly config: ConfiguracaoSmtp,
    transporte?: TransporteDeEmail,
  ) {
    this.transporte =
      transporte ??
      nodemailer.createTransport({
        host: config.host,
        port: config.porta,
        secure: config.seguro,
        requireTLS: !config.seguro,
        auth: { user: config.usuario, pass: config.senha },
      });
  }

  async enviarRedefinicaoDeSenha(
    para: Email,
    dados: { link: string; token: string; expiraEm: Date },
  ): Promise<void> {
    const text = [
      'Recebemos um pedido para redefinir a senha da sua conta na EVO Clínica.',
      '',
      'Código de redefinição (cole no aplicativo):',
      dados.token,
      '',
      `Ou abra: ${dados.link}`,
      '',
      `O código vale até ${formatarData(dados.expiraEm)} e só pode ser usado uma vez.`,
      'Para concluir, você também precisará do código do seu aplicativo autenticador.',
      '',
      'Se você não pediu a redefinição, ignore este e-mail. Sua senha continua a mesma.',
    ].join('\n');

    try {
      await this.transporte.sendMail({ from: this.config.remetente, to: para.valor, subject: ASSUNTO, text });
    } catch {
      this.logger.error('Falha ao enviar e-mail de redefinição.');
      throw new Error('Falha ao enviar e-mail.');
    }
  }
}
