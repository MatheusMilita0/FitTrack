import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isValidCrefFormat,
  validarCrefExterno,
} from "../server/services/crefService.js";

const professional = {
  cref: "123456-G/SP",
  nome: "Personal Teste",
  area_formacao: "Educação Física",
};
function provider(body, status = 200) {
  vi.stubEnv("CREF_SERVICE_URL", "https://cref.example/consulta");
  vi.stubEnv("CREF_MODE", "provider");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      })
  );
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("RN05: confirmação externa do registro profissional", () => {
  it.each(["CREF-TX-100", "PEND", "OFFLINE", "INVALIDO", "123456-G/1P"])(
    "rejeita %s também no ambiente de testes",
    value => {
      expect(isValidCrefFormat(value)).toBe(false);
    }
  );
  it("aceita um registro formatado sem confundir formato com aprovação", async () => {
    vi.stubEnv("CREF_SERVICE_URL", "");
    expect(isValidCrefFormat(professional.cref)).toBe(true);
    expect(await validarCrefExterno(professional)).toMatchObject({
      status: "Pendente",
      mock: true,
    });
  });
  it.each(["false", "true", 0, 1, null, {}, []])(
    "não aprova valores ativo fora do contrato: %j",
    async ativo => {
      provider({ ativo });
      expect(await validarCrefExterno(professional)).toMatchObject({
        status: "Indisponivel",
        mock: false,
      });
    }
  );
  it("mantém indisponibilidade quando a resposta não confirma um estado", async () => {
    provider({ situacao: "Em análise" });
    expect((await validarCrefExterno(professional)).status).toBe(
      "Indisponivel"
    );
  });
  it.each([400, 401, 403, 429, 500])(
    "não aprova a resposta HTTP %s mesmo com ativo=true",
    async status => {
      provider({ ativo: true }, status);
      expect((await validarCrefExterno(professional)).status).toBe(
        "Indisponivel"
      );
    }
  );
  it.each([
    [true, "Validado"],
    [false, "Rejeitado"],
  ])("interpreta ativo=%s como %s", async (ativo, status) => {
    provider({ ativo, situacao: "Resposta do provedor" });
    expect(await validarCrefExterno(professional)).toMatchObject({
      status,
      mock: false,
    });
  });
  it("interpreta registro não encontrado como rejeição", async () => {
    provider({}, 404);
    expect((await validarCrefExterno(professional)).status).toBe("Rejeitado");
  });
});
