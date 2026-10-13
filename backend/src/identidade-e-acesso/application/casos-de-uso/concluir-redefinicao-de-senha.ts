import {
  CodigoMfaInvalido,
  MfaObrigatorio,
  TokenDeRedefinicaoInvalido,
  type EventoDeDominio,
  type PoliticaDeAcesso,
  type PoliticaDeSenha,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import type { CodigoInformado, VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import type {
  BarramentoDeEventos,
  EmissorDeTokens,
  HasherDeSenha,
  Relogio,
  UnidadeDeTrabalho,
} from '../portas/index.js';

export interface DependenciasConcluirRedefinicao {
  uow: UnidadeDeTrabalho;
  emissor: EmissorDeTokens;
  hasher: HasherDeSenha;
  politicaDeSenha: PoliticaDeSenha;
  politica: PoliticaDeAcesso;
  verificadorDeMfa: VerificadorDeMfa;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaConcluirRedefinicao {
  token: string;
  novaSenha: string;
  codigo: CodigoInformado;
  ip: string | null;
}

export class ConcluirRedefinicaoDeSenha {
  constructor(private readonly d: DependenciasConcluirRedefinicao) {}

  async executar(e: EntradaConcluirRedefinicao): Promise<void> {
    const agora = this.d.relogio.agora();
    const meta = { ip: e.ip, dispositivoId: null };

    const resultado = await this.d.uow.executar(async (r): Promise<Resultado<void>> => {
      // Até consumir o token nada é persistido, então lançar é seguro (e o token segue válido).
      const hash = this.d.emissor.hashDe(e.token);
      const usuarioId = await r.tokensDeRedefinicao.usuarioDoTokenValido(hash, agora);
      if (usuarioId === null) throw new TokenDeRedefinicaoInvalido();
      const usuario = await r.usuarios.porId(usuarioId);
      if (usuario === null || usuario.situacao === 'desativado') throw new TokenDeRedefinicaoInvalido();
      if (usuario.exigeConfigurarMfa()) throw new MfaObrigatorio();
      this.d.politicaDeSenha.validar(e.novaSenha, usuario.email, this.d.politica);

      if (!(await r.tokensDeRedefinicao.consumir(hash, agora))) return falha(new TokenDeRedefinicaoInvalido());

      const mfa = await this.d.verificadorDeMfa.verificar(usuario, e.codigo, agora);
      if (!mfa.ok) {
        usuario.registrarFalhaDeLogin(agora, this.d.politica, 'mfa');
        await r.usuarios.salvar(usuario);
        const eventos = usuario.puxarEventos();
        await this.d.auditor.registrar(r.auditoria, eventos, meta);
        return falha(new CodigoMfaInvalido(), eventos);
      }

      usuario.trocarSenha(await this.d.hasher.gerar(e.novaSenha), agora);
      const sessoes = await r.sessoes.ativasDoUsuario(usuario.id);
      for (const sessao of sessoes) {
        sessao.revogar('senha-alterada', agora);
        await r.sessoes.salvar(sessao);
      }
      await r.usuarios.salvar(usuario);

      const eventos: EventoDeDominio[] = [...usuario.puxarEventos(), ...sessoes.flatMap((s) => s.puxarEventos())];
      await this.d.auditor.registrar(r.auditoria, eventos, meta);
      return sucesso(undefined, eventos);
    });

    await this.d.barramento.publicar(resultado.eventos);
    desembrulhar(resultado);
  }
}
