import { z } from 'zod';
import { esquemaUuid } from './comuns.js';

const hashHex = z.string().regex(/^[0-9a-f]{64}$/);

export const esquemaRegistroRecebido = z
  .object({
    id: esquemaUuid,
    ocorridoEm: z.string().max(30),
    tipo: z.string().max(60),
    usuarioId: esquemaUuid,
    dispositivoId: esquemaUuid,
    detalhe: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    hashAnterior: hashHex.nullable(),
    hash: hashHex,
    assinatura: z.string().max(100).regex(/^[A-Za-z0-9+/]+=*$/),
  })
  .strict();

export const esquemaLoteDeAuditoria = z
  .object({ registros: z.array(esquemaRegistroRecebido).min(1).max(500) })
  .strict();
export type CorpoLoteDeAuditoria = z.infer<typeof esquemaLoteDeAuditoria>;
