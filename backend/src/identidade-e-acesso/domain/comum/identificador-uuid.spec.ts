import { describe, expect, it } from 'vitest';
import { DispositivoId } from '../dispositivo/dispositivo-id.js';
import { IdentificadorInvalido } from '../erros.js';
import { UsuarioId } from '../usuario/usuario-id.js';
import { REGEX_UUID } from './identificador-uuid.js';

const UUID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

describe('IdentificadorUuid', () => {
  it('novo() gera valores diferentes e válidos', () => {
    const a = UsuarioId.novo();
    const b = UsuarioId.novo();
    expect(a.valor).not.toBe(b.valor);
    expect(REGEX_UUID.test(a.valor)).toBe(true);
  });

  it('de() normaliza maiúsculas para minúsculas', () => {
    expect(UsuarioId.de(UUID.toUpperCase()).valor).toBe(UUID);
  });

  it.each(['', 'abc', '00000000-0000-0000-0000-000000000000', '3f2b8c1e-5a4d-4e6f-8a9b-0c1d 2e3f4a5b'])(
    'de() rejeita %j',
    (entrada) => {
      expect(() => UsuarioId.de(entrada)).toThrow(IdentificadorInvalido);
    },
  );

  it('igual() compara tipo e valor', () => {
    expect(UsuarioId.de(UUID).igual(UsuarioId.de(UUID))).toBe(true);
    expect(UsuarioId.de(UUID).igual(DispositivoId.de(UUID))).toBe(false);
  });

  it('toString() devolve o valor', () => {
    expect(String(UsuarioId.de(UUID))).toBe(UUID);
  });
});
