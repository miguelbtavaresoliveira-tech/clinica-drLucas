import { CodigoMfaInvalido, type PoliticaDeAcesso } from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import type { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import { carregarDesafioValido } from '../comum/validacao-de-desafio.js';
import type {
  BarramentoDeEventos,
  CofreDeSegredos,
  EmissorDeTokens,
  GeradorDeCodigosDeRecuperacao,
  Relogio,
  ServicoTotp,
  UnidadeDeTrabalho,
} from '../portas/index.js';

export interface DependenciasConfirmarMfa {
  uow: UnidadeDeTrabalho;
  emissor: EmissorDeTokens;
  totp: ServicoTotp;
  cofre: CofreDeSegredos;
  codigos: GeradorDeCodigosDeRecuperacao;
  verificadorDeMfa: VerificadorDeMfa;
  relogio: Relogio;
  politica: PoliticaDeAcesso;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaConfirmarMfa {
  desafio: string;
  codigo: string;
  ip: string | null;
}

/** Exibidos uma única vez. */
export interface SaidaConfirmarMfa {
  codigosDeRecuperacao: string[];
}

const QUANTIDADE_DE_CODIGOS = 10;

export class ConfirmarMfa {
  constructor(private readonly d: DependenciasConfirmarMfa) {}

  async executar(e: EntradaConfirmarMfa): Promise<SaidaConfirmarMfa> {
    const agora = this.d.relogio.agora();
    const resultado = await this.d.uow.executar(async (r): Promise<Resultado<SaidaConfirmarMfa>> => {
      const { usuario } = await carregarDesafioValido(e.desafio, this.d.emissor, r, agora);
      const cifrado = usuario.segredoMfaPendenteDeConfirmacao();
      const verificado = await this.d.verificadorDeMfa.verificarSegredo(cifrado, e.codigo, null);
      const meta = { ip: e.ip, dispositivoId: null };

      if (!verificado.ok) {
        usuario.registrarFalhaDeLogin(agora, this.d.politica, 'mfa');
        await r.usuarios.salvar(usuario);
        const eventos = usuario.puxarEventos();
        await this.d.auditor.registrar(r.auditoria, eventos, meta);
        return falha(new CodigoMfaInvalido(), eventos);
      }

      const gerados = this.d.codigos.gerar(QUANTIDADE_DE_CODIGOS);
      usuario.confirmarMfa(
        verificado.passo,
        gerados.map((g) => ({ id: crypto.randomUUID(), hash: g.hash })),
        agora,
      );
      await r.usuarios.salvar(usuario);
      const eventos = usuario.puxarEventos();
      await this.d.auditor.registrar(r.auditoria, eventos, meta);
      return sucesso({ codigosDeRecuperacao: gerados.map((g) => g.codigo) }, eventos);
    });

    await this.d.barramento.publicar(resultado.eventos);
    return desembrulhar(resultado);
  }
}
