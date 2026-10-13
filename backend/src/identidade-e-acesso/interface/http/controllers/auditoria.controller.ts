import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReceberAuditoriaDoApp } from '../../../application/index.js';
import type { ContextoDeAcesso } from '../../../domain/index.js';
import { ContextoAtual } from '../decorators/contexto-atual.js';
import { IpDaRequisicao } from '../decorators/ip-da-requisicao.js';
import { esquemaLoteDeAuditoria, type CorpoLoteDeAuditoria } from '../dtos/auditoria.dtos.js';
import { AutenticacaoGuard } from '../guards/autenticacao.guard.js';
import { PermissaoGuard } from '../guards/permissao.guard.js';
import { ValidacaoZodPipe } from '../pipes/validacao-zod.pipe.js';

@Controller('auditoria')
@UseGuards(AutenticacaoGuard, PermissaoGuard)
export class AuditoriaController {
  constructor(private readonly receberAuditoria: ReceberAuditoriaDoApp) {}

  /** Recebe o lote do app: hash, encadeamento e assinatura Ed25519 são verificados no caso de uso. */
  @Post('lote')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  lote(
    @Body(new ValidacaoZodPipe(esquemaLoteDeAuditoria)) corpo: CorpoLoteDeAuditoria,
    @ContextoAtual() ctx: ContextoDeAcesso,
    @IpDaRequisicao() ip: string | null,
  ) {
    return this.receberAuditoria.executar({ ctx, registros: corpo.registros, ip });
  }
}
