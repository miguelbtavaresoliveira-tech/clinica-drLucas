import {
  Email,
  EmailJaCadastrado,
  ProprietarioJaExiste,
  Usuario,
  type PoliticaDeAcesso,
  type PoliticaDeSenha,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import type { BarramentoDeEventos, HasherDeSenha, Relogio, UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasCriarPrimeiroProprietario {
  uow: UnidadeDeTrabalho;
  hasher: HasherDeSenha;
  politicaDeSenha: PoliticaDeSenha;
  politica: PoliticaDeAcesso;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaCriarPrimeiroProprietario {
  nome: string;
  email: string;
  senha: string;
}

export interface SaidaCriarPrimeiroProprietario {
  usuarioId: string;
}

export class CriarPrimeiroProprietario {
  constructor(private readonly d: DependenciasCriarPrimeiroProprietario) {}

  async executar(e: EntradaCriarPrimeiroProprietario): Promise<SaidaCriarPrimeiroProprietario> {
    const agora = this.d.relogio.agora();
    const email = Email.criar(e.email);
    this.d.politicaDeSenha.validar(e.senha, email, this.d.politica);
    const hashDeSenha = await this.d.hasher.gerar(e.senha);

    const { usuarioId, eventos } = await this.d.uow.executar(async (r) => {
      if ((await r.usuarios.contarProprietariosAtivos()) > 0) throw new ProprietarioJaExiste();
      if ((await r.usuarios.porEmail(email)) !== null) throw new EmailJaCadastrado();
      const usuario = Usuario.criar({ nome: e.nome, email, hashDeSenha, papeis: ['proprietario'], agora });
      await r.usuarios.salvar(usuario);
      const gerados = usuario.puxarEventos();
      await this.d.auditor.registrar(r.auditoria, gerados, { ip: null, dispositivoId: null });
      return { usuarioId: usuario.id.valor, eventos: gerados };
    });

    await this.d.barramento.publicar(eventos);
    return { usuarioId };
  }
}
