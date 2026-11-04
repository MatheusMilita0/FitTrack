import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { setupTestEnvironment } from "./setup.js";
import { calcularMetasNutricionais } from "../server/services/calculoMetabolico.js";
import {
  ageFromBirth,
  historyPeriod,
  parseLocalDay,
} from "../server/utils/day.js";
import { processCrefQueue } from "../server/services/crefQueue.js";
import { subscribeChat, notifyChat } from "../server/services/chatEvents.js";

let app, pool, memDb;
const cpf = ["52998224725", "11144477735", "12345678909"];
const fields = {
  data_nascimento: "2000-01-15",
  sexo_metabolico: "masculino",
  fator_atividade: 1.55,
  peso_kg: 70,
  altura_cm: 175,
};
beforeEach(() => {
  ({ app, pool, memDb } = setupTestEnvironment());
  vi.stubEnv("AI_MODE", "mock");
  vi.stubEnv("CREF_MODE", "mock");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function register(i = 0, tipo = "student") {
  const r = await request(app)
    .post("/api/auth/register")
    .send({
      ...fields,
      nome: "Pessoa Teste",
      cpf: cpf[i],
      email: `pessoa${i}@example.com`,
      senha: "SenhaForte123",
      tipo,
      cref: "123456-G/SP",
      area_formacao: "Educação Física",
      atuacao_principal: "Musculação",
    });
  expect(r.status, r.body.error).toBe(201);
  return { id: r.body.user.id, cookie: r.headers["set-cookie"] };
}
async function linked() {
  const a = await register(),
    p = await register(1, "personal");
  await pool.query("UPDATE usuarios SET status='Ativo' WHERE id=$1", [p.id]);
  await pool.query(
    "UPDATE perfis_personais SET status_cref='Validado' WHERE usuario_id=$1",
    [p.id]
  );
  await pool.query(
    "INSERT INTO vinculos_aluno_personal(aluno_id,personal_id,status) VALUES($1,$2,'active')",
    [a.id, p.id]
  );
  return { a, p };
}
async function train(p) {
  const r = await request(app)
    .post("/api/personal/treinos")
    .set("Cookie", p.cookie)
    .send({
      titulo: "Ficha Teste",
      exercicios: [
        {
          nome: "Agachamento",
          series_padrao: "3",
          reps_padrao: "12",
          descanso_padrao: "60s",
          grupo_muscular: "Pernas",
        },
      ],
    });
  expect(r.status, r.body.error).toBe(201);
  return r.body.treino;
}
function rollbackEmulation() {
  let backup;
  memDb.public.interceptQueries(sql => {
    if (/^BEGIN/i.test(sql)) {
      backup = memDb.backup();
      return [];
    }
    if (/^ROLLBACK/i.test(sql)) {
      backup?.restore();
      backup = null;
      return [];
    }
    if (/^COMMIT/i.test(sql)) {
      backup = null;
      return [];
    }
    if (/INSERT INTO auditoria_operacoes/i.test(sql))
      throw new Error("Falha de auditoria simulada");
    return null;
  });
}

describe("Alinhamento do TG: dados, transações e fluxos completos", () => {
  it("reabre na administração uma validação profissional já concluída sem aprovar por demonstração", async () => {
    const a = await register(),
      p = await register(1, "personal");
    await pool.query("UPDATE usuarios SET tipo='admin' WHERE id=$1", [a.id]);
    await pool.query(
      "UPDATE perfis_personais SET status_cref='Rejeitado' WHERE usuario_id=$1",
      [p.id]
    );
    await pool.query(
      "UPDATE validacoes_profissionais SET estado='concluido',tentativas=2 WHERE usuario_id=$1",
      [p.id]
    );
    const r = await request(app)
      .patch(`/api/admin/personais/${p.id}/validar-cref`)
      .set("Cookie", a.cookie)
      .send({ status_cref: "Pendente" });
    expect(r.status, r.body.error).toBe(200);
    const job = (
      await pool.query(
        "SELECT estado,tentativas FROM validacoes_profissionais WHERE usuario_id=$1",
        [p.id]
      )
    ).rows[0];
    expect(job.estado).toBe("pendente");
    expect(job.tentativas).toBe(0);
    await processCrefQueue();
    expect(
      (
        await pool.query(
          "SELECT status_cref FROM perfis_personais WHERE usuario_id=$1",
          [p.id]
        )
      ).rows[0].status_cref
    ).toBe("Pendente");
  });
  it("rejeita coerções de repetições e aceita somente valores reais da execução", async () => {
    const { a, p } = await linked(),
      t = await train(p);
    await request(app)
      .post("/api/personal/treinos/atribuir")
      .set("Cookie", p.cookie)
      .send({ treino_id: t.id, aluno_ids: [a.id], dias_semana: ["SEG"] });
    for (const reps of [true, null, "", "8-10 reps", 2.5]) {
      const r = await request(app)
        .post("/api/aluno/treinos/execucao")
        .set("Cookie", a.cookie)
        .send({
          treino_id: t.id,
          duracao_segundos: 60,
          series_executadas: [
            { nome: "Agachamento", carga: 20, reps, concluido: true },
          ],
        });
      expect(r.status).toBe(400);
    }
    const r = await request(app)
      .post("/api/aluno/treinos/execucao")
      .set("Cookie", a.cookie)
      .send({
        treino_id: t.id,
        duracao_segundos: 60,
        series_executadas: [
          { nome: "Agachamento", carga: 20.5, reps: 8, concluido: true },
        ],
      });
    expect(r.status, r.body.error).toBe(201);
    expect(
      (
        await pool.query("SELECT id FROM execucoes_treino WHERE aluno_id=$1", [
          a.id,
        ])
      ).rows
    ).toHaveLength(1);
  });
  it("usa as duas equações descritas e nunca inventa biometria", () => {
    const base = {
      peso_kg: 80,
      altura_cm: 180,
      idade: 25,
      fator_atividade: 1.55,
      objetivo: "Hipertrofia",
    };
    expect(
      calcularMetasNutricionais({ ...base, sexo_metabolico: "masculino" })
        .meta_calorias_kcal
    ).toBe(3148);
    expect(
      calcularMetasNutricionais({ ...base, sexo_metabolico: "feminino" })
        .meta_calorias_kcal
    ).toBe(2890);
    expect(calcularMetasNutricionais({}).meta_calorias_kcal).toBeNull();
    expect(calcularMetasNutricionais(base).metas_pendentes).toBe(true);
  });
  it("calcula aniversário e rejeita datas normalizadas ou futuras", () => {
    expect(ageFromBirth("2000-11-03", new Date(2026, 10, 2))).toBe(25);
    expect(ageFromBirth("2000-11-03", new Date(2026, 10, 3))).toBe(26);
    expect(parseLocalDay("2026-02-30")).toBeNull();
    expect(ageFromBirth("2999-01-01")).toBeNull();
  });
  it("usa meia-noite local, incluindo o fim exclusivo do período", () => {
    vi.stubEnv("TZ", "America/Sao_Paulo");
    const r = historyPeriod({ inicio: "2026-11-03", fim: "2026-11-03" });
    expect(r.start.getTime()).toBe(new Date(2026, 10, 3).getTime());
    expect(r.end.getTime()).toBe(new Date(2026, 10, 4).getTime());
    expect(() => historyPeriod({ inicio: "2026-02-30" })).toThrow();
    expect(() =>
      historyPeriod({ inicio: "2026-11-04", fim: "2026-11-03" })
    ).toThrow();
  });
  it.each(["peso_kg", "altura_cm", "sexo_metabolico", "data_nascimento"])(
    "exige %s no novo cadastro",
    async field => {
      const body = {
        ...fields,
        nome: "Pessoa Teste",
        cpf: cpf[0],
        email: "novo@example.com",
        senha: "SenhaForte123",
        tipo: "student",
      };
      delete body[field];
      expect(
        (await request(app).post("/api/auth/register").send(body)).status
      ).toBe(400);
      expect((await pool.query("SELECT id FROM usuarios")).rows).toHaveLength(
        0
      );
    }
  );
  it("não confirma cadastro nem cookie quando sua auditoria falha", async () => {
    rollbackEmulation();
    const r = await request(app)
      .post("/api/auth/register")
      .send({
        ...fields,
        nome: "Pessoa Teste",
        cpf: cpf[0],
        email: "novo@example.com",
        senha: "SenhaForte123",
        tipo: "student",
      });
    expect(r.status).toBe(500);
    expect(r.headers["set-cookie"]).toBeUndefined();
    expect((await pool.query("SELECT id FROM usuarios")).rows).toHaveLength(0);
  });
  it("desfaz atualização de perfil quando falha a trilha de auditoria", async () => {
    const a = await register();
    rollbackEmulation();
    const r = await request(app)
      .patch("/api/usuarios/perfil")
      .set("Cookie", a.cookie)
      .send({ peso_kg: 80 });
    expect(r.status).toBe(500);
    expect(
      Number(
        (
          await pool.query(
            "SELECT peso_kg FROM perfis_alunos WHERE usuario_id=$1",
            [a.id]
          )
        ).rows[0].peso_kg
      )
    ).toBe(70);
  });
  it("permite consultar registros além dos antigos limites e informa o total", async () => {
    const { a, p } = await linked(),
      t = await train(p);
    for (let i = 0; i < 61; i++)
      await pool.query(
        "INSERT INTO execucoes_treino(treino_id,aluno_id) VALUES($1,$2)",
        [t.id, a.id]
      );
    const r = await request(app)
      .get(`/api/personal/alunos/${a.id}/evolucao?limit=10&offset=60`)
      .set("Cookie", p.cookie);
    expect(r.status, r.body.error).toBe(200);
    expect(r.body.execucoes).toHaveLength(1);
    expect(r.body.total_treinos_concluidos).toBe(61);
    expect(r.body.paginacao.tem_mais).toBe(false);
  });
  it("valida o lote inteiro antes de atribuir a qualquer aluno", async () => {
    const { a, p } = await linked(),
      other = await register(2),
      t = await train(p);
    const r = await request(app)
      .post("/api/personal/treinos/atribuir")
      .set("Cookie", p.cookie)
      .send({
        treino_id: t.id,
        aluno_ids: [a.id, other.id],
        dias_semana: ["SEG"],
      });
    expect(r.status).toBe(403);
    expect(
      (await pool.query("SELECT id FROM atribuicoes_treino")).rows
    ).toHaveLength(0);
  });
  it("atribui a vários alunos e não duplica uma atribuição repetida", async () => {
    const { a, p } = await linked(),
      other = await register(2),
      t = await train(p);
    await pool.query(
      "INSERT INTO vinculos_aluno_personal(aluno_id,personal_id,status) VALUES($1,$2,'active')",
      [other.id, p.id]
    );
    for (let i = 0; i < 2; i++) {
      const r = await request(app)
        .post("/api/personal/treinos/atribuir")
        .set("Cookie", p.cookie)
        .send({
          treino_id: t.id,
          aluno_ids: [a.id, other.id],
          dias_semana: ["SÁB"],
        });
      expect(r.status, r.body.error).toBe(201);
      expect(r.body.atribuicoes).toHaveLength(2);
    }
    expect(
      (await pool.query("SELECT id FROM atribuicoes_treino")).rows
    ).toHaveLength(2);
  });
  it("gera, identifica demonstração, salva idempotentemente e envia a IA ao personal", async () => {
    const { a, p } = await linked(),
      t = await train(p);
    let r = await request(app)
      .post("/api/aluno/recomendacao-ia")
      .set("Cookie", a.cookie)
      .send({});
    expect(r.status).toBe(409);
    await pool.query(
      "INSERT INTO execucoes_treino(treino_id,aluno_id) VALUES($1,$2)",
      [t.id, a.id]
    );
    r = await request(app)
      .post("/api/aluno/recomendacao-ia")
      .set("Cookie", a.cookie)
      .send({ restricoes: "Preferir exercícios básicos" });
    expect(r.status, r.body.error).toBe(200);
    const suggestion = r.body.recomendacao;
    expect(suggestion.mock).toBe(true);
    expect(
      (
        await request(app)
          .post(`/api/aluno/sugestoes-ia/${suggestion.id}/salvar`)
          .set("Cookie", a.cookie)
          .send({})
      ).status
    ).toBe(400);
    r = await request(app)
      .post(`/api/aluno/sugestoes-ia/${suggestion.id}/salvar`)
      .set("Cookie", a.cookie)
      .send({ confirmar_demonstracao: true });
    expect(r.status, r.body.error).toBe(200);
    const id = r.body.treino.id;
    expect(r.body.treino.exercicios.length).toBeGreaterThan(0);
    const again = await request(app)
      .post(`/api/aluno/sugestoes-ia/${suggestion.id}/salvar`)
      .set("Cookie", a.cookie)
      .send({ confirmar_demonstracao: true });
    expect(again.body.treino.id).toBe(id);
    expect(
      (
        await request(app)
          .post(`/api/aluno/sugestoes-ia/${suggestion.id}/enviar`)
          .set("Cookie", a.cookie)
          .send({})
      ).status
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT texto FROM mensagens_chat WHERE destinatario_id=$1",
          [p.id]
        )
      ).rows[0].texto
    ).toContain("DEMONSTRATIVA");
    const other = await register(2);
    expect(
      (
        await request(app)
          .post(`/api/aluno/sugestoes-ia/${suggestion.id}/salvar`)
          .set("Cookie", other.cookie)
          .send({ confirmar_demonstracao: true })
      ).status
    ).toBe(404);
  });
  it("mantém a fila persistente quando o provedor está indisponível", async () => {
    const p = await register(1, "personal");
    vi.stubEnv("CREF_MODE", "provider");
    vi.stubEnv("CREF_SERVICE_URL", "https://provider.example/cref");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    );
    await processCrefQueue(new Date(Date.now() + 1000));
    const job = (
      await pool.query(
        "SELECT * FROM validacoes_profissionais WHERE usuario_id=$1",
        [p.id]
      )
    ).rows[0];
    expect(job.estado).toBe("pendente");
    expect(job.tentativas).toBe(1);
    expect(new Date(job.proxima_tentativa).getTime()).toBeGreaterThan(
      Date.now()
    );
    expect(
      (
        await pool.query(
          "SELECT status_cref FROM perfis_personais WHERE usuario_id=$1",
          [p.id]
        )
      ).rows[0].status_cref
    ).toBe("Pendente");
  });
  it("ativa o profissional apenas após resposta real positiva do adaptador", async () => {
    const p = await register(1, "personal");
    vi.stubEnv("CREF_MODE", "provider");
    vi.stubEnv("CREF_SERVICE_URL", "https://provider.example/cref");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ativo: true,
          situacao: "Confirmação simulada somente neste teste",
        }),
      })
    );
    await processCrefQueue(new Date(Date.now() + 1000));
    expect(
      (await pool.query("SELECT status FROM usuarios WHERE id=$1", [p.id]))
        .rows[0].status
    ).toBe("Ativo");
    expect(
      (
        await pool.query(
          "SELECT estado FROM validacoes_profissionais WHERE usuario_id=$1",
          [p.id]
        )
      ).rows[0].estado
    ).toBe("concluido");
  });
  it("notifica apenas os participantes e remove assinaturas encerradas", () => {
    const a = vi.fn(),
      b = vi.fn();
    const stop = subscribeChat(1, a),
      stopB = subscribeChat(2, b);
    notifyChat(1);
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    stop();
    notifyChat(1);
    expect(a).toHaveBeenCalledOnce();
    stopB();
  });
  it("não abre um canal de eventos sem autenticação", async () =>
    expect((await request(app).get("/api/chat/eventos")).status).toBe(401));
  it("mantém o canal autenticado aberto e transmite eventos após a conexão", async () => {
    const a = await register();
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const controller = new AbortController();
    let reader;
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.address().port}/api/chat/eventos`,
        {
          headers: { Cookie: a.cookie.map(c => c.split(";")[0]).join("; ") },
          signal: controller.signal,
        }
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream"
      );
      reader = response.body.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(
        "conectado"
      );
      notifyChat(a.id);
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(
        "data: atualizar"
      );
    } finally {
      await reader?.cancel();
      controller.abort();
      await new Promise(resolve => server.close(resolve));
    }
  });
  it("preserva a ficha própria de IA ao encerrar acompanhamento profissional", async () => {
    const { a, p } = await linked(),
      t = await train(p);
    await pool.query(
      "INSERT INTO atribuicoes_treino(treino_id,aluno_id,personal_id,ativo) VALUES($1,$2,$3,TRUE)",
      [t.id, a.id, p.id]
    );
    await pool.query(
      "INSERT INTO atribuicoes_treino(treino_id,aluno_id,ativo) VALUES($1,$2,TRUE)",
      [t.id, a.id]
    );
    const r = await request(app)
      .delete("/api/aluno/vinculo")
      .set("Cookie", a.cookie);
    expect(r.status, r.body.error).toBe(200);
    const rows = (
      await pool.query(
        "SELECT personal_id,ativo FROM atribuicoes_treino WHERE aluno_id=$1",
        [a.id]
      )
    ).rows;
    expect(rows.find(r => r.personal_id === null).ativo).toBe(true);
    expect(rows.find(r => r.personal_id !== null).ativo).toBe(false);
  });
});
