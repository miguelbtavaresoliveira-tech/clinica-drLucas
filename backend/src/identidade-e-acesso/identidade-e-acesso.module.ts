import { Module, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  Auditor,
  BARRAMENTO_DE_EVENTOS,
  CALCULADORA_DE_HASH,
  CONFIGURACAO,
  COFRE_DE_SEGREDOS,
  ConcluirLogin,
  ConcluirRedefinicaoDeSenha,
  ConfirmarMfa,
  ConfirmarReconfiguracaoDeMfa,
  CriarPrimeiroProprietario,
  DesativarUsuario,
  EMISSOR_DE_TOKENS,
  ENVIADOR_DE_EMAIL,
  EncerrarSessao,
  GERADOR_DE_CODIGOS_DE_RECUPERACAO,
  GerarSegredoDeMfa,
  HASHER_DE_SENHA,
  IniciarLogin,
  IniciarReconfiguracaoDeMfa,
  ListarDispositivos,
  POLITICA_DE_ACESSO,
  POLITICA_DE_SENHA,
  RELOGIO,
  ReceberAuditoriaDoApp,
  RedefinirAcessoAdministrativo,
  RegenerarCodigosDeRecuperacao,
  RenovarSessao,
  RevogarDispositivo,
  SERVICO_TOTP,
  SolicitarRedefinicaoDeSenha,
  TrocarSenha,
  UNIDADE_DE_TRABALHO,
  VERIFICADOR_DE_ASSINATURA,
  VerificadorDeMfa,
  type BarramentoDeEventos,
  type CalculadoraDeHash,
  type CofreDeSegredos,
  type EmissorDeTokens,
  type EnviadorDeEmail,
  type GeradorDeCodigosDeRecuperacao,
  type HasherDeSenha,
  type Relogio,
  type ServicoTotp,
  type UnidadeDeTrabalho,
  type VerificadorDeAssinatura,
} from './application/index.js';
import {
  PoliticaDeLimiteDeDispositivos,
  PoliticaDeProprietario,
  PoliticaDeSenha,
  type PoliticaDeAcesso,
} from './domain/index.js';
import { Argon2idHasher } from './infrastructure/adaptadores/argon2id-hasher.js';
import { AesGcmCofreDeSegredos } from './infrastructure/adaptadores/aes-gcm-cofre-de-segredos.js';
import { BarramentoEmProcesso } from './infrastructure/adaptadores/barramento-em-processo.js';
import { Ed25519VerificadorDeAssinatura } from './infrastructure/adaptadores/ed25519-verificador-de-assinatura.js';
import { EnviadorDeEmailDesabilitado } from './infrastructure/adaptadores/enviador-de-email-desabilitado.js';
import { GeradorDeCodigosCrockford } from './infrastructure/adaptadores/gerador-de-codigos-de-recuperacao.js';
import { JwtEmissorDeTokens } from './infrastructure/adaptadores/jwt-emissor-de-tokens.js';
import { OtplibServicoTotp } from './infrastructure/adaptadores/otplib-servico-totp.js';
import { RelogioDoSistema } from './infrastructure/adaptadores/relogio-do-sistema.js';
import { Sha256CalculadoraDeHash } from './infrastructure/adaptadores/sha256-calculadora-de-hash.js';
import { SmtpEnviadorDeEmail } from './infrastructure/adaptadores/smtp-enviador-de-email.js';
import { carregarConfiguracao, type Configuracao } from './infrastructure/config/configuracao.js';
import { politicaDaConfiguracao } from './infrastructure/config/politica-de-acesso.config.js';
import { CicloDeVidaDoBanco } from './infrastructure/persistencia/ciclo-de-vida-do-banco.js';
import { criarConexao, type ConexaoDoBanco } from './infrastructure/persistencia/conexao.js';
import { DrizzleUnidadeDeTrabalho } from './infrastructure/persistencia/drizzle-unidade-de-trabalho.js';
import { SENHAS_COMUNS } from './infrastructure/seguranca/senhas-comuns.js';
import { AuditoriaController } from './interface/http/controllers/auditoria.controller.js';
import { AuthController } from './interface/http/controllers/auth.controller.js';
import { DispositivosController } from './interface/http/controllers/dispositivos.controller.js';
import { UsuariosController } from './interface/http/controllers/usuarios.controller.js';
import { FiltroDeErros } from './interface/http/filtros/filtro-de-erros.js';

export const CONEXAO_DO_BANCO = Symbol('ConexaoDoBanco');
const DEPENDENCIAS = Symbol('DependenciasDaAplicacao');

/** Tudo o que os casos de uso precisam, resolvido uma vez pelo contêiner de injeção. */
interface Dependencias {
  uow: UnidadeDeTrabalho;
  hasher: HasherDeSenha;
  totp: ServicoTotp;
  cofre: CofreDeSegredos;
  emissor: EmissorDeTokens;
  enviador: EnviadorDeEmail;
  relogio: Relogio;
  barramento: BarramentoDeEventos;
  codigos: GeradorDeCodigosDeRecuperacao;
  hash: CalculadoraDeHash;
  assinatura: VerificadorDeAssinatura;
  politica: PoliticaDeAcesso;
  politicaDeSenha: PoliticaDeSenha;
  config: Configuracao;
  auditor: Auditor;
  verificadorDeMfa: VerificadorDeMfa;
  politicaDeProprietario: PoliticaDeProprietario;
  limiteDeDispositivos: PoliticaDeLimiteDeDispositivos;
}

const provedoresBase: Provider[] = [
  { provide: CONFIGURACAO, useFactory: (): Configuracao => carregarConfiguracao(process.env) },
  {
    provide: POLITICA_DE_ACESSO,
    useFactory: (c: Configuracao) => politicaDaConfiguracao(c),
    inject: [CONFIGURACAO],
  },
  {
    provide: CONEXAO_DO_BANCO,
    useFactory: (c: Configuracao): ConexaoDoBanco => criarConexao(c.databaseUrl),
    inject: [CONFIGURACAO],
  },
  { provide: RELOGIO, useFactory: (): Relogio => new RelogioDoSistema() },
  { provide: HASHER_DE_SENHA, useFactory: (): HasherDeSenha => new Argon2idHasher() },
  {
    provide: SERVICO_TOTP,
    useFactory: (relogio: Relogio): ServicoTotp => new OtplibServicoTotp(relogio),
    inject: [RELOGIO],
  },
  {
    provide: COFRE_DE_SEGREDOS,
    useFactory: (c: Configuracao): CofreDeSegredos => new AesGcmCofreDeSegredos(c.totpChaveCifra),
    inject: [CONFIGURACAO],
  },
  {
    provide: EMISSOR_DE_TOKENS,
    useFactory: (c: Configuracao, relogio: Relogio): EmissorDeTokens =>
      new JwtEmissorDeTokens({ accessSegredo: c.jwtAccessSegredo, desafioSegredo: c.jwtDesafioSegredo }, relogio),
    inject: [CONFIGURACAO, RELOGIO],
  },
  {
    provide: ENVIADOR_DE_EMAIL,
    useFactory: (c: Configuracao): EnviadorDeEmail =>
      c.smtp === null ? new EnviadorDeEmailDesabilitado() : new SmtpEnviadorDeEmail(c.smtp),
    inject: [CONFIGURACAO],
  },
  { provide: BARRAMENTO_DE_EVENTOS, useFactory: (): BarramentoDeEventos => new BarramentoEmProcesso() },
  {
    provide: GERADOR_DE_CODIGOS_DE_RECUPERACAO,
    useFactory: (): GeradorDeCodigosDeRecuperacao => new GeradorDeCodigosCrockford(),
  },
  { provide: CALCULADORA_DE_HASH, useFactory: (): CalculadoraDeHash => new Sha256CalculadoraDeHash() },
  {
    provide: VERIFICADOR_DE_ASSINATURA,
    useFactory: (): VerificadorDeAssinatura => new Ed25519VerificadorDeAssinatura(),
  },
  {
    provide: UNIDADE_DE_TRABALHO,
    useFactory: (conexao: ConexaoDoBanco, hash: CalculadoraDeHash): UnidadeDeTrabalho =>
      new DrizzleUnidadeDeTrabalho(conexao.db, hash),
    inject: [CONEXAO_DO_BANCO, CALCULADORA_DE_HASH],
  },
  { provide: POLITICA_DE_SENHA, useFactory: (): PoliticaDeSenha => new PoliticaDeSenha(new Set(SENHAS_COMUNS)) },
  { provide: Auditor, useFactory: (): Auditor => new Auditor() },
  {
    provide: VerificadorDeMfa,
    useFactory: (totp: ServicoTotp, cofre: CofreDeSegredos, codigos: GeradorDeCodigosDeRecuperacao) =>
      new VerificadorDeMfa(totp, cofre, codigos),
    inject: [SERVICO_TOTP, COFRE_DE_SEGREDOS, GERADOR_DE_CODIGOS_DE_RECUPERACAO],
  },
  { provide: PoliticaDeProprietario, useFactory: (): PoliticaDeProprietario => new PoliticaDeProprietario() },
  {
    provide: PoliticaDeLimiteDeDispositivos,
    useFactory: (): PoliticaDeLimiteDeDispositivos => new PoliticaDeLimiteDeDispositivos(),
  },
  {
    provide: DEPENDENCIAS,
    useFactory: (
      uow: UnidadeDeTrabalho,
      hasher: HasherDeSenha,
      totp: ServicoTotp,
      cofre: CofreDeSegredos,
      emissor: EmissorDeTokens,
      enviador: EnviadorDeEmail,
      relogio: Relogio,
      barramento: BarramentoDeEventos,
      codigos: GeradorDeCodigosDeRecuperacao,
      hash: CalculadoraDeHash,
      assinatura: VerificadorDeAssinatura,
      politica: PoliticaDeAcesso,
      politicaDeSenha: PoliticaDeSenha,
      config: Configuracao,
      auditor: Auditor,
      verificadorDeMfa: VerificadorDeMfa,
      politicaDeProprietario: PoliticaDeProprietario,
      limiteDeDispositivos: PoliticaDeLimiteDeDispositivos,
    ): Dependencias => ({
      uow,
      hasher,
      totp,
      cofre,
      emissor,
      enviador,
      relogio,
      barramento,
      codigos,
      hash,
      assinatura,
      politica,
      politicaDeSenha,
      config,
      auditor,
      verificadorDeMfa,
      politicaDeProprietario,
      limiteDeDispositivos,
    }),
    inject: [
      UNIDADE_DE_TRABALHO,
      HASHER_DE_SENHA,
      SERVICO_TOTP,
      COFRE_DE_SEGREDOS,
      EMISSOR_DE_TOKENS,
      ENVIADOR_DE_EMAIL,
      RELOGIO,
      BARRAMENTO_DE_EVENTOS,
      GERADOR_DE_CODIGOS_DE_RECUPERACAO,
      CALCULADORA_DE_HASH,
      VERIFICADOR_DE_ASSINATURA,
      POLITICA_DE_ACESSO,
      POLITICA_DE_SENHA,
      CONFIGURACAO,
      Auditor,
      VerificadorDeMfa,
      PoliticaDeProprietario,
      PoliticaDeLimiteDeDispositivos,
    ],
  },
];

/** Cada caso de uso é registrado com a própria classe como token. */
const casosDeUso: Provider[] = [
  {
    provide: CriarPrimeiroProprietario,
    useFactory: (d: Dependencias) =>
      new CriarPrimeiroProprietario({
        uow: d.uow,
        hasher: d.hasher,
        politicaDeSenha: d.politicaDeSenha,
        politica: d.politica,
        relogio: d.relogio,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: IniciarLogin,
    useFactory: (d: Dependencias) =>
      new IniciarLogin({
        uow: d.uow,
        hasher: d.hasher,
        emissor: d.emissor,
        relogio: d.relogio,
        politica: d.politica,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: GerarSegredoDeMfa,
    useFactory: (d: Dependencias) =>
      new GerarSegredoDeMfa({ uow: d.uow, emissor: d.emissor, totp: d.totp, cofre: d.cofre, relogio: d.relogio }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: ConfirmarMfa,
    useFactory: (d: Dependencias) =>
      new ConfirmarMfa({
        uow: d.uow,
        emissor: d.emissor,
        totp: d.totp,
        cofre: d.cofre,
        codigos: d.codigos,
        verificadorDeMfa: d.verificadorDeMfa,
        relogio: d.relogio,
        politica: d.politica,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: ConcluirLogin,
    useFactory: (d: Dependencias) =>
      new ConcluirLogin({
        uow: d.uow,
        emissor: d.emissor,
        verificadorDeMfa: d.verificadorDeMfa,
        relogio: d.relogio,
        politica: d.politica,
        limiteDeDispositivos: d.limiteDeDispositivos,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: RenovarSessao,
    useFactory: (d: Dependencias) =>
      new RenovarSessao({
        uow: d.uow,
        emissor: d.emissor,
        relogio: d.relogio,
        politica: d.politica,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: EncerrarSessao,
    useFactory: (d: Dependencias) =>
      new EncerrarSessao({ uow: d.uow, relogio: d.relogio, auditor: d.auditor, barramento: d.barramento }),
    inject: [DEPENDENCIAS],
  },
  { provide: ListarDispositivos, useFactory: (d: Dependencias) => new ListarDispositivos({ uow: d.uow }), inject: [DEPENDENCIAS] },
  {
    provide: RevogarDispositivo,
    useFactory: (d: Dependencias) =>
      new RevogarDispositivo({
        uow: d.uow,
        verificadorDeMfa: d.verificadorDeMfa,
        relogio: d.relogio,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: TrocarSenha,
    useFactory: (d: Dependencias) =>
      new TrocarSenha({
        uow: d.uow,
        hasher: d.hasher,
        politicaDeSenha: d.politicaDeSenha,
        politica: d.politica,
        relogio: d.relogio,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: SolicitarRedefinicaoDeSenha,
    useFactory: (d: Dependencias) =>
      new SolicitarRedefinicaoDeSenha({
        uow: d.uow,
        emissor: d.emissor,
        enviador: d.enviador,
        relogio: d.relogio,
        auditor: d.auditor,
        urlRedefinicaoSenha: d.config.urlRedefinicaoSenha,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: ConcluirRedefinicaoDeSenha,
    useFactory: (d: Dependencias) =>
      new ConcluirRedefinicaoDeSenha({
        uow: d.uow,
        emissor: d.emissor,
        hasher: d.hasher,
        politicaDeSenha: d.politicaDeSenha,
        politica: d.politica,
        verificadorDeMfa: d.verificadorDeMfa,
        relogio: d.relogio,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: RegenerarCodigosDeRecuperacao,
    useFactory: (d: Dependencias) =>
      new RegenerarCodigosDeRecuperacao({
        uow: d.uow,
        verificadorDeMfa: d.verificadorDeMfa,
        codigos: d.codigos,
        relogio: d.relogio,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: IniciarReconfiguracaoDeMfa,
    useFactory: (d: Dependencias) =>
      new IniciarReconfiguracaoDeMfa({
        uow: d.uow,
        hasher: d.hasher,
        totp: d.totp,
        cofre: d.cofre,
        politica: d.politica,
        relogio: d.relogio,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: ConfirmarReconfiguracaoDeMfa,
    useFactory: (d: Dependencias) =>
      new ConfirmarReconfiguracaoDeMfa({
        uow: d.uow,
        verificadorDeMfa: d.verificadorDeMfa,
        codigos: d.codigos,
        relogio: d.relogio,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: ReceberAuditoriaDoApp,
    useFactory: (d: Dependencias) =>
      new ReceberAuditoriaDoApp({ uow: d.uow, relogio: d.relogio, hash: d.hash, assinatura: d.assinatura }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: DesativarUsuario,
    useFactory: (d: Dependencias) =>
      new DesativarUsuario({
        uow: d.uow,
        relogio: d.relogio,
        politicaDeProprietario: d.politicaDeProprietario,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
  {
    provide: RedefinirAcessoAdministrativo,
    useFactory: (d: Dependencias) =>
      new RedefinirAcessoAdministrativo({
        uow: d.uow,
        hasher: d.hasher,
        politicaDeSenha: d.politicaDeSenha,
        politica: d.politica,
        relogio: d.relogio,
        auditor: d.auditor,
        barramento: d.barramento,
      }),
    inject: [DEPENDENCIAS],
  },
];

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }])],
  controllers: [AuthController, DispositivosController, AuditoriaController, UsuariosController],
  providers: [
    ...provedoresBase,
    ...casosDeUso,
    {
      provide: CicloDeVidaDoBanco,
      useFactory: (conexao: ConexaoDoBanco) => new CicloDeVidaDoBanco(conexao),
      inject: [CONEXAO_DO_BANCO],
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: FiltroDeErros },
  ],
  exports: [EMISSOR_DE_TOKENS],
})
export class IdentidadeEAcessoModule {}
