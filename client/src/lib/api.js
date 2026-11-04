"use strict";

/**
 * Cliente HTTP para a API REST do FitTrack.
 * Regras inegociáveis:
 * - Sessão exclusivamente via cookie HttpOnly (credentials: 'same-origin')
 * - Sem persistência de senhas em localStorage, sessionStorage ou bundle
 * - Exibição fiel dos erros retornados pelo servidor PostgreSQL
 */

async function apiRequest(path, options = {}) {
  const { body, headers = {}, ...customOptions } = options;

  const config = {
    credentials: "same-origin",
    headers: {
      ...headers,
    },
    ...customOptions,
  };

  if (body !== undefined && !(body instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    config.body = body;
  }

  const response = await fetch(path, config);

  let data = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMessage =
      (data && (data.error || data.message)) ||
      `Erro na requisição (${response.status}): ${response.statusText}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  buscarAlimentos: (busca = "", offset = 0) =>
    apiRequest(
      `/api/nutricao/alimentos?${new URLSearchParams({ busca, offset: String(offset), limit: "24" })}`
    ),
  getAlimento: id => apiRequest(`/api/nutricao/alimentos/${id}`),
  calcularRefeicao: alimentos =>
    apiRequest("/api/nutricao/calcular", {
      method: "POST",
      body: { alimentos },
    }),
  buscarMedidasPof: busca =>
    apiRequest(`/api/nutricao/medidas-pof?${new URLSearchParams({ busca })}`),
  vincularMedidaPof: payload =>
    apiRequest("/api/nutricao/vinculos", { method: "POST", body: payload }),

  getCatalogoFiltros: () => apiRequest("/api/exercicios/filtros"),
  getExercicio: id => apiRequest(`/api/exercicios/${encodeURIComponent(id)}`),
  recomendarParaAluno: id =>
    apiRequest(`/api/personal/alunos/${id}/recomendacao-ia`, {
      method: "POST",
      body: {},
    }),
  editarTreino: (id, payload) =>
    apiRequest(`/api/personal/treinos/${id}`, { method: "PUT", body: payload }),
  excluirTreino: id =>
    apiRequest(`/api/personal/treinos/${id}`, { method: "DELETE" }),
  getTreinoDetalhes: id => apiRequest(`/api/personal/treinos/${id}`),
  getAuditoria: () => apiRequest("/api/admin/auditoria"),
  getModelos: () => apiRequest("/api/admin/treinos-modelo"),
  criarModelo: payload =>
    apiRequest("/api/admin/treinos-modelo", { method: "POST", body: payload }),
  excluirModelo: id =>
    apiRequest(`/api/admin/treinos-modelo/${id}`, { method: "DELETE" }),

  redefinirSenha: (token, novaSenha) =>
    apiRequest("/api/auth/redefinir-senha", {
      method: "POST",
      body: { token, novaSenha },
    }),
  salvarSugestao: (id, confirmar_demonstracao = false) =>
    apiRequest(`/api/aluno/sugestoes-ia/${id}/salvar`, {
      method: "POST",
      body: { confirmar_demonstracao },
    }),
  enviarSugestao: id =>
    apiRequest(`/api/aluno/sugestoes-ia/${id}/enviar`, {
      method: "POST",
      body: {},
    }),
  prepararVideo: file =>
    apiRequest("/api/feedbacks/video", {
      method: "POST",
      body: { contentType: file.type, size: file.size },
    }),
  recomendarTreino: (payload = {}) =>
    apiRequest("/api/aluno/recomendacao-ia", { method: "POST", body: payload }),
  enviarFeedback: payload =>
    apiRequest("/api/feedbacks", { method: "POST", body: payload }),
  getFeedbacks: () => apiRequest("/api/feedbacks"),
  excluirFeedback: id =>
    apiRequest(`/api/feedbacks/${id}`, { method: "DELETE" }),
  visualizarFeedback: id =>
    apiRequest(`/api/personal/feedbacks/${id}/visualizar`, { method: "PATCH" }),
  responderFeedback: (id, resposta_personal) =>
    apiRequest(`/api/personal/feedbacks/${id}/responder`, {
      method: "PATCH",
      body: { resposta_personal },
    }),
  getEvolucaoAluno: (id, params = {}) =>
    apiRequest(
      `/api/personal/alunos/${id}/evolucao?${new URLSearchParams(params)}`
    ),
  encerrarVinculo: () => apiRequest("/api/aluno/vinculo", { method: "DELETE" }),

  // 1. Autenticação e Sessões (/api/auth)
  getMe: () => apiRequest("/api/auth/me", { method: "GET" }),

  login: ({ identifier, senha }) =>
    apiRequest("/api/auth/login", {
      method: "POST",
      body: { identifier, senha },
    }),

  register: payload =>
    apiRequest("/api/auth/register", {
      method: "POST",
      body: payload,
    }),

  logout: () =>
    apiRequest("/api/auth/logout", {
      method: "POST",
    }),

  recuperarSenha: email =>
    apiRequest("/api/auth/recuperar-senha", {
      method: "POST",
      body: { email },
    }),

  // 2. Preferências e Perfil (/api/usuarios)
  atualizarPreferencias: ({ tema, notificacoes }) =>
    apiRequest("/api/usuarios/preferencias", {
      method: "PATCH",
      body: { tema, notificacoes },
    }),

  atualizarPerfil: payload =>
    apiRequest("/api/usuarios/perfil", {
      method: "PATCH",
      body: payload,
    }),

  // 3. Módulo do Aluno (/api/aluno)
  getAlunoDashboard: () =>
    apiRequest("/api/aluno/dashboard", { method: "GET" }),

  registrarHidratacao: incremento_ml =>
    apiRequest("/api/aluno/hidratacao", {
      method: "POST",
      body: { incremento_ml },
    }),

  adicionarRefeicao: payload =>
    apiRequest("/api/aluno/refeicoes", {
      method: "POST",
      body: payload,
    }),

  getAlunoTreinos: () => apiRequest("/api/aluno/treinos", { method: "GET" }),

  salvarExecucaoTreino: ({ treino_id, duracao_segundos, series_executadas }) =>
    apiRequest("/api/aluno/treinos/execucao", {
      method: "POST",
      body: { treino_id, duracao_segundos, series_executadas },
    }),

  getAlunoHistorico: (params = {}) =>
    apiRequest(`/api/aluno/historico?${new URLSearchParams(params)}`),

  getPersonaisDisponiveis: () =>
    apiRequest("/api/aluno/personais", { method: "GET" }),

  vincularPersonal: personal_id =>
    apiRequest("/api/aluno/vincular-personal", {
      method: "POST",
      body: { personal_id },
    }),

  // 4. Módulo do Personal Trainer (/api/personal)
  getPersonalDashboard: () =>
    apiRequest("/api/personal/dashboard", { method: "GET" }),

  getPersonalAlunos: status => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiRequest(`/api/personal/alunos${qs}`, { method: "GET" });
  },

  atualizarVinculo: (vinculoId, status) =>
    apiRequest(`/api/personal/vinculos/${vinculoId}`, {
      method: "PATCH",
      body: { status },
    }),

  criarTreino: payload =>
    apiRequest("/api/personal/treinos", {
      method: "POST",
      body: payload,
    }),

  getPersonalTreinos: () =>
    apiRequest("/api/personal/treinos", { method: "GET" }),

  atribuirTreino: ({ treino_id, aluno_id, aluno_ids, dias_semana }) =>
    apiRequest("/api/personal/treinos/atribuir", {
      method: "POST",
      body: {
        treino_id,
        aluno_id,
        ...(aluno_ids ? { aluno_ids } : {}),
        dias_semana,
      },
    }),

  getPersonalFeedbacks: () =>
    apiRequest("/api/personal/feedbacks", { method: "GET" }),

  // 5. Chat entre Pares (/api/chat)
  getConversas: () => apiRequest("/api/chat/conversas", { method: "GET" }),

  getMensagens: comUsuarioId =>
    apiRequest(`/api/chat/mensagens?com=${encodeURIComponent(comUsuarioId)}`, {
      method: "GET",
    }),

  enviarMensagem: ({
    destinatario_id,
    texto,
    tipo = "texto",
    video_url = null,
  }) =>
    apiRequest("/api/chat/mensagens", {
      method: "POST",
      body: { destinatario_id, texto, tipo, video_url },
    }),

  // 6. Painel Administrativo (/api/admin)
  getAdminEstatisticas: () =>
    apiRequest("/api/admin/estatisticas", { method: "GET" }),

  getAdminUsuarios: ({ tipo, status, busca } = {}) => {
    const params = new URLSearchParams();
    if (tipo) params.append("tipo", tipo);
    if (status) params.append("status", status);
    if (busca) params.append("busca", busca);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/api/admin/usuarios${qs}`, { method: "GET" });
  },

  atualizarStatusUsuario: (usuarioId, status) =>
    apiRequest(`/api/admin/usuarios/${usuarioId}/status`, {
      method: "PATCH",
      body: { status },
    }),

  validarCrefPersonal: (personalId, status_cref) =>
    apiRequest(`/api/admin/personais/${personalId}/validar-cref`, {
      method: "PATCH",
      body: { status_cref },
    }),

  // 7. Catálogo de Exercícios (/api/exercicios)
  getCatalogoExercicios: ({
    grupo,
    busca,
    nivel,
    equipamento,
    categoria,
    limit,
    offset,
  } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      nivel,
      equipamento,
      categoria,
      limit,
      offset,
    }))
      if (value !== undefined && value !== "") params.set(key, String(value));
    if (grupo) params.append("grupo", grupo);
    if (busca) params.append("busca", busca);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/api/exercicios/catalogo${qs}`, { method: "GET" });
  },

  // 8. Feedbacks e Vídeos (/api/feedbacks)
  enviarFeedbackVideo: () =>
    apiRequest("/api/feedbacks/video", {
      method: "POST",
    }),
};

export default api;
