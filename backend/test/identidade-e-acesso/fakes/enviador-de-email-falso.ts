import type { Email } from '../../../src/identidade-e-acesso/domain/index.js';
import type { EnviadorDeEmail } from '../../../src/identidade-e-acesso/application/portas/index.js';

export class EnviadorDeEmailFalso implements EnviadorDeEmail {
  readonly enviados: { para: string; link: string; token: string }[] = [];
  falharProximo = false;

  enviarRedefinicaoDeSenha(para: Email, dados: { link: string; token: string; expiraEm: Date }): Promise<void> {
    if (this.falharProximo) {
      this.falharProximo = false;
      return Promise.reject(new Error('Falha simulada no envio de e-mail.'));
    }
    this.enviados.push({ para: para.valor, link: dados.link, token: dados.token });
    return Promise.resolve();
  }
}
