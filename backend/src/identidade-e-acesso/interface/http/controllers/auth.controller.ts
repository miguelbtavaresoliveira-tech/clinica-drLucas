import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ConcluirLogin,
  ConcluirRedefinicaoDeSenha,
  ConfirmarMfa,
  ConfirmarReconfiguracaoDeMfa,
  EncerrarSessao,
  GerarSegredoDeMfa,
  IniciarLogin,
  IniciarReconfiguracaoDeMfa,
  RegenerarCodigosDeRecuperacao,
  RenovarSessao,
  SolicitarRedefinicaoDeSenha,
  TrocarSenha,
} from '../../../application/index.js';
import type { ContextoDeAcesso } from '../../../domain/index.js';
import { apresentarConcluirLogin, apresentarIniciarLogin, apresentarRenovarSessao } from '../apresentadores.js';
import { ContextoAtual } from '../decorators/contexto-atual.js';
import { IpDaRequisicao } from '../decorators/ip-da-requisicao.js';
import { RequerPermissao } from '../decorators/requer-permissao.js';
import {
  esquemaConcluirLogin,
  esquemaConcluirRedefinicao,
  esquemaConfirmarMfa,
  esquemaConfirmarReconfiguracao,
  esquemaGerarSegredo,
  esquemaIniciarLogin,
  esquemaIniciarReconfiguracao,
  esquemaRegenerarCodigos,
  esquemaRenovarSessao,
  esquemaSolicitarRedefinicao,
  esquemaTrocarSenha,
  type CorpoConcluirLogin,
  type CorpoConcluirRedefinicao,
  type CorpoConfirmarMfa,
  type CorpoConfirmarReconfiguracao,
  type CorpoGerarSegredo,
  type CorpoIniciarLogin,
  type CorpoIniciarReconfiguracao,
  type CorpoRegenerarCodigos,
  type CorpoRenovarSessao,
  type CorpoSolicitarRedefinicao,
  type CorpoTrocarSenha,
} from '../dtos/auth.dtos.js';
import { AutenticacaoGuard } from '../guards/autenticacao.guard.js';
import { PermissaoGuard } from '../guards/permissao.guard.js';
import { ValidacaoZodPipe } from '../pipes/validacao-zod.pipe.js';

const CINCO_POR_MINUTO = { default: { limit: 5, ttl: 60_000 } };
const TRINTA_POR_MINUTO = { default: { limit: 30, ttl: 60_000 } };

/** Só valida, monta a entrada do caso de uso e formata a saída. Nenhuma regra de negócio aqui. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly iniciarLogin: IniciarLogin,
    private readonly gerarSegredoDeMfa: GerarSegredoDeMfa,
    private readonly confirmarMfa: ConfirmarMfa,
    private readonly concluirLogin: ConcluirLogin,
    private readonly renovarSessao: RenovarSessao,
    private readonly encerrarSessao: EncerrarSessao,
    private readonly trocarSenha: TrocarSenha,
    private readonly solicitarRedefinicao: SolicitarRedefinicaoDeSenha,
    private readonly concluirRedefinicao: ConcluirRedefinicaoDeSenha,
    private readonly regenerarCodigos: RegenerarCodigosDeRecuperacao,
    private readonly iniciarReconfiguracao: IniciarReconfiguracaoDeMfa,
    private readonly confirmarReconfiguracao: ConfirmarReconfiguracaoDeMfa,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle(CINCO_POR_MINUTO)
  @Header('Cache-Control', 'no-store')
  async login(@Body(new ValidacaoZodPipe(esquemaIniciarLogin)) corpo: CorpoIniciarLogin, @IpDaRequisicao() ip: string | null) {
    return apresentarIniciarLogin(await this.iniciarLogin.executar({ email: corpo.email, senha: corpo.senha, ip }));
  }

  @Post('mfa/segredo')
  @HttpCode(200)
  @Throttle(CINCO_POR_MINUTO)
  @Header('Cache-Control', 'no-store')
  gerarSegredo(@Body(new ValidacaoZodPipe(esquemaGerarSegredo)) corpo: CorpoGerarSegredo) {
    return this.gerarSegredoDeMfa.executar({ desafio: corpo.desafio });
  }

  @Post('mfa/confirmar')
  @HttpCode(200)
  @Throttle(CINCO_POR_MINUTO)
  @Header('Cache-Control', 'no-store')
  confirmar(@Body(new ValidacaoZodPipe(esquemaConfirmarMfa)) corpo: CorpoConfirmarMfa, @IpDaRequisicao() ip: string | null) {
    return this.confirmarMfa.executar({ desafio: corpo.desafio, codigo: corpo.codigo, ip });
  }

  @Post('login/concluir')
  @HttpCode(200)
  @Throttle(CINCO_POR_MINUTO)
  @Header('Cache-Control', 'no-store')
  async concluir(
    @Body(new ValidacaoZodPipe(esquemaConcluirLogin)) corpo: CorpoConcluirLogin,
    @IpDaRequisicao() ip: string | null,
  ) {
    const saida = await this.concluirLogin.executar({
      desafio: corpo.desafio,
      codigo: corpo.codigo,
      dispositivo: {
        id: corpo.dispositivo.id,
        apelido: corpo.dispositivo.apelido,
        plataforma: corpo.dispositivo.plataforma,
        chavePublicaAuditoria: corpo.dispositivo.chavePublicaAuditoria,
      },
      ip,
    });
    return apresentarConcluirLogin(saida);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(TRINTA_POR_MINUTO)
  @Header('Cache-Control', 'no-store')
  async renovar(
    @Body(new ValidacaoZodPipe(esquemaRenovarSessao)) corpo: CorpoRenovarSessao,
    @IpDaRequisicao() ip: string | null,
  ) {
    return apresentarRenovarSessao(
      await this.renovarSessao.executar({ refreshToken: corpo.refreshToken, dispositivoId: corpo.dispositivoId, ip }),
    );
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AutenticacaoGuard, PermissaoGuard)
  async sair(@ContextoAtual() ctx: ContextoDeAcesso, @IpDaRequisicao() ip: string | null): Promise<void> {
    await this.encerrarSessao.executar({ ctx, ip });
  }

  @Post('senha/trocar')
  @HttpCode(204)
  @Throttle(CINCO_POR_MINUTO)
  @UseGuards(AutenticacaoGuard, PermissaoGuard)
  @RequerPermissao('identidade:escrever')
  async trocar(
    @Body(new ValidacaoZodPipe(esquemaTrocarSenha)) corpo: CorpoTrocarSenha,
    @ContextoAtual() ctx: ContextoDeAcesso,
    @IpDaRequisicao() ip: string | null,
  ): Promise<void> {
    await this.trocarSenha.executar({ ctx, senhaAtual: corpo.senhaAtual, novaSenha: corpo.novaSenha, ip });
  }

  /** Resposta idêntica exista ou não o e-mail (RN-12). */
  @Post('senha/esqueci')
  @HttpCode(202)
  @Throttle(CINCO_POR_MINUTO)
  async esqueci(
    @Body(new ValidacaoZodPipe(esquemaSolicitarRedefinicao)) corpo: CorpoSolicitarRedefinicao,
    @IpDaRequisicao() ip: string | null,
  ) {
    await this.solicitarRedefinicao.executar({ email: corpo.email, ip });
    return { aceito: true };
  }

  @Post('senha/redefinir')
  @HttpCode(204)
  @Throttle(CINCO_POR_MINUTO)
  async redefinir(
    @Body(new ValidacaoZodPipe(esquemaConcluirRedefinicao)) corpo: CorpoConcluirRedefinicao,
    @IpDaRequisicao() ip: string | null,
  ): Promise<void> {
    await this.concluirRedefinicao.executar({
      token: corpo.token,
      novaSenha: corpo.novaSenha,
      codigo: corpo.codigo,
      ip,
    });
  }

  @Post('mfa/codigos')
  @HttpCode(200)
  @Throttle(CINCO_POR_MINUTO)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AutenticacaoGuard, PermissaoGuard)
  @RequerPermissao('identidade:escrever')
  regenerar(
    @Body(new ValidacaoZodPipe(esquemaRegenerarCodigos)) corpo: CorpoRegenerarCodigos,
    @ContextoAtual() ctx: ContextoDeAcesso,
    @IpDaRequisicao() ip: string | null,
  ) {
    return this.regenerarCodigos.executar({ ctx, codigoMfa: corpo.codigoMfa, ip });
  }

  @Post('mfa/reconfigurar')
  @HttpCode(200)
  @Throttle(CINCO_POR_MINUTO)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AutenticacaoGuard, PermissaoGuard)
  @RequerPermissao('identidade:escrever')
  reconfigurar(
    @Body(new ValidacaoZodPipe(esquemaIniciarReconfiguracao)) corpo: CorpoIniciarReconfiguracao,
    @ContextoAtual() ctx: ContextoDeAcesso,
    @IpDaRequisicao() ip: string | null,
  ) {
    return this.iniciarReconfiguracao.executar({ ctx, senhaAtual: corpo.senhaAtual, ip });
  }

  @Post('mfa/reconfigurar/confirmar')
  @HttpCode(200)
  @Throttle(CINCO_POR_MINUTO)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AutenticacaoGuard, PermissaoGuard)
  @RequerPermissao('identidade:escrever')
  confirmarReconfigurar(
    @Body(new ValidacaoZodPipe(esquemaConfirmarReconfiguracao)) corpo: CorpoConfirmarReconfiguracao,
    @ContextoAtual() ctx: ContextoDeAcesso,
    @IpDaRequisicao() ip: string | null,
  ) {
    return this.confirmarReconfiguracao.executar({ ctx, codigo: corpo.codigo, ip });
  }
}
