import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { setupTestEnvironment } from "./setup.js";
import { setPool } from "../server/db.js";
import { createApp } from "../server/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("Contratos e Regras do Servidor FitTrack (server_contract.test.js)", () => {
  let app;
  let pool;
  let originalFetch;

  beforeEach(() => {
    const env = setupTestEnvironment();
    app = env.app;
    pool = env.pool;
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function cadastrarUsuario(dados) {
    const res = await request(app).post("/api/auth/register").send(dados);
    return {
      user: res.body.user,
      cookie: res.headers["set-cookie"],
    };
  }

  // CASO 1: Modelos de biblioteca com exercícios completos e isolamento entre usuários
  describe("Caso 1: GET /api/aluno/treinos com exercícios em modelos e isolamento", () => {
    it("deve retornar exercícios completos tanto em atribuídos quanto em modelos_biblioteca e isolar fichas privadas", async () => {
      // 1. Cadastra Aluno 1 e Aluno 2
      const aluno1 = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Aluno Contrato Um",
        cpf: "123.001.001-77",
        email: "aluno1_contrato@teste.com",
        senha: "senhaSegura123",
        tipo: "student",
      });

      const aluno2 = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Aluno Contrato Dois",
        cpf: "123.002.002-01",
        email: "aluno2_contrato@teste.com",
        senha: "senhaSegura123",
        tipo: "student",
      });

      // 2. Cria um modelo público de biblioteca com exercícios
      const modeloDb = await pool.query(
        `INSERT INTO treinos (criador_id, titulo, descricao, nivel, tempo_estimado_min, cor_tema, e_modelo)
         VALUES ($1, 'Modelo Biblioteca Push', 'Treino modelo de empurrar', 'Intermediário', 45, 'blue', TRUE)
         RETURNING id`,
        [aluno1.user.id]
      );
      const modeloId = modeloDb.rows[0].id;

      await pool.query(
        `INSERT INTO treino_exercicios (treino_id, ordem, exercise_id, nome, grupo_muscular, series_padrao, reps_padrao, descanso_padrao, carga_padrao)
         VALUES ($1, 1, 'ex01', 'Supino Reto', 'chest', '4x10', '10', '90s', '60'),
                ($1, 2, 'ex02', 'Desenvolvimento', 'shoulders', '3x12', '12', '60s', '20')`,
        [modeloId]
      );

      // 3. Cria um treino privado atribuído exclusivamente ao Aluno 1
      const privadoDb = await pool.query(
        `INSERT INTO treinos (criador_id, titulo, descricao, nivel, tempo_estimado_min, cor_tema, e_modelo)
         VALUES ($1, 'Treino Privado Aluno 1', 'Ficha exclusiva', 'Avançado', 50, 'coral', FALSE)
         RETURNING id`,
        [aluno1.user.id]
      );
      const privadoId = privadoDb.rows[0].id;

      await pool.query(
        `INSERT INTO treino_exercicios (treino_id, ordem, exercise_id, nome, grupo_muscular, series_padrao, reps_padrao, descanso_padrao, carga_padrao)
         VALUES ($1, 1, 'ex03', 'Crucifixo Inclinado', 'chest', '3x15', '15', '60s', '16')`,
        [privadoId]
      );

      await pool.query(
        `INSERT INTO atribuicoes_treino (treino_id, aluno_id, dias_semana, ativo)
         VALUES ($1, $2, $3, TRUE)`,
        [privadoId, aluno1.user.id, ["SEG", "QUA"]]
      );

      // 4. Aluno 1 consulta /api/aluno/treinos
      const res1 = await request(app)
        .get("/api/aluno/treinos")
        .set("Cookie", aluno1.cookie);

      expect(res1.status).toBe(200);
      expect(res1.body.modelos_biblioteca.length).toBeGreaterThanOrEqual(1);
      const mod1 = res1.body.modelos_biblioteca.find((m) => m.id === modeloId);
      expect(mod1).toBeDefined();
      expect(Array.isArray(mod1.exercicios)).toBe(true);
      expect(mod1.exercicios.length).toBe(2);
      expect(mod1.exercicios[0].nome).toBe("Supino Reto");
      expect(mod1.exercicios[0].series_padrao).toBe("4x10");
      expect(mod1.exercicios[1].nome).toBe("Desenvolvimento");

      expect(res1.body.atribuidos.length).toBe(1);
      expect(res1.body.atribuidos[0].id).toBe(privadoId);
      expect(Array.isArray(res1.body.atribuidos[0].exercicios)).toBe(true);
      expect(res1.body.atribuidos[0].exercicios.length).toBe(1);
      expect(res1.body.atribuidos[0].exercicios[0].nome).toBe("Crucifixo Inclinado");

      // 5. Aluno 2 consulta /api/aluno/treinos: deve ver exercícios do modelo, mas NÃO a ficha privada do Aluno 1
      const res2 = await request(app)
        .get("/api/aluno/treinos")
        .set("Cookie", aluno2.cookie);

      expect(res2.status).toBe(200);
      const mod2 = res2.body.modelos_biblioteca.find((m) => m.id === modeloId);
      expect(mod2).toBeDefined();
      expect(mod2.exercicios.length).toBe(2);
      expect(res2.body.atribuidos.length).toBe(0);

      // 6. Teste funcional: Aluno 2 executa o modelo de biblioteca (inicia e salva sessão com exercícios)
      const execModeloRes = await request(app)
        .post("/api/aluno/treinos/execucao")
        .set("Cookie", aluno2.cookie)
        .send({
          treino_id: modeloId,
          duracao_segundos: 2400,
          series_executadas: [
            { nome: mod2.exercicios[0].nome, carga: "60", reps: "10", concluido: true },
          ],
        });
      expect(execModeloRes.status).toBe(201);
      expect(execModeloRes.body.execucao.treino_id).toBe(modeloId);

      // 7. Isolamento de execução: Aluno 2 tenta executar a ficha privada do Aluno 1 -> 403 Forbidden
      const execPrivadoRes = await request(app)
        .post("/api/aluno/treinos/execucao")
        .set("Cookie", aluno2.cookie)
        .send({
          treino_id: privadoId,
          duracao_segundos: 1800,
          series_executadas: [{ nome: "Agachamento", carga: 0, reps: 12, concluido: true }],
        });
      expect(execPrivadoRes.status).toBe(403);
      expect(execPrivadoRes.body.error).toMatch(/acesso negado/i);
    });
  });

  // CASO 2: GET /api/aluno/dashboard respeita estritamente o dia atual
  describe("Caso 2: GET /api/aluno/dashboard não apresenta treino fora do dia", () => {
    it("deve retornar treino_do_dia como null quando nenhuma atribuição corresponder ao dia atual", async () => {
      const aluno = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Aluno Sem Treino Hoje",
        cpf: "123.003.003-46",
        email: "semtreinohoje@teste.com",
        senha: "senhaSegura123",
        tipo: "student",
      });

      // Descobre o dia de hoje e escolhe um dia diferente
      const diasSiglas = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
      const diaHojeIndex = new Date().getDay();
      const outroDiaIndex = (diaHojeIndex + 3) % 7;
      const outroDia = diasSiglas[outroDiaIndex];

      const treinoDb = await pool.query(
        `INSERT INTO treinos (criador_id, titulo, nivel, e_modelo)
         VALUES ($1, 'Treino Outro Dia', 'Iniciante', FALSE)
         RETURNING id`,
        [aluno.user.id]
      );
      const treinoId = treinoDb.rows[0].id;

      await pool.query(
        `INSERT INTO atribuicoes_treino (treino_id, aluno_id, dias_semana, ativo)
         VALUES ($1, $2, $3, TRUE)`,
        [treinoId, aluno.user.id, [outroDia]]
      );

      const res = await request(app)
        .get("/api/aluno/dashboard")
        .set("Cookie", aluno.cookie);

      expect(res.status).toBe(200);
      expect(res.body.treino_do_dia).toBeNull();
    });

    it("deve retornar treino_do_dia com exercícios quando atribuição coincidir com o dia de hoje", async () => {
      const aluno = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Aluno Com Treino Hoje",
        cpf: "123.004.004-80",
        email: "comtreinohoje@teste.com",
        senha: "senhaSegura123",
        tipo: "student",
      });

      const diasSiglas = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
      const diaHoje = diasSiglas[new Date().getDay()];

      const treinoDb = await pool.query(
        `INSERT INTO treinos (criador_id, titulo, nivel, e_modelo)
         VALUES ($1, 'Treino de Hoje Exato', 'Iniciante', FALSE)
         RETURNING id`,
        [aluno.user.id]
      );
      const treinoId = treinoDb.rows[0].id;

      await pool.query(
        `INSERT INTO treino_exercicios (treino_id, ordem, exercise_id, nome, grupo_muscular, series_padrao, reps_padrao, descanso_padrao, carga_padrao)
         VALUES ($1, 1, 'ex_hoje', 'Agachamento', 'quads', '4x8', '8', '90s', '80')`,
        [treinoId]
      );

      await pool.query(
        `INSERT INTO atribuicoes_treino (treino_id, aluno_id, dias_semana, ativo)
         VALUES ($1, $2, $3, TRUE)`,
        [treinoId, aluno.user.id, [diaHoje]]
      );

      const res = await request(app)
        .get("/api/aluno/dashboard")
        .set("Cookie", aluno.cookie);

      expect(res.status).toBe(200);
      expect(res.body.treino_do_dia).not.toBeNull();
      expect(res.body.treino_do_dia.id).toBe(treinoId);
      expect(res.body.treino_do_dia.exercicios.length).toBe(1);
      expect(res.body.treino_do_dia.exercicios[0].nome).toBe("Agachamento");
    });
  });

  // Contratos do catálogo local cobertos em catalog.test.js; proxy externo removido.

  // CASO 4: GET /api/health com status 503 quando BD ausente/desconectado e 200 após SELECT 1
  describe("Caso 4: GET /api/health com SELECT 1 e sem efeitos de escrita", () => {
    it("deve retornar 503 degraded sem vazar credenciais quando o pool de banco não estiver configurado", async () => {
      setPool(null);
      const originalEnvUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        const res = await request(app).get("/api/health");
        expect(res.status).toBe(503);
        expect(res.body.status).toBe("degraded");
        expect(res.body.database).toBe("disconnected");
        expect(JSON.stringify(res.body)).not.toContain("postgresql://");
      } finally {
        if (originalEnvUrl) process.env.DATABASE_URL = originalEnvUrl;
        setPool(pool);
      }
    });

    it("deve retornar 503 degraded quando a consulta SELECT 1 falhar", async () => {
      const failingPool = {
        query: vi.fn().mockRejectedValue(new Error("Connection refused")),
      };
      setPool(failingPool);

      try {
        const res = await request(app).get("/api/health");
        expect(res.status).toBe(503);
        expect(res.body.status).toBe("degraded");
        expect(res.body.database).toBe("disconnected");
      } finally {
        setPool(pool);
      }
    });

    it("deve retornar 200 ok quando SELECT 1 for bem-sucedido no pool", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.database).toBe("connected");
    });
  });

  // CASO 5: client/index.html sem script de analytics não configurado
  describe("Caso 5: client/index.html limpo", () => {
    it("não deve conter %VITE_ANALYTICS_ENDPOINT% e deve preservar carregamento Vite", () => {
      const htmlPath = path.resolve(rootDir, "client", "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      expect(html).not.toContain("%VITE_ANALYTICS_ENDPOINT%");
      expect(html).not.toContain("%VITE_ANALYTICS_WEBSITE_ID%");
      expect(html).toContain('<script type="module" src="/src/main.jsx"></script>');
    });
  });

  // CASO 6: README.md e .env.example sem SESSION_SECRET e com instruções precisas de inicialização
  describe("Caso 6: README.md e .env.example coerentes e sem variáveis inúteis", () => {
    it(".env.example não deve conter SESSION_SECRET e deve apontar PORT=5000", () => {
      const envPath = path.resolve(rootDir, ".env.example");
      const content = fs.readFileSync(envPath, "utf-8");
      expect(content).not.toContain("SESSION_SECRET");
      expect(content).toContain("PORT=5000");
    });

    it("README.md deve documentar 2 terminais PowerShell, portas 5000 e 3000, e explicitar banco online não criado", () => {
      const readmePath = path.resolve(rootDir, "README.md");
      const content = fs.readFileSync(readmePath, "utf-8");
      expect(content).toContain("Terminal 1");
      expect(content).toContain("Terminal 2");
      expect(content).toContain("PORT = \"5000\"");
      expect(content).toContain("node server/index.js");
      expect(content).toContain("npm run dev");
      expect(content).toContain("npm run build");
      expect(content).toContain("npm start");
      expect(content).toMatch(/não é criado/i);
    });
  });
});