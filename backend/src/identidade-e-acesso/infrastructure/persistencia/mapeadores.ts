import {
  CodigoDeRecuperacao,
  Dispositivo,
  DispositivoId,
  Email,
  HashDeSenha,
  PLATAFORMAS,
  SegredoTotpCifrado,
  SessaoDeLogin,
  SessaoDeLoginId,
  Usuario,
  UsuarioId,
  papelPorNome,
  type MotivoRevogacaoDeSessao,
  type Plataforma,
  type SituacaoDaSessao,
  type SituacaoDoDispositivo,
  type SituacaoDoUsuario,
} from '../../domain/index.js';
import type { codigosDeRecuperacao, dispositivos, sessoesDeLogin, usuarios } from './schema.js';

const MOTIVOS_DE_REVOGACAO: readonly MotivoRevogacaoDeSessao[] = [
  'logout',
  'reutilizacao-de-refresh',
  'nova-sessao-no-dispositivo',
  'senha-alterada',
  'dispositivo-revogado',
  'usuario-desativado',
  'acesso-redefinido',
];

function escolher<T extends string>(valor: string, validos: readonly T[], campo: string): T {
  const encontrado = validos.find((v) => v === valor);
  if (encontrado === undefined) throw new Error(`Valor inválido no banco para ${campo}`);
  return encontrado;
}

export type LinhaDeUsuario = typeof usuarios.$inferSelect;
export type LinhaDeCodigo = typeof codigosDeRecuperacao.$inferSelect;
export type LinhaDeDispositivo = typeof dispositivos.$inferSelect;
export type LinhaDeSessao = typeof sessoesDeLogin.$inferSelect;

export function paraUsuario(linha: LinhaDeUsuario, codigos: LinhaDeCodigo[]): Usuario {
  return Usuario.reconstituir({
    id: UsuarioId.de(linha.id),
    nome: linha.nome,
    email: Email.criar(linha.email),
    situacao: escolher<SituacaoDoUsuario>(linha.situacao, ['ativo', 'desativado'], 'usuarios.situacao'),
    papeis: linha.papeis.map((p) => papelPorNome(p).nome),
    hashDeSenha: HashDeSenha.de(linha.hashDeSenha),
    senhaAlteradaEm: linha.senhaAlteradaEm,
    mfa:
      linha.mfaSegredoCifrado === null
        ? null
        : {
            segredo: SegredoTotpCifrado.de(linha.mfaSegredoCifrado),
            confirmadoEm: linha.mfaConfirmadoEm,
            ultimoPasso: linha.mfaUltimoPasso,
          },
    mfaPendente:
      linha.mfaSegredoPendenteCifrado === null ? null : SegredoTotpCifrado.de(linha.mfaSegredoPendenteCifrado),
    codigosDeRecuperacao: codigos.map((c) =>
      CodigoDeRecuperacao.reconstituir({ id: c.id, hash: c.hash, usadoEm: c.usadoEm, criadoEm: c.criadoEm }),
    ),
    tentativasFalhas: linha.tentativasFalhas,
    bloqueadoAte: linha.bloqueadoAte,
    criadoEm: linha.criadoEm,
    versao: linha.versao,
  });
}

export function dadosDoUsuario(u: Usuario): Omit<typeof usuarios.$inferInsert, 'versao'> {
  return {
    id: u.id.valor,
    nome: u.nome,
    email: u.email.valor,
    situacao: u.situacao,
    papeis: u.papeis,
    hashDeSenha: u.hashDeSenha.valor,
    senhaAlteradaEm: u.senhaAlteradaEm,
    mfaSegredoCifrado: u.mfa === null ? null : u.mfa.segredo.bytes(),
    mfaSegredoPendenteCifrado: u.mfaPendente === null ? null : u.mfaPendente.bytes(),
    mfaConfirmadoEm: u.mfa?.confirmadoEm ?? null,
    mfaUltimoPasso: u.mfa?.ultimoPasso ?? null,
    tentativasFalhas: u.tentativasFalhas,
    bloqueadoAte: u.bloqueadoAte,
    criadoEm: u.criadoEm,
  };
}

export function dadosDosCodigos(u: Usuario): (typeof codigosDeRecuperacao.$inferInsert)[] {
  return u.codigosDeRecuperacao.map((c) => ({
    id: c.id,
    usuarioId: u.id.valor,
    hash: c.hash,
    usadoEm: c.usadoEm,
    criadoEm: c.criadoEm,
  }));
}

export function paraDispositivo(linha: LinhaDeDispositivo): Dispositivo {
  return Dispositivo.reconstituir({
    id: DispositivoId.de(linha.id),
    usuarioId: UsuarioId.de(linha.usuarioId),
    apelido: linha.apelido,
    plataforma: escolher<Plataforma>(linha.plataforma, PLATAFORMAS, 'dispositivos.plataforma'),
    registradoEm: linha.registradoEm,
    ultimoCheckIn: linha.ultimoCheckin,
    biometriaHabilitada: linha.biometriaHabilitada,
    situacao: escolher<SituacaoDoDispositivo>(linha.situacao, ['ativo', 'revogado'], 'dispositivos.situacao'),
    revogadoEm: linha.revogadoEm,
    motivoRevogacao: linha.motivoRevogacao,
    chavePublicaAuditoria: linha.chavePublicaAuditoria,
    versao: linha.versao,
  });
}

export function dadosDoDispositivo(d: Dispositivo): Omit<typeof dispositivos.$inferInsert, 'versao'> {
  return {
    id: d.id.valor,
    usuarioId: d.usuarioId.valor,
    apelido: d.apelido,
    plataforma: d.plataforma,
    registradoEm: d.registradoEm,
    ultimoCheckin: d.ultimoCheckIn,
    biometriaHabilitada: d.biometriaHabilitada,
    situacao: d.situacao,
    revogadoEm: d.revogadoEm,
    motivoRevogacao: d.motivoRevogacao,
    chavePublicaAuditoria: d.chavePublicaAuditoria,
  };
}

export function paraSessaoDeLogin(linha: LinhaDeSessao): SessaoDeLogin {
  return SessaoDeLogin.reconstituir({
    id: SessaoDeLoginId.de(linha.id),
    usuarioId: UsuarioId.de(linha.usuarioId),
    dispositivoId: DispositivoId.de(linha.dispositivoId),
    refreshAtualHash: linha.refreshAtualHash,
    refreshAnteriorHash: linha.refreshAnteriorHash,
    criadaEm: linha.criadaEm,
    expiraEm: linha.expiraEm,
    situacao: escolher<SituacaoDaSessao>(linha.situacao, ['ativa', 'revogada'], 'sessoes_de_login.situacao'),
    revogadaEm: linha.revogadaEm,
    motivoRevogacao:
      linha.motivoRevogacao === null
        ? null
        : escolher(linha.motivoRevogacao, MOTIVOS_DE_REVOGACAO, 'sessoes_de_login.motivo_revogacao'),
    versao: linha.versao,
  });
}

export function dadosDaSessao(s: SessaoDeLogin): Omit<typeof sessoesDeLogin.$inferInsert, 'versao'> {
  return {
    id: s.id.valor,
    usuarioId: s.usuarioId.valor,
    dispositivoId: s.dispositivoId.valor,
    refreshAtualHash: s.refreshAtualHash,
    refreshAnteriorHash: s.refreshAnteriorHash,
    criadaEm: s.criadaEm,
    expiraEm: s.expiraEm,
    situacao: s.situacao,
    revogadaEm: s.revogadaEm,
    motivoRevogacao: s.motivoRevogacao,
  };
}
