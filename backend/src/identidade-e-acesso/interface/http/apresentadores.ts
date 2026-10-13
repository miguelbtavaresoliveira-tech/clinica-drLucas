import type {
  ItemDeDispositivo,
  SaidaConcluirLogin,
  SaidaIniciarLogin,
  SaidaRenovarSessao,
} from '../../application/index.js';
import type { PoliticaDeAcesso } from '../../domain/index.js';

export function apresentarPolitica(p: PoliticaDeAcesso) {
  return {
    inatividadeMin: p.inatividadeMin,
    limiteDiasOffline: p.limiteDiasOffline,
    leituraPermitidaAposLimite: p.leituraPermitidaAposLimite,
    maxTentativasLogin: p.maxTentativasLogin,
    bloqueioProgressivoMin: [...p.bloqueioProgressivoMin],
    maxDispositivosAtivos: p.maxDispositivosAtivos,
    tamanhoMinimoSenha: p.tamanhoMinimoSenha,
    validadeAccessMin: p.validadeAccessMin,
    validadeRefreshDias: p.validadeRefreshDias,
    janelaReautenticacaoMin: p.janelaReautenticacaoMin,
    maxFalhasDesbloqueioLocal: p.maxFalhasDesbloqueioLocal,
  };
}

export function apresentarIniciarLogin(s: SaidaIniciarLogin) {
  return { desafio: s.desafio, mfa: s.mfa, expiraEm: s.expiraEm.toISOString() };
}

export function apresentarConcluirLogin(s: SaidaConcluirLogin) {
  return {
    accessToken: s.accessToken,
    accessExpiraEm: s.accessExpiraEm.toISOString(),
    refreshToken: s.refreshToken,
    dispositivoId: s.dispositivoId,
    politica: apresentarPolitica(s.politica),
    usuario: { id: s.usuario.id, nome: s.usuario.nome, email: s.usuario.email, papeis: [...s.usuario.papeis] },
    usouCodigoDeRecuperacao: s.usouCodigoDeRecuperacao,
    codigosRestantes: s.codigosRestantes,
  };
}

export function apresentarRenovarSessao(s: SaidaRenovarSessao) {
  return {
    accessToken: s.accessToken,
    accessExpiraEm: s.accessExpiraEm.toISOString(),
    refreshToken: s.refreshToken,
    politica: apresentarPolitica(s.politica),
  };
}

export function apresentarDispositivos(itens: readonly ItemDeDispositivo[]) {
  return {
    dispositivos: itens.map((i) => ({
      id: i.id,
      apelido: i.apelido,
      plataforma: i.plataforma,
      registradoEm: i.registradoEm.toISOString(),
      ultimoCheckIn: i.ultimoCheckIn.toISOString(),
      situacao: i.situacao,
      revogadoEm: i.revogadoEm === null ? null : i.revogadoEm.toISOString(),
      atual: i.atual,
    })),
  };
}
