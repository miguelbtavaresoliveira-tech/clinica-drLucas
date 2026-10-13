import { z } from 'zod';
import { esquemaCodigoTotp } from './comuns.js';

export const esquemaRevogarDispositivo = z
  .object({ motivo: z.string().min(3).max(200), codigoMfa: esquemaCodigoTotp })
  .strict();
export type CorpoRevogarDispositivo = z.infer<typeof esquemaRevogarDispositivo>;
