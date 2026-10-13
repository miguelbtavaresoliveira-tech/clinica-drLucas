export abstract class ErroDeDominio extends Error {
  abstract readonly codigo: string;

  protected constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
  }
}
