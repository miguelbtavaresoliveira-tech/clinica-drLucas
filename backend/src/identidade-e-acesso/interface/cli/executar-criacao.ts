import type { CriarPrimeiroProprietario } from '../../application/index.js';
import { ErroDeDominio, SenhaFraca } from '../../domain/index.js';
import type { Terminal } from './terminal.js';

/** Devolve o código de saída do processo (0 = sucesso). */
export async function executarCriacao(caso: CriarPrimeiroProprietario, t: Terminal): Promise<number> {
  const nome = await t.perguntar('Nome: ');
  const email = await t.perguntar('E-mail: ');
  const senha = await t.perguntarSenha('Senha: ');
  const confirmacao = await t.perguntarSenha('Confirme a senha: ');
  if (senha !== confirmacao) {
    t.erro('As senhas não conferem.');
    return 1;
  }

  try {
    const { usuarioId } = await caso.executar({ nome, email, senha });
    t.escrever(`Proprietário criado: ${usuarioId}\n`);
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
