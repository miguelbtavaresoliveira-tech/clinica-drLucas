import { Email } from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { VALIDADE_TOKEN_REDEFINICAO_MIN } from '../comum/constantes.js';
import type { EmissorDeTokens, EnviadorDeEmail, Relogio, UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasSolicitarRedefinicao {
  uow: UnidadeDeTrabalho;
  emissor: EmissorDeTokens;
  enviador: EnviadorDeEmail;
  relogio: Relogio;
  auditor: Auditor;
  urlRedefinicaoSenha: string;
}

export interface EntradaSolicitarRedefinicao {
  email: string;
  ip: string | null;
}

/**
 * Resposta idêntica exista ou não o e-mail (RN-12): nunca sinaliza o resultado
 * e não espera o envio do e-mail para responder.
 */
export class SolicitarRedefinicaoDeSenha {
  constructor(private readonly d: DependenciasSolicitarRedefinicao) {}

  async executar(e: EntradaSolicitarRedefinicao): Promise<void> {
    const agora = this.d.relogio.agora();
    let email: Email;
    try {
      email = Email.criar(e.email);
    } catch {
      return;
    }

    const emitido = await this.d.uow.executar(async (r) => {
      const usuario = await r.usuarios.porEmail(email);
      if (usuario === null || usuario.situacao === 'desativado') return null;
      await r.tokensDeRedefinicao.invalidarDoUsuario(usuario.id, agora);
      const { token, hash } = this.d.emissor.gerarTokenOpaco();
      const expiraEm = new Date(agora.getTime() + VALIDADE_TOKEN_REDEFINICAO_MIN * 60_000);
      await r.tokensDeRedefinicao.criar({ hash, usuarioId: usuario.id, expiraEm });
      await r.auditoria.registrar(
        this.d.auditor.avulso('redefinicao-de-senha-solicitada', {
          ocorridoEm: agora,
          usuarioId: usuario.id,
          dispositivoId: null,
          ip: e.ip,
        }),
      );
      return { email: usuario.email, token, expiraEm };
    });
    if (emitido === null) return;

    const link = `${this.d.urlRedefinicaoSenha}?token=${encodeURIComponent(emitido.token)}`;
    try {
      this.d.enviador
        .enviarRedefinicaoDeSenha(emitido.email, { link, token: emitido.token, expiraEm: emitido.expiraEm })
        .catch(() => undefined);
    } catch {
      // O adaptador registra a falha; o chamador não pode distinguir o caso.
    }
  }
}
