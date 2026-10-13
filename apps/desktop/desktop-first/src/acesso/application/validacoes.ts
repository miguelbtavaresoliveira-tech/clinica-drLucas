// Validações de formulário. As regras definitivas são do servidor/Rust; aqui só damos
// retorno rápido ao usuário, com as mesmas regras do backend.

/** Mesma regex do backend (value object Email), após trim. */
export function ehEmailValido(v: string): boolean {
  const valor = v.trim();
  return valor.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export interface RegraDeSenha {
  chave: 'tamanho-minimo' | 'tamanho-maximo' | 'confere';
  ok: boolean;
  texto: string;
}

const MINIMO = 12;
const MAXIMO = 128;

/** Conta code points (emoji vale 1), como o domínio do servidor. */
export function regrasDaSenhaMestre(senha: string, confirmacao: string): RegraDeSenha[] {
  const tamanho = [...senha].length;
  return [
    { chave: 'tamanho-minimo', ok: tamanho >= MINIMO, texto: `Pelo menos ${String(MINIMO)} caracteres` },
    { chave: 'tamanho-maximo', ok: tamanho <= MAXIMO, texto: `No máximo ${String(MAXIMO)} caracteres` },
    { chave: 'confere', ok: senha.length > 0 && senha === confirmacao, texto: 'As duas senhas conferem' },
  ];
}

export function somenteDigitos(v: string, max = 6): string {
  return v.replace(/\D/g, '').slice(0, max);
}

export function ehCodigoTotp(v: string): boolean {
  return /^\d{6}$/.test(v);
}

export function ehCodigoDeRecuperacao(v: string): boolean {
  return /^[0-9A-Z]{16}$/.test(v.replace(/[-\s]/g, '').toUpperCase());
}
