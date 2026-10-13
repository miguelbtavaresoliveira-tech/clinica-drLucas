import { UltimoProprietario } from '../erros.js';
import type { Usuario } from '../usuario/usuario.js';

export class PoliticaDeProprietario {
  garantirQuePodeDesativar(usuario: Usuario, proprietariosAtivos: number): void {
    if (usuario.ehProprietarioAtivo() && proprietariosAtivos <= 1) throw new UltimoProprietario();
  }
}
