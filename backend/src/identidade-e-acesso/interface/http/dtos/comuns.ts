import { z } from 'zod';

export const esquemaUuid = z.uuid();

export const esquemaCodigoTotp = z.string().regex(/^\d{6}$/);

export const esquemaCodigoInformado = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('totp'), valor: esquemaCodigoTotp }).strict(),
  z.object({ tipo: z.literal('recuperacao'), valor: z.string().min(16).max(19) }).strict(),
]);

/** 32 bytes em base64url (refresh e token de redefinição). */
export const esquemaTokenOpaco = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Limite de 128 caracteres: evita DoS no Argon2. */
export const esquemaSenha = z.string().min(1).max(128);

/** O formato do e-mail é validado pelo domínio, para a resposta não revelar se a conta existe (RN-12). */
export const esquemaEmailBruto = z.string().max(254);

export const esquemaDesafio = z.string().min(1).max(2048);
