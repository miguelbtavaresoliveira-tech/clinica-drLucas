import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DesativarUsuario } from '../../../application/index.js';
import type { ContextoDeAcesso } from '../../../domain/index.js';
import { ContextoAtual } from '../decorators/contexto-atual.js';
import { IpDaRequisicao } from '../decorators/ip-da-requisicao.js';
import { RequerPermissao } from '../decorators/requer-permissao.js';
import { esquemaUuid } from '../dtos/comuns.js';
import { AutenticacaoGuard } from '../guards/autenticacao.guard.js';
import { PermissaoGuard } from '../guards/permissao.guard.js';
import { ValidacaoZodPipe } from '../pipes/validacao-zod.pipe.js';

@Controller('usuarios')
@UseGuards(AutenticacaoGuard, PermissaoGuard)
export class UsuariosController {
  constructor(private readonly desativarUsuario: DesativarUsuario) {}

  @Post(':id/desativar')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @RequerPermissao('identidade:administrar')
  async desativar(
    @Param('id', new ValidacaoZodPipe(esquemaUuid)) id: string,
    @ContextoAtual() ctx: ContextoDeAcesso,
    @IpDaRequisicao() ip: string | null,
  ): Promise<void> {
    await this.desativarUsuario.executar({ ctx, usuarioId: id, ip });
  }
}
