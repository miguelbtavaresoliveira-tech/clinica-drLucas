import { createMemoryHistory } from "vue-router";
import { describe, expect, it } from "vitest";
import { criarRoteador } from "./index";

const tabela: Array<[string, string]> = [
  ["/", "inicio"],
  ["/entrar", "login"],
  ["/entrar/mfa/configurar", "mfa-configurar"],
  ["/entrar/mfa/verificar", "mfa-verificar"],
  ["/redefinir-senha", "redefinir-senha"],
  ["/senha-mestre/definir", "definir-senha-mestre"],
  ["/desbloquear", "desbloqueio"],
  ["/dispositivos", "dispositivos"],
  ["/seguranca", "seguranca"],
  ["/conectar", "conectar"],
  ["/dispositivo-revogado", "dispositivo-revogado"],
];

describe("rotas", () => {
  it.each(tabela)("%s resolve para %s", (caminho, nome) => {
    const roteador = criarRoteador(createMemoryHistory());
    expect(roteador.resolve(caminho).name).toBe(nome);
  });

  it("redireciona caminho desconhecido para inicio", async () => {
    const roteador = criarRoteador(createMemoryHistory());
    await roteador.push("/xyz");
    expect(roteador.currentRoute.value.name).toBe("inicio");
  });

  it("redireciona caminho aninhado desconhecido para inicio", async () => {
    const roteador = criarRoteador(createMemoryHistory());
    await roteador.push("/a/b/c");
    expect(roteador.currentRoute.value.name).toBe("inicio");
  });

  it("não define nomes de rota duplicados", () => {
    const nomes = tabela.map(([, nome]) => nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
