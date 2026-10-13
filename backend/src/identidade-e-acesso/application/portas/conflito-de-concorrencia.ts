export class ConflitoDeConcorrencia extends Error {
  readonly codigo = 'CONFLITO_DE_CONCORRENCIA';

  constructor() {
    super('Registro alterado por outra operação.');
    this.name = 'ConflitoDeConcorrencia';
  }
}
