import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ListarDispositivos, RevogarDispositivo } from '../../../application/index.js';
import type { ContextoDeAcesso } from '../../../domain/index.js';
import { apresentarDispositivos } from '../apresentadores.js';
import { ContextoAtual } from '../decorators/contexto-atual.js';
import { IpDaRequisicao } from '../decorators/ip-da-requisicao.js';
import { RequerPermissao } from '../decorators/requer-permissao.js';
import { esquemaUuid } from '../dtos/comuns.js';
import { esquemaRevogarDispositivo, type CorpoRevogarDispositivo } from '../dtos/dispositivos.dtos.js';
import { AutenticacaoGuard } from '../guards/autenticacao.guard.js';
import { PermissaoGuard } from '../guards/permissao.guard.js';
import { ValidacaoZodPipe } from '../pipes/validacao-zod.pipe.js';

@Controller('dispositivos')
@UseGuards(AutenticacaoGuard, PermissaoGuard)
export class DispositivosController {
  constructor(
    private readonly listarDispositivos: ListarDispositivos,
    private readonly revogarDispositivo: RevogarDispositivo,
  ) {}

  @Get()
  @RequerPermissao('identidade:ler')
  async listar(@ContextoAtual() ctx: ContextoDeAcesso) {
    return apresentarDispositivos(await this.listarDispositivos.executar({ ctx }));
  }

  @Post(':id/revogar')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @RequerPermissao('identidade:administrar')
  async revogar(
    @Param('id', new ValidacaoZodPipe(esquemaUuid)) id: string,
    @Body(new ValidacaoZodPipe(esquemaRevogarDispositivo)) corpo: CorpoRevogarDispositivo,
    @ContextoAtual() ctx: ContextoDeAcesso,
    @IpDaRequisicao() ip: string | null,
  ): Promise<void> {
    await this.revogarDispositivo.executar({ ctx, dispositivoId: id, motivo: corpo.motivo, codigoMfa: corpo.codigoMfa, ip });
  }
}
