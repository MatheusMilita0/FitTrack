import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "../client/src/lib/api.js";

describe("FitTrack Client API Module (client/src/lib/api.js)", () => {
  let originalFetch;
  let mockFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("deve sempre incluir credentials: 'same-origin' em todas as chamadas de autenticação", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ user: { id: 1, nome: "Aluno Teste" }, profile: {} }),
    });

    const res = await api.getMe();
    expect(res.user.nome).toBe("Aluno Teste");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledConfig] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("/api/auth/me");
    expect(calledConfig.credentials).toBe("same-origin");
  });

  it("deve autenticar com credenciais corretas via POST /api/auth/login", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message: "Autenticação realizada com sucesso.",
        user: { id: 2, nome: "Instrutor", tipo: "personal" },
      }),
    });

    const payload = { identifier: "instrutor@fittrack.com", senha: "senhaValida123" };
    const res = await api.login(payload);

    expect(res.user.tipo).toBe("personal");
    const [calledUrl, calledConfig] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("/api/auth/login");
    expect(calledConfig.method).toBe("POST");
    expect(calledConfig.credentials).toBe("same-origin");
    expect(JSON.parse(calledConfig.body)).toEqual(payload);
    expect(calledConfig.headers["Content-Type"]).toBe("application/json");
  });

  it("deve propagar mensagens de erro reais da API quando status for 401 ou 403", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ error: "Credenciais inválidas." }),
    });

    await expect(
      api.login({ identifier: "invalido@fittrack.com", senha: "errada" })
    ).rejects.toThrow("Credenciais inválidas.");
  });

  it("deve enviar dados de hidratação cumulativa via POST /api/aluno/hidratacao", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message: "Hidratação registrada com sucesso.",
        nutricao: { agua_ml: 1500 },
      }),
    });

    const res = await api.registrarHidratacao(250);
    expect(res.nutricao.agua_ml).toBe(1500);

    const [calledUrl, calledConfig] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("/api/aluno/hidratacao");
    expect(calledConfig.method).toBe("POST");
    expect(calledConfig.credentials).toBe("same-origin");
    expect(JSON.parse(calledConfig.body)).toEqual({ incremento_ml: 250 });
  });

  it("deve registrar refeição com macros reais via POST /api/aluno/refeicoes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message: "Refeição adicionada com sucesso.",
        nutricao: { calorias_consumidas: 650 },
      }),
    });

    const meal = {
      titulo: "Almoço",
      itens: "Frango grelhado e arroz integral",
      kcal: 650,
      proteinas: 45,
      carboidratos: 60,
      gorduras: 12,
    };

    const res = await api.adicionarRefeicao(meal);
    expect(res.nutricao.calorias_consumidas).toBe(650);

    const [calledUrl, calledConfig] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("/api/aluno/refeicoes");
    expect(calledConfig.method).toBe("POST");
    expect(JSON.parse(calledConfig.body)).toEqual(meal);
  });

  it("deve salvar execução de treino com séries completadas via POST /api/aluno/treinos/execucao", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message: "Execução de treino salva com sucesso.",
        execucao: { id: 10, duracao_segundos: 2400 },
      }),
    });

    const execPayload = {
      treino_id: 1,
      duracao_segundos: 2400,
      series_executadas: [
        { nome: "Supino Reto", serie: 1, carga: "70", reps: "10", concluido: true },
      ],
    };

    const res = await api.salvarExecucaoTreino(execPayload);
    expect(res.execucao.id).toBe(10);

    const [calledUrl, calledConfig] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("/api/aluno/treinos/execucao");
    expect(JSON.parse(calledConfig.body)).toEqual(execPayload);
  });

  it("deve expor indisponibilidade honesta (501) para recuperação de senha", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 501,
      statusText: "Not Implemented",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        error:
          "Serviço de recuperação de senha por e-mail ainda não integrado neste incremento.",
      }),
    });

    await expect(api.recuperarSenha("aluno@fittrack.com")).rejects.toThrow(
      "Serviço de recuperação de senha por e-mail ainda não integrado neste incremento."
    );
  });

  it("deve enviar mensagens isoladas no chat entre pares autorizados via POST /api/chat/mensagens", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message: "Mensagem enviada com sucesso.",
        mensagem: { id: 42, texto: "Bom treino!" },
      }),
    });

    const msgPayload = {
      destinatario_id: 5,
      texto: "Bom treino!",
      tipo: "texto",
      video_url: null,
    };

    const res = await api.enviarMensagem(msgPayload);
    expect(res.mensagem.id).toBe(42);

    const [calledUrl, calledConfig] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("/api/chat/mensagens");
    expect(calledConfig.method).toBe("POST");
    expect(JSON.parse(calledConfig.body)).toEqual(msgPayload);
  });

  it("deve permitir ao administrador alterar status e validar CREF via PATCH", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message: "Status do usuário atualizado para 'Bloqueado'.",
      }),
    });

    await api.atualizarStatusUsuario(7, "Bloqueado");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/admin/usuarios/7/status");
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      status: "Bloqueado",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        message: "CREF do personal atualizado para 'Validado'.",
      }),
    });

    await api.validarCrefPersonal(7, "Validado");
    expect(mockFetch.mock.calls[1][0]).toBe("/api/admin/personais/7/validar-cref");
    expect(mockFetch.mock.calls[1][1].method).toBe("PATCH");
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
      status_cref: "Validado",
    });
  });
});
