import {
  ContaBloqueada,
  ContaDesativada,
  CredenciaisInvalidas,
  Email,
  type EventoDeDominio,
  type PoliticaDeAcesso,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { VALIDADE_DESAFIO_MIN } from '../comum/constantes.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import type {
  BarramentoDeEventos,
  EmissorDeTokens,
  HasherDeSenha,
  Relogio,
  UnidadeDeTrabalho,
} from '../portas/index.js';

export interface DependenciasIniciarLogin {
  uow: UnidadeDeTrabalho;
  hasher: HasherDeSenha;
  emissor: EmissorDeTokens;
  relogio: Relogio;
  politica: PoliticaDeAcesso;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaIniciarLogin {
  email: string;
  senha: string;
  ip: string | null;
}

export interface SaidaIniciarLogin {
  desafio: string;
  mfa: 'configurar' | 'verificar';
  expiraEm: Date;
}

export class IniciarLogin {
  constructor(private readonly d: DependenciasIniciarLogin) {}

  async executar(e: EntradaIniciarLogin): Promise<SaidaIniciarLogin> {
    const agora = this.d.relogio.agora();
    let email: Email;
    try {
      email = Email.criar(e.email);
    } catch {
      await this.d.hasher.conferirFicticio(e.senha);
      throw new CredenciaisInvalidas();
    }

    const resultado = await this.d.uow.executar(async (r): Promise<Resultado<SaidaIniciarLogin>> => {
      const usuario = await r.usuarios.porEmail(email);
      if (usuario === null) {
        await this.d.hasher.conferirFicticio(e.senha);
        return falha(new CredenciaisInvalidas());
      }

      try {
        usuario.garantirQuePodeAutenticar(agora);
      } catch (erro) {
        if (erro instanceof ContaBloqueada || erro instanceof ContaDesativada) {
          const motivo = erro instanceof ContaBloqueada ? 'conta-bloqueada' : 'conta-desativada';
          await r.auditoria.registrar(
            this.d.auditor.avulso('login-falhou', {
              ocorridoEm: agora,
              usuarioId: usuario.id,
              dispositivoId: null,
              ip: e.ip,
              detalhe: { motivo },
            }),
          );
          return falha(erro);
        }
        throw erro;
      }

      if (!(await this.d.hasher.conferir(e.senha, usuario.hashDeSenha))) {
        usuario.registrarFalhaDeLogin(agora, this.d.politica, 'senha');
        await r.usuarios.salvar(usuario);
        const eventos: readonly EventoDeDominio[] = usuario.puxarEventos();
        await this.d.auditor.registrar(r.auditoria, eventos, { ip: e.ip, dispositivoId: null });
        return falha(new CredenciaisInvalidas(), eventos);
      }

      const expiraEm = new Date(agora.getTime() + VALIDADE_DESAFIO_MIN * 60_000);
      const { id, token } = this.d.emissor.emitirDesafio(usuario.id, expiraEm);
      await r.desafios.criar({ id, usuarioId: usuario.id, expiraEm });
      return sucesso({
        desafio: token,
        mfa: usuario.exigeConfigurarMfa() ? 'configurar' : 'verificar',
        expiraEm,
      });
    });

    await this.d.barramento.publicar(resultado.eventos);
    return desembrulhar(resultado);
  }
}
