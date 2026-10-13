import type { CalculadoraDeHash, RepositoriosDaTransacao } from '../../application/portas/index.js';
import type { ExecutorDrizzle } from './executor.js';
import { AuditoriaRepositorioDrizzle } from './repositorios/auditoria-repositorio-drizzle.js';
import { DesafioDeLoginRepositorioDrizzle } from './repositorios/desafio-de-login-repositorio-drizzle.js';
import { DispositivoRepositorioDrizzle } from './repositorios/dispositivo-repositorio-drizzle.js';
import { SessaoDeLoginRepositorioDrizzle } from './repositorios/sessao-de-login-repositorio-drizzle.js';
import { TokenDeRedefinicaoRepositorioDrizzle } from './repositorios/token-de-redefinicao-repositorio-drizzle.js';
import { UsuarioRepositorioDrizzle } from './repositorios/usuario-repositorio-drizzle.js';

export function criarRepositorios(exec: ExecutorDrizzle, hash: CalculadoraDeHash): RepositoriosDaTransacao {
  return {
    usuarios: new UsuarioRepositorioDrizzle(exec),
    dispositivos: new DispositivoRepositorioDrizzle(exec),
    sessoes: new SessaoDeLoginRepositorioDrizzle(exec),
    desafios: new DesafioDeLoginRepositorioDrizzle(exec),
    tokensDeRedefinicao: new TokenDeRedefinicaoRepositorioDrizzle(exec),
    auditoria: new AuditoriaRepositorioDrizzle(exec, hash),
  };
}
