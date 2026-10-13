import { MfaJaConfigurado, SegredoTotpCifrado } from '../../domain/index.js';
import { carregarDesafioValido } from '../comum/validacao-de-desafio.js';
import type { CofreDeSegredos, EmissorDeTokens, Relogio, ServicoTotp, UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasGerarSegredoDeMfa {
  uow: UnidadeDeTrabalho;
  emissor: EmissorDeTokens;
  totp: ServicoTotp;
  cofre: CofreDeSegredos;
  relogio: Relogio;
}

export interface EntradaGerarSegredoDeMfa {
  desafio: string;
}

export interface SaidaGerarSegredoDeMfa {
  segredo: string;
  urlOtpauth: string;
}

export class GerarSegredoDeMfa {
  constructor(private readonly d: DependenciasGerarSegredoDeMfa) {}

  async executar(e: EntradaGerarSegredoDeMfa): Promise<SaidaGerarSegredoDeMfa> {
    const agora = this.d.relogio.agora();
    return this.d.uow.executar(async (r) => {
      const { usuario } = await carregarDesafioValido(e.desafio, this.d.emissor, r, agora);
      if (!usuario.exigeConfigurarMfa()) throw new MfaJaConfigurado();
      const segredo = this.d.totp.novoSegredo();
      usuario.prepararMfa(SegredoTotpCifrado.de(await this.d.cofre.cifrar(segredo)));
      await r.usuarios.salvar(usuario);
      return { segredo, urlOtpauth: this.d.totp.urlDoAutenticador(segredo, usuario.email.valor) };
    });
  }
}
