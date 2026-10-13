import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Valida o corpo/parâmetro com zod. A resposta de erro lista só os CAMINHOS dos campos inválidos,
 * nunca os valores enviados (que podem ser senhas, códigos ou tokens).
 */
export class ValidacaoZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(valor: unknown): T {
    const resultado = this.schema.safeParse(valor);
    if (resultado.success) return resultado.data;

    const campos = new Set<string>();
    for (const problema of resultado.error.issues) {
      const base = problema.path.map(String);
      if (problema.code === 'unrecognized_keys') {
        for (const chave of problema.keys) campos.add([...base, chave].join('.'));
      } else {
        campos.add(base.length === 0 ? '(corpo)' : base.join('.'));
      }
    }
    throw new BadRequestException({
      erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Requisição inválida.', campos: [...campos] },
    });
  }
}
