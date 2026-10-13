import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  index,
  inet,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DetalheDeAuditoria } from '../../application/auditoria/registro-de-auditoria.js';

export const identidade = pgSchema('identidade');

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (v) => Buffer.from(v),
  fromDriver: (v) => new Uint8Array(v),
});

const instante = (nome: string) => timestamp(nome, { withTimezone: true, mode: 'date' });

export const usuarios = identidade.table(
  'usuarios',
  {
    id: uuid('id').primaryKey(),
    nome: text('nome').notNull(),
    email: text('email').notNull().unique(),
    situacao: text('situacao').notNull().default('ativo'),
    papeis: text('papeis').array().notNull(),
    hashDeSenha: text('hash_de_senha').notNull(),
    senhaAlteradaEm: instante('senha_alterada_em').notNull(),
    mfaSegredoCifrado: bytea('mfa_segredo_cifrado'),
    mfaSegredoPendenteCifrado: bytea('mfa_segredo_pendente_cifrado'),
    mfaConfirmadoEm: instante('mfa_confirmado_em'),
    mfaUltimoPasso: bigint('mfa_ultimo_passo', { mode: 'number' }),
    tentativasFalhas: integer('tentativas_falhas').notNull().default(0),
    bloqueadoAte: instante('bloqueado_ate'),
    criadoEm: instante('criado_em').notNull(),
    versao: integer('versao').notNull().default(1),
  },
  (t) => [check('usuarios_situacao_valida', sql`${t.situacao} in ('ativo', 'desativado')`)],
);

export const codigosDeRecuperacao = identidade.table(
  'codigos_de_recuperacao',
  {
    id: uuid('id').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    hash: text('hash').notNull(),
    usadoEm: instante('usado_em'),
    criadoEm: instante('criado_em').notNull(),
  },
  (t) => [index('codigos_de_recuperacao_usuario_idx').on(t.usuarioId)],
);

export const dispositivos = identidade.table(
  'dispositivos',
  {
    id: uuid('id').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    apelido: text('apelido').notNull(),
    plataforma: text('plataforma').notNull(),
    registradoEm: instante('registrado_em').notNull(),
    ultimoCheckin: instante('ultimo_checkin').notNull(),
    biometriaHabilitada: boolean('biometria_habilitada').notNull().default(false),
    situacao: text('situacao').notNull().default('ativo'),
    revogadoEm: instante('revogado_em'),
    motivoRevogacao: text('motivo_revogacao'),
    chavePublicaAuditoria: text('chave_publica_auditoria').notNull(),
    versao: integer('versao').notNull().default(1),
  },
  (t) => [
    index('dispositivos_usuario_idx').on(t.usuarioId),
    check('dispositivos_plataforma_valida', sql`${t.plataforma} in ('macos', 'windows')`),
    check('dispositivos_situacao_valida', sql`${t.situacao} in ('ativo', 'revogado')`),
  ],
);

export const sessoesDeLogin = identidade.table(
  'sessoes_de_login',
  {
    id: uuid('id').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    dispositivoId: uuid('dispositivo_id')
      .notNull()
      .references(() => dispositivos.id),
    refreshAtualHash: text('refresh_atual_hash').notNull(),
    refreshAnteriorHash: text('refresh_anterior_hash'),
    criadaEm: instante('criada_em').notNull(),
    expiraEm: instante('expira_em').notNull(),
    situacao: text('situacao').notNull().default('ativa'),
    revogadaEm: instante('revogada_em'),
    motivoRevogacao: text('motivo_revogacao'),
    versao: integer('versao').notNull().default(1),
  },
  (t) => [
    uniqueIndex('uma_sessao_ativa_por_dispositivo')
      .on(t.dispositivoId)
      .where(sql`${t.situacao} = 'ativa'`),
    index('sessoes_de_login_usuario_idx').on(t.usuarioId),
    index('sessoes_de_login_refresh_atual_idx').on(t.refreshAtualHash),
    index('sessoes_de_login_refresh_anterior_idx').on(t.refreshAnteriorHash),
    check('sessoes_de_login_situacao_valida', sql`${t.situacao} in ('ativa', 'revogada')`),
  ],
);

export const desafiosDeLogin = identidade.table('desafios_de_login', {
  id: uuid('id').primaryKey(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  expiraEm: instante('expira_em').notNull(),
  usadoEm: instante('usado_em'),
});

export const tokensDeRedefinicao = identidade.table(
  'tokens_de_redefinicao',
  {
    hash: text('hash').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    expiraEm: instante('expira_em').notNull(),
    usadoEm: instante('usado_em'),
  },
  (t) => [index('tokens_de_redefinicao_usuario_idx').on(t.usuarioId)],
);

export const auditoriaDeAcesso = identidade.table(
  'auditoria_de_acesso',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ocorridoEm: instante('ocorrido_em').notNull(),
    tipo: text('tipo').notNull(),
    usuarioId: uuid('usuario_id'),
    dispositivoId: uuid('dispositivo_id'),
    origem: text('origem').notNull(),
    ip: inet('ip'),
    detalhe: jsonb('detalhe').$type<DetalheDeAuditoria>().notNull().default({}),
    hashAnterior: text('hash_anterior'),
    hash: text('hash').notNull(),
    assinatura: text('assinatura'),
    idOrigem: uuid('id_origem').notNull().unique(),
  },
  (t) => [
    index('auditoria_de_acesso_dispositivo_idx').on(t.dispositivoId, t.id),
    check('auditoria_de_acesso_origem_valida', sql`${t.origem} in ('servidor', 'app')`),
  ],
);
