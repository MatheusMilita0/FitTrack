import { vi } from 'vitest';
// Contract simulation: only this test suite replaces the external council adapter.
vi.mock('../server/services/crefService.js', async importOriginal => ({...(await importOriginal()),validarCrefExterno:async()=>({status:'Validado',mock:false,detalhe:'Resposta simulada exclusivamente pelo teste'})}));
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { setupTestEnvironment } from "./setup.js";

describe("Fluxos Críticos do Aluno, Personal e Administrador", () => {
  let app;
  let pool;

  beforeEach(() => {
    const env = setupTestEnvironment();
    app = env.app;
    pool = env.pool;

    const cat = env.memDb.getSchema("pg_catalog");
    const jsonbType = cat.getType("jsonb");
    try {
      cat.registerFunction({
        name: "jsonb_build_array",
        args: [jsonbType],
        returns: jsonbType,
        implementation: (x) => (Array.isArray(x) ? x : [x]),
      });
    } catch {
      // Ignora se já registrado
    }
    try {
      cat.registerOperator({
        operator: "||",
        left: jsonbType,
        right: jsonbType,
        returns: jsonbType,
        implementation: (a, b) => {
          let arrA = a;
          if (typeof arrA === "string") {
            try { arrA = JSON.parse(arrA); } catch { arrA = [arrA]; }
          }
          if (!Array.isArray(arrA)) {
            arrA = (arrA !== null && arrA !== undefined) ? [arrA] : [];
          }
          let arrB = b;
          if (typeof arrB === "string") {
            try { arrB = JSON.parse(arrB); } catch { arrB = [arrB]; }
          }
          if (!Array.isArray(arrB)) {
            arrB = (arrB !== null && arrB !== undefined) ? [arrB] : [];
          }
          return [...arrA, ...arrB];
        },
      });
    } catch {
      // Ignora se já registrado
    }
  });

  async function cadastrar(dados) {
    const res = await request(app).post("/api/auth/register").send(dados);
    return { user: res.body.user, cookie: res.headers["set-cookie"] };
  }

  it("deve gerenciar hidratação e refeições diárias no diário nutricional", async () => {
    const aluno = await cadastrar({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Nutricao",
      cpf: "888.888.889-69",
      email: "nutricao@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    // 1. Adiciona hidratação
    const hidra1 = await request(app)
      .post("/api/aluno/hidratacao")
      .set("Cookie", aluno.cookie)
      .send({ incremento_ml: 500 });
    expect(hidra1.status).toBe(200);
    expect(Number(hidra1.body.nutricao.agua_ml)).toBe(500);

    // 2. Incrementa hidratação
    const hidra2 = await request(app)
      .post("/api/aluno/hidratacao")
      .set("Cookie", aluno.cookie)
      .send({ incremento_ml: 250 });
    expect(hidra2.status).toBe(200);
    expect(Number(hidra2.body.nutricao.agua_ml)).toBe(750);

    // 3. Adiciona refeição
    const mealRes = await request(app)
      .post("/api/aluno/refeicoes")
      .set("Cookie", aluno.cookie)
      .send({
        titulo: "Almoço",
        itens: "Frango grelhado e arroz integral",
        kcal: 550,
        proteinas: 45,
        carboidratos: 60,
        gorduras: 10,
      });
    expect(mealRes.status).toBe(201);
    expect(Number(mealRes.body.nutricao.calorias_consumidas)).toBe(550);
    expect(mealRes.body.nutricao.refeicoes.length).toBe(1);

    // 4. Carrega dashboard do aluno e confirma valores consolidados reais
    const dashRes = await request(app)
      .get("/api/aluno/dashboard")
      .set("Cookie", aluno.cookie);
    expect(dashRes.status).toBe(200);
    expect(Number(dashRes.body.nutricao_hoje.agua_ml)).toBe(750);
    expect(Number(dashRes.body.nutricao_hoje.calorias_consumidas)).toBe(550);
  });

  it("deve registrar execução de treino e refletir no histórico de evolução", async () => {
    const aluno = await cadastrar({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Treino",
      cpf: "999.888.777-14",
      email: "treino@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    // Insere um treino modelo
    const treinoRes = await pool.query(
      `INSERT INTO treinos (criador_id, titulo, nivel, e_modelo)
       VALUES ($1, 'Treino A - Peito', 'Intermediário', TRUE)
       RETURNING id`,
      [aluno.user.id]
    );
    const treinoId = treinoRes.rows[0].id;

    // Registra execução concluída com séries e cargas reais
    const execRes = await request(app)
      .post("/api/aluno/treinos/execucao")
      .set("Cookie", aluno.cookie)
      .send({
        treino_id: treinoId,
        duracao_segundos: 2100,
        series_executadas: [
          { nome: "Supino", carga: 60, reps: 10, feito: true },
          { nome: "Supino", carga: 65, reps: 8, feito: true },
        ],
      });
    expect(execRes.status).toBe(201);

    // Consulta histórico
    const histRes = await request(app)
      .get("/api/aluno/historico")
      .set("Cookie", aluno.cookie);
    expect(histRes.status).toBe(200);
    expect(histRes.body.total_treinos).toBe(1);
    expect(histRes.body.cargas_por_exercicio["Supino"]).toBeDefined();
    expect(histRes.body.cargas_por_exercicio["Supino"].length).toBe(2);
  });

  it("deve permitir fluxo completo de solicitação, aprovação de vínculo e prescrição", async () => {
    const personal = await cadastrar({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Instrutor",
      cpf: "101.101.101-88",
      email: "instrutor@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "10101-G/SP",
      area_formacao: "Ed Física",
      atuacao_principal: "Musculação",
    });

    // Ativa e valida o personal para operações protegidas
    await pool.query(
      "UPDATE perfis_personais SET status_cref = 'Validado' WHERE usuario_id = $1",
      [personal.user.id]
    );
    await pool.query(
      "UPDATE usuarios SET status = 'Ativo' WHERE id = $1",
      [personal.user.id]
    );

    const aluno = await cadastrar({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Vinculado",
      cpf: "202.202.202-55",
      email: "vinculado@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    // 1. Aluno solicita vínculo
    const reqVinculo = await request(app)
      .post("/api/aluno/vincular-personal")
      .set("Cookie", aluno.cookie)
      .send({ personal_id: personal.user.id });
    expect(reqVinculo.status).toBe(201);
    expect(reqVinculo.body.vinculo.status).toBe("pending");
    const vinculoId = reqVinculo.body.vinculo.id;

    // 2. Personal lista alunos pendentes
    const pendentes = await request(app)
      .get("/api/personal/alunos?status=pending")
      .set("Cookie", personal.cookie);
    expect(pendentes.status).toBe(200);
    expect(pendentes.body.length).toBe(1);

    // 3. Personal aceita vínculo
    const aceitaRes = await request(app)
      .patch(`/api/personal/vinculos/${vinculoId}`)
      .set("Cookie", personal.cookie)
      .send({ status: "active" });
    expect(aceitaRes.status).toBe(200);
    expect(aceitaRes.body.vinculo.status).toBe("active");

    // 4. Personal cria treino e atribui ao aluno
    const treinoRes = await request(app)
      .post("/api/personal/treinos")
      .set("Cookie", personal.cookie)
      .send({
        titulo: "Treino Personalizado Hipertrofia",
        exercicios: [
          {
            nome: "Supino Inclinado",
            grupo_muscular: "Peito", reps_padrao: "12", descanso_padrao: "60s",
            series_padrao: "4 × 10",
            reps_padrao: "10",
            carga_padrao: "24",
          },
        ],
      });
    expect(treinoRes.status).toBe(201);
    const treinoId = treinoRes.body.treino.id;

    const atribuirRes = await request(app)
      .post("/api/personal/treinos/atribuir")
      .set("Cookie", personal.cookie)
      .send({
        treino_id: treinoId,
        aluno_id: aluno.user.id,
        dias_semana: ["SEG", "QUA", "SEX"],
      });
    expect(atribuirRes.status).toBe(201);

    // 5. Aluno verifica treino atribuído
    const alunoTreinos = await request(app)
      .get("/api/aluno/treinos")
      .set("Cookie", aluno.cookie);
    expect(alunoTreinos.status).toBe(200);
    expect(alunoTreinos.body.atribuidos.length).toBe(1);
    expect(alunoTreinos.body.atribuidos[0].titulo).toBe("Treino Personalizado Hipertrofia");
  });

  it("administrador pode moderar contas, validar CREF e visualizar métricas", async () => {
    // Insere admin diretamente no banco (simulando bootstrap CLI)
    const adminRes = await pool.query(
      `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo, status)
       VALUES ('Admin Geral', '000.111.222-85', 'admin@fittrack.com', 'hash', 'admin', 'Ativo')
       RETURNING id, nome, email, tipo`
    );
    const adminId = adminRes.rows[0].id;

    // Cria sessão do admin
    await pool.query(
      `INSERT INTO sessoes (token, usuario_id, expira_em)
       VALUES ('admin-token', $1, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [adminId]
    );
    const adminCookie = ["fittrack_session=admin-token; Path=/; HttpOnly"];

    // Cadastra personal pendente
    const personal = await cadastrar({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Para Validar",
      cpf: "303.303.303-22",
      email: "validar@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "77777-G/SP",
      area_formacao: "Ed Física",
      atuacao_principal: "Funcional",
    });

    // Admin valida o CREF do personal
    const validaCref = await request(app)
      .patch(`/api/admin/personais/${personal.user.id}/validar-cref`)
      .set("Cookie", adminCookie)
      .send({ status_cref: "Validado" });
    expect(validaCref.status).toBe(200);
    expect(validaCref.body.perfil.status_cref).toBe("Validado");

    // Admin consulta KPIs globais da plataforma
    const statsRes = await request(app)
      .get("/api/admin/estatisticas")
      .set("Cookie", adminCookie);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.usuarios.total).toBeGreaterThanOrEqual(2);
    expect(statsRes.body.usuarios.admins).toBe(1);
  });

  it("deve rejeitar upload sem metadados válidos", async () => {
    const aluno = await cadastrar({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Video",
      cpf: "404.404.404-08",
      email: "video@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    const res = await request(app)
      .post("/api/feedbacks/video")
      .set("Cookie", aluno.cookie)
      .send({ treino_id: 1, video_blob: "fake" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vídeo|inválido/i);
  });
});
