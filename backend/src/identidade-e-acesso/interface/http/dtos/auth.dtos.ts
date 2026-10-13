import { z } from 'zod';
import {
  esquemaCodigoInformado,
  esquemaCodigoTotp,
  esquemaDesafio,
  esquemaEmailBruto,
  esquemaSenha,
  esquemaTokenOpaco,
  esquemaUuid,
} from './comuns.js';

export const esquemaIniciarLogin = z.object({ email: esquemaEmailBruto, senha: esquemaSenha }).strict();
export type CorpoIniciarLogin = z.infer<typeof esquemaIniciarLogin>;

export const esquemaGerarSegredo = z.object({ desafio: esquemaDesafio }).strict();
export type CorpoGerarSegredo = z.infer<typeof esquemaGerarSegredo>;

export const esquemaConfirmarMfa = z.object({ desafio: esquemaDesafio, codigo: esquemaCodigoTotp }).strict();
export type CorpoConfirmarMfa = z.infer<typeof esquemaConfirmarMfa>;

export const esquemaConcluirLogin = z
  .object({
    desafio: esquemaDesafio,
    codigo: esquemaCodigoInformado,
    dispositivo: z
      .object({
        id: esquemaUuid.nullable(),
        apelido: z.string().min(1).max(60),
        plataforma: z.enum(['macos', 'windows']),
        chavePublicaAuditoria: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
      })
      .strict(),
  })
  .strict();
export type CorpoConcluirLogin = z.infer<typeof esquemaConcluirLogin>;

export const esquemaRenovarSessao = z
  .object({ refreshToken: esquemaTokenOpaco, dispositivoId: esquemaUuid })
  .strict();
export type CorpoRenovarSessao = z.infer<typeof esquemaRenovarSessao>;

export const esquemaTrocarSenha = z.object({ senhaAtual: esquemaSenha, novaSenha: esquemaSenha }).strict();
export type CorpoTrocarSenha = z.infer<typeof esquemaTrocarSenha>;

export const esquemaSolicitarRedefinicao = z.object({ email: esquemaEmailBruto }).strict();
export type CorpoSolicitarRedefinicao = z.infer<typeof esquemaSolicitarRedefinicao>;

export const esquemaConcluirRedefinicao = z
  .object({ token: esquemaTokenOpaco, novaSenha: esquemaSenha, codigo: esquemaCodigoInformado })
  .strict();
export type CorpoConcluirRedefinicao = z.infer<typeof esquemaConcluirRedefinicao>;

export const esquemaRegenerarCodigos = z.object({ codigoMfa: esquemaCodigoTotp }).strict();
export type CorpoRegenerarCodigos = z.infer<typeof esquemaRegenerarCodigos>;

export const esquemaIniciarReconfiguracao = z.object({ senhaAtual: esquemaSenha }).strict();
export type CorpoIniciarReconfiguracao = z.infer<typeof esquemaIniciarReconfiguracao>;

export const esquemaConfirmarReconfiguracao = z.object({ codigo: esquemaCodigoTotp }).strict();
export type CorpoConfirmarReconfiguracao = z.infer<typeof esquemaConfirmarReconfiguracao>;
