import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { DesafioInvalido, SessaoExpirada, UsuarioId } from '../../domain/index.js';
import type { DadosDoAccess, EmissorDeTokens, Relogio } from '../../application/portas/index.js';

export interface ConfiguracaoDoEmissor {
  accessSegredo: string;
  desafioSegredo: string;
}

const EMISSOR = 'clinica-api';
const AUDIENCE_ACCESS = 'clinica-desktop';
const AUDIENCE_DESAFIO = 'clinica-login';

const esquemaAccess = z.object({
  sub: z.uuid(),
  did: z.uuid(),
  sid: z.uuid(),
  pap: z.array(z.enum(['proprietario'])).min(1),
  typ: z.literal('access'),
});

const esquemaDesafio = z.object({
  sub: z.uuid(),
  jti: z.uuid(),
  typ: z.literal('desafio'),
});

const segundos = (d: Date): number => Math.floor(d.getTime() / 1000);
const sha256Hex = (texto: string): string => createHash('sha256').update(texto, 'utf8').digest('hex');

export class JwtEmissorDeTokens implements EmissorDeTokens {
  constructor(
    private readonly config: ConfiguracaoDoEmissor,
    private readonly relogio: Relogio,
    private readonly jwt: JwtService = new JwtService(),
  ) {}

  emitirAccess(d: DadosDoAccess, expiraEm: Date): string {
    return this.jwt.sign(
      {
        sub: d.usuarioId,
        did: d.dispositivoId,
        sid: d.sessaoId,
        pap: d.papeis,
        typ: 'access',
        iat: segundos(this.relogio.agora()),
        exp: segundos(expiraEm),
      },
      { secret: this.config.accessSegredo, algorithm: 'HS256', issuer: EMISSOR, audience: AUDIENCE_ACCESS },
    );
  }

  verificarAccess(token: string): DadosDoAccess {
    try {
      const carga: unknown = this.jwt.verify(token, {
        secret: this.config.accessSegredo,
        algorithms: ['HS256'],
        issuer: EMISSOR,
        audience: AUDIENCE_ACCESS,
        clockTimestamp: segundos(this.relogio.agora()),
      });
      const c = esquemaAccess.parse(carga);
      return { usuarioId: c.sub, dispositivoId: c.did, sessaoId: c.sid, papeis: c.pap };
    } catch {
      throw new SessaoExpirada();
    }
  }

  gerarTokenOpaco(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: sha256Hex(token) };
  }

  hashDe(token: string): string {
    return sha256Hex(token);
  }

  emitirDesafio(usuarioId: UsuarioId, expiraEm: Date): { id: string; token: string } {
    const id = randomUUID();
    const token = this.jwt.sign(
      {
        sub: usuarioId.valor,
        jti: id,
        typ: 'desafio',
        iat: segundos(this.relogio.agora()),
        exp: segundos(expiraEm),
      },
      { secret: this.config.desafioSegredo, algorithm: 'HS256', issuer: EMISSOR, audience: AUDIENCE_DESAFIO },
    );
    return { id, token };
  }

  verificarDesafio(token: string): { id: string; usuarioId: UsuarioId } {
    try {
      const carga: unknown = this.jwt.verify(token, {
        secret: this.config.desafioSegredo,
        algorithms: ['HS256'],
        issuer: EMISSOR,
        audience: AUDIENCE_DESAFIO,
        clockTimestamp: segundos(this.relogio.agora()),
      });
      const c = esquemaDesafio.parse(carga);
      return { id: c.jti, usuarioId: UsuarioId.de(c.sub) };
    } catch {
      throw new DesafioInvalido();
    }
  }
}
