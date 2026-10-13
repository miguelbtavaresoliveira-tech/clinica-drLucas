import {
  Dispositivo,
  Email,
  POLITICA_PADRAO,
  PoliticaDeLimiteDeDispositivos,
  PoliticaDeSenha,
  SegredoTotpCifrado,
  Usuario,
  type PoliticaDeAcesso,
  type UsuarioId,
} from '../../../src/identidade-e-acesso/domain/index.js';
import { ConcluirLogin, type SaidaConcluirLogin } from '../../../src/identidade-e-acesso/application/casos-de-uso/concluir-login.js';
import { VerificadorDeMfa } from '../../../src/identidade-e-acesso/application/comum/verificador-de-mfa.js';
import { Auditor } from '../../../src/identidade-e-acesso/application/auditoria/auditor.js';
import { BarramentoFalso } from './barramento-falso.js';
import { CofreFalso } from './cofre-falso.js';
import { CalculadoraDeHashDeTeste, VerificadorDeAssinaturaDeTeste } from './cripto-de-teste.js';
import { EmissorDeTokensFalso } from './emissor-de-tokens-falso.js';
import { EnviadorDeEmailFalso } from './enviador-de-email-falso.js';
import { GeradorDeCodigosFalso } from './gerador-de-codigos-falso.js';
import { HasherFalso } from './hasher-falso.js';
import { RelogioFixo } from './relogio-fixo.js';
import { ServicoTotpFalso } from './servico-totp-falso.js';
import { UnidadeDeTrabalhoEmMemoria, type RepositoriosEmMemoria } from './unidade-de-trabalho-em-memoria.js';

export const CHAVE_PUBLICA_DE_TESTE = 'ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=';
export const SENHA_PADRAO_DE_TESTE = 'senha-de-teste-forte-123';
export const CODIGO_TOTP_VALIDO = '123456';

export interface AmbienteDeTeste {
  uow: UnidadeDeTrabalhoEmMemoria;
  repos: RepositoriosEmMemoria;
  relogio: RelogioFixo;
  hasher: HasherFalso;
  totp: ServicoTotpFalso;
  cofre: CofreFalso;
  emissor: EmissorDeTokensFalso;
  email: EnviadorDeEmailFalso;
  barramento: BarramentoFalso;
  codigos: GeradorDeCodigosFalso;
  hash: CalculadoraDeHashDeTeste;
  assinatura: VerificadorDeAssinaturaDeTeste;
  politica: PoliticaDeAcesso;
  politicaDeSenha: PoliticaDeSenha;
  auditor: Auditor;
}

export function criarAmbienteDeTeste(): AmbienteDeTeste {
  const uow = new UnidadeDeTrabalhoEmMemoria();
  return {
    uow,
    repos: uow.repositorios,
    relogio: new RelogioFixo(new Date('2026-10-13T12:00:00.000Z')),
    hasher: new HasherFalso(),
    totp: new ServicoTotpFalso(),
    cofre: new CofreFalso(),
    emissor: new EmissorDeTokensFalso(),
    email: new EnviadorDeEmailFalso(),
    barramento: new BarramentoFalso(),
    codigos: new GeradorDeCodigosFalso(),
    hash: new CalculadoraDeHashDeTeste(),
    assinatura: new VerificadorDeAssinaturaDeTeste(),
    politica: POLITICA_PADRAO,
    politicaDeSenha: new PoliticaDeSenha(new Set(['fisioterapia123'])),
    auditor: new Auditor(),
  };
}

export async function semearUsuarioComMfa(
  amb: AmbienteDeTeste,
  dados: { email?: string; senha?: string } = {},
): Promise<{ usuario: Usuario; senha: string; codigoValido: string; codigosDeRecuperacao: string[] }> {
  const senha = dados.senha ?? SENHA_PADRAO_DE_TESTE;
  const agora = amb.relogio.agora();
  const usuario = Usuario.criar({
    nome: 'Lucas',
    email: Email.criar(dados.email ?? 'lucas@clinica.com'),
    hashDeSenha: await amb.hasher.gerar(senha),
    papeis: ['proprietario'],
    agora,
  });
  usuario.prepararMfa(SegredoTotpCifrado.de(await amb.cofre.cifrar(amb.totp.novoSegredo())));
  const geracao = amb.codigos.gerar(10);
  usuario.confirmarMfa(
    1000,
    geracao.map((g) => ({ id: crypto.randomUUID(), hash: g.hash })),
    agora,
  );
  amb.totp.codigosValidos.set(CODIGO_TOTP_VALIDO, 1001);
  await amb.repos.usuarios.salvar(usuario);
  usuario.puxarEventos();
  return {
    usuario,
    senha,
    codigoValido: CODIGO_TOTP_VALIDO,
    codigosDeRecuperacao: geracao.map((g) => g.codigo),
  };
}

export async function semearDispositivo(amb: AmbienteDeTeste, usuarioId: UsuarioId): Promise<Dispositivo> {
  const dispositivo = Dispositivo.registrar({
    usuarioId,
    apelido: 'MacBook de teste',
    plataforma: 'macos',
    chavePublicaAuditoria: CHAVE_PUBLICA_DE_TESTE,
    agora: amb.relogio.agora(),
  });
  await amb.repos.dispositivos.salvar(dispositivo);
  dispositivo.puxarEventos();
  return dispositivo;
}

/** Cria um desafio de login válido por 5 minutos para o usuário. */
export async function semearDesafio(amb: AmbienteDeTeste, usuarioId: UsuarioId): Promise<string> {
  const expiraEm = new Date(amb.relogio.agora().getTime() + 300_000);
  const { id, token } = amb.emissor.emitirDesafio(usuarioId, expiraEm);
  await amb.repos.desafios.criar({ id, usuarioId, expiraEm });
  return token;
}

/** Usuário proprietário ainda sem MFA (primeiro acesso) e um desafio válido. */
export async function semearUsuarioSemMfa(
  amb: AmbienteDeTeste,
  dados: { email?: string; senha?: string } = {},
): Promise<{ usuario: Usuario; senha: string; desafio: string }> {
  const senha = dados.senha ?? SENHA_PADRAO_DE_TESTE;
  const usuario = Usuario.criar({
    nome: 'Novo',
    email: Email.criar(dados.email ?? 'novo@clinica.com'),
    hashDeSenha: await amb.hasher.gerar(senha),
    papeis: ['proprietario'],
    agora: amb.relogio.agora(),
  });
  await amb.repos.usuarios.salvar(usuario);
  usuario.puxarEventos();
  return { usuario, senha, desafio: await semearDesafio(amb, usuario.id) };
}

export function criarConcluirLogin(amb: AmbienteDeTeste): ConcluirLogin {
  return new ConcluirLogin({
    uow: amb.uow,
    emissor: amb.emissor,
    verificadorDeMfa: new VerificadorDeMfa(amb.totp, amb.cofre, amb.codigos),
    relogio: amb.relogio,
    politica: amb.politica,
    limiteDeDispositivos: new PoliticaDeLimiteDeDispositivos(),
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
}

/**
 * Faz um login completo (desafio + TOTP novo + ConcluirLogin) para um usuário que já tem MFA.
 * Cada chamada registra um código TOTP inédito, de passo maior que o anterior (RN-10).
 */
export async function entrar(
  amb: AmbienteDeTeste,
  usuarioId: UsuarioId,
  opcoes: { dispositivoId?: string | null } = {},
): Promise<SaidaConcluirLogin> {
  const n = amb.totp.codigosValidos.size;
  const codigo = String(200000 + n);
  amb.totp.codigosValidos.set(codigo, 1001 + n);
  return criarConcluirLogin(amb).executar({
    desafio: await semearDesafio(amb, usuarioId),
    codigo: { tipo: 'totp', valor: codigo },
    dispositivo: {
      id: opcoes.dispositivoId ?? null,
      apelido: 'MacBook da clínica',
      plataforma: 'macos',
      chavePublicaAuditoria: CHAVE_PUBLICA_DE_TESTE,
    },
    ip: null,
  });
}
