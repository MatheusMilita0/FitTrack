import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import { setupTestEnvironment } from "./setup.js";
import { gerarRecomendacaoTreino } from "../server/services/aiService.js";
import { serverDay } from "../server/utils/day.js";

describe("Regressões da auditoria TG", () => {
  let app, pool;
  beforeEach(() => {
    ({ app, pool } = setupTestEnvironment());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  async function register(tipo, email, cpf) {
    const r = await request(app)
      .post("/api/auth/register")
      .send({
        data_nascimento: "2000-01-15",
        sexo_metabolico: "masculino",
        nome: tipo === "personal" ? "Personal Teste" : "Aluno Teste",
        tipo,
        email,
        cpf,
        senha: "SenhaForte123",
        cref: "123456-G/SP",
        area_formacao: "Educação Física",
        atuacao_principal: "Musculação",
        peso_kg: 70,
        altura_cm: 175,
      });
    expect(r.status, r.body.error).toBe(201);
    return { id: r.body.user.id, cookie: r.headers["set-cookie"] };
  }
  async function linked() {
    const a = await register("student", "aluno@teste.com", "52998224725");
    const p = await register("personal", "personal@teste.com", "11144477735");
    await pool.query("UPDATE usuarios SET status='Ativo' WHERE id=$1", [p.id]);
    await pool.query(
      "UPDATE perfis_personais SET status_cref='Validado' WHERE usuario_id=$1",
      [p.id]
    );
    const v = await request(app)
      .post("/api/aluno/vincular-personal")
      .set("Cookie", a.cookie)
      .send({ personal_id: p.id });
    expect(v.status, v.body.error).toBe(201);
    expect(
      (
        await request(app)
          .patch(`/api/personal/vinculos/${v.body.vinculo.id}`)
          .set("Cookie", p.cookie)
          .send({ status: "active" })
      ).status
    ).toBe(200);
    return { a, p };
  }
  it("RN14/RNF02: rejeita links de vídeo inseguros ou inválidos antes de gravar", async () => {
    const { a } = await linked();
    for (const video_url of [
      "http://videos.example/video.mp4",
      "https://",
      "https://user:password@videos.example/video.mp4",
      "javascript:alert(1)",
      "https://videos.example/" + "a".repeat(2048),
    ]) {
      const response = await request(app)
        .post("/api/feedbacks")
        .set("Cookie", a.cookie)
        .send({ execucao_id: 1, video_url });
      expect(response.status, video_url).toBe(400);
    }
    expect(
      (await pool.query("SELECT id FROM feedbacks_treino")).rows
    ).toHaveLength(0);
  });
  it("RN14: envia, lê, responde e impede exclusão do vídeo após visualização", async () => {
    const { a, p } = await linked();
    const t = await request(app)
      .post("/api/personal/treinos")
      .set("Cookie", p.cookie)
      .send({
        titulo: "Ficha válida",
        exercicios: [
          {
            nome: "Agachamento",
            reps_padrao: "12",
            descanso_padrao: "60s",
            series_padrao: "4 × 12",
            grupo_muscular: "Pernas",
          },
        ],
      });
    expect(t.status, t.body.error).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/personal/treinos/atribuir")
          .set("Cookie", p.cookie)
          .send({
            treino_id: t.body.treino.id,
            aluno_id: a.id,
            dias_semana: ["SEG"],
          })
      ).status
    ).toBe(201);
    const e = await request(app)
      .post("/api/aluno/treinos/execucao")
      .set("Cookie", a.cookie)
      .send({
        treino_id: t.body.treino.id,
        duracao_segundos: 100,
        series_executadas: [
          { nome: "Agachamento", carga: 10, reps: 12, concluido: true },
        ],
      });
    expect(e.status, e.body.error).toBe(201);
    const f = await request(app)
      .post("/api/feedbacks")
      .set("Cookie", a.cookie)
      .send({
        execucao_id: e.body.execucao.id,
        video_url: "https://example.org/video.mp4",
        comentario_aluno: "Verificar execução",
      });
    expect(f.status, f.body.error).toBe(201);
    const id = f.body.feedback.id;
    expect(
      (
        await request(app)
          .patch(`/api/personal/feedbacks/${id}/visualizar`)
          .set("Cookie", p.cookie)
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete(`/api/feedbacks/${id}`)
          .set("Cookie", a.cookie)
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/personal/feedbacks/${id}/responder`)
          .set("Cookie", p.cookie)
          .send({ resposta_personal: "Controle a descida." })
      ).status
    ).toBe(200);
    const list = await request(app)
      .get("/api/feedbacks")
      .set("Cookie", a.cookie);
    expect(list.status, list.body.error).toBe(200);
    expect(list.body[0].resposta_personal).toBe("Controle a descida.");
    const messages = (
      await request(app)
        .get(`/api/chat/mensagens?com=${p.id}`)
        .set("Cookie", a.cookie)
    ).body;
    expect(messages.some(m => m.texto.includes("Novo feedback de vídeo"))).toBe(
      true
    );
    expect(messages.some(m => m.texto.includes("Controle a descida."))).toBe(
      true
    );
    expect(
      (await request(app).delete("/api/aluno/vinculo").set("Cookie", a.cookie))
        .status
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT ativo FROM atribuicoes_treino WHERE aluno_id=$1",
          [a.id]
        )
      ).rows[0].ativo
    ).toBe(false);
    expect(
      (
        await request(app)
          .get(`/api/chat/mensagens?com=${p.id}`)
          .set("Cookie", a.cookie)
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/api/personal/feedbacks")
          .set("Cookie", p.cookie)
      ).body
    ).toHaveLength(0);
    expect(
      (
        await request(app)
          .patch(`/api/personal/feedbacks/${id}/responder`)
          .set("Cookie", p.cookie)
          .send({ resposta_personal: "Contato encerrado" })
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/personal/feedbacks/${id}/visualizar`)
          .set("Cookie", p.cookie)
      ).status
    ).toBe(404);
  });
  it("não retorna sucesso falso de armazenamento nem usa execução de outro aluno", async () => {
    const { a } = await linked();
    expect(
      (
        await request(app)
          .post("/api/feedbacks/video")
          .set("Cookie", a.cookie)
          .send({ contentType: "video/mp4", size: 1000 })
      ).status
    ).toBe(503);
    expect(
      (
        await request(app).post("/api/feedbacks").set("Cookie", a.cookie).send({
          execucao_id: 999,
          video_url: "https://example.org/video.mp4",
        })
      ).status
    ).toBe(403);
  });
  it("RN06: recalcula macros mesmo com meta calórica explícita e conserva biometria", async () => {
    const a = await register("student", "metas@teste.com", "52998224725");
    const r = await request(app)
      .patch("/api/usuarios/perfil")
      .set("Cookie", a.cookie)
      .send({
        peso_kg: 80,
        altura_cm: 180,
        objetivo: "Hipertrofia",
        meta_calorias_kcal: 1,
      });
    expect(r.status, r.body.error).toBe(200);
    expect(r.body.profile.meta_calorias_kcal).toBeGreaterThan(1000);
    const h = await request(app)
      .get("/api/aluno/historico?inicio=2020-01-01&fim=2099-01-01")
      .set("Cookie", a.cookie);
    expect(h.status, h.body.error).toBe(200);
    expect(h.body.biometria.length).toBe(2);
    expect(h.body.biometria.map(b => Number(b.peso_kg))).toContain(80);
    expect(h.body.biometria.map(b => Number(b.peso_kg))).toContain(70);
  });
  it("RN18: nova solicitação não desfaz vínculo ativo", async () => {
    const { a, p } = await linked();
    expect(
      (
        await request(app)
          .post("/api/aluno/vincular-personal")
          .set("Cookie", a.cookie)
          .send({ personal_id: p.id })
      ).status
    ).toBe(409);
    expect(
      (
        await pool.query(
          "SELECT status FROM vinculos_aluno_personal WHERE aluno_id=$1",
          [a.id]
        )
      ).rows[0].status
    ).toBe("active");
  });
  it("IA: fallback mantém origem demonstrativa explícita e usa objetivo do contrato", async () => {
    vi.stubEnv("AI_MODE", "mock");
    const r = await gerarRecomendacaoTreino({
      aluno: { objetivo: "Emagrecimento" },
    });
    expect(r.mock).toBe(true);
    expect(r.mode).toBe("mock");
    expect(r.titulo).toMatch(/Metabólico/);
  });
  it("RN16: chave diária usa meia-noite do servidor", () => {
    expect(serverDay(new Date(2026, 0, 1, 23, 59))).toBe("2026-01-01");
    expect(serverDay(new Date(2026, 0, 2, 0, 0))).toBe("2026-01-02");
  });
  it("RN05: administrador não aprova CREF por fallback sem provedor", async () => {
    vi.stubEnv("CREF_SERVICE_URL", "");
    const p = await register("personal", "pendente@teste.com", "11144477735");
    const u = await pool.query(
      "INSERT INTO usuarios(nome,cpf,email,senha_hash,tipo) VALUES('Administrador','52998224725','admin@teste.com','hash','admin') RETURNING id"
    );
    await pool.query(
      "INSERT INTO sessoes(token,usuario_id,expira_em) VALUES('teste-admin',$1,$2)",
      [u.rows[0].id, new Date(Date.now() + 60000)]
    );
    const r = await request(app)
      .patch(`/api/admin/personais/${p.id}/validar-cref`)
      .set("Cookie", "fittrack_session=teste-admin")
      .send({ status_cref: "Validado" });
    expect(r.status).toBe(503);
    expect(
      (
        await pool.query(
          "SELECT status_cref FROM perfis_personais WHERE usuario_id=$1",
          [p.id]
        )
      ).rows[0].status_cref
    ).toBe("Pendente");
  });
  it("Gemini: envia histórico/restrições e diferencia resposta real do adaptador", async () => {
    vi.stubEnv("AI_MODE", "real");
    vi.stubEnv("GEMINI_API_KEY", "chave-exclusiva-do-teste");
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    titulo: "Sugestão",
                    exercicios: [
                      {
                        nome: "Remada",
                        series: 3,
                        repeticoes: "12",
                        descanso: "60s",
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetch);
    const r = await gerarRecomendacaoTreino({
      aluno: { objetivo: "Emagrecimento" },
      historico: [{ carga: 10 }],
      restricoes: "ombro",
    });
    expect(r.mock).toBe(false);
    expect(r.mode).toBe("gemini");
    expect(fetch.mock.calls[0][1].body).toContain("ombro");
    expect(fetch.mock.calls[0][1].body).toContain("carga");
    expect(fetch.mock.calls[0][0]).not.toContain("chave-exclusiva-do-teste");
  });
});
