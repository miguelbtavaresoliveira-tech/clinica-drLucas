import type { RedefinirAcessoAdministrativo } from '../../application/index.js';
import { ErroDeDominio, SenhaFraca } from '../../domain/index.js';
import type { Terminal } from './terminal.js';

const PALAVRA_DE_CONFIRMACAO = 'REDEFINIR';

/** Último recurso (RN-36): exige confirmação explícita porque a ação é destrutiva. */
export async function executarRedefinicao(caso: RedefinirAcessoAdministrativo, t: Terminal): Promise<number> {
  t.escrever('Isto apaga o MFA, os códigos de recuperação e encerra todas as sessões.\n');
  const email = await t.perguntar('E-mail do usuário: ');
  const novaSenha = await t.perguntarSenha('Nova senha: ');
  const confirmacao = await t.perguntarSenha('Confirme a nova senha: ');
  if (novaSenha !== confirmacao) {
    t.erro('As senhas não conferem.');
    return 1;
  }
  const digitado = await t.perguntar(`Digite ${PALAVRA_DE_CONFIRMACAO} para confirmar: `);
  if (digitado.trim() !== PALAVRA_DE_CONFIRMACAO) {
    t.erro('Confirmação não digitada. Nada foi alterado.');
    return 1;
  }

  try {
    await caso.executar({ email, novaSenha });
    t.escrever('Acesso redefinido. No próximo login será preciso configurar o MFA novamente.\n');
    return 0;
  } catch (erro) {
    if (erro instanceof ErroDeDominio) {
      t.erro(erro.message);
      if (erro instanceof SenhaFraca) t.erro(`Motivos: ${erro.motivos.join(', ')}`);
      return 1;
    }
    t.erro('Falha inesperada.');
    return 1;
  }
}
