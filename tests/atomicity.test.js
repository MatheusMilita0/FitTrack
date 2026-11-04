import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { setupTestEnvironment } from "./setup.js";

describe("Atomicidade e Transações em Operações Concorrentes e Parciais", () => {
  let app;
  let pool;
  let memDb;

  beforeEach(() => {
    const env = setupTestEnvironment();
    app = env.app;
    pool = env.pool;
    memDb = env.memDb;

    // Emulação de controle transacional no pg-mem via snapshots
    let txBackup = null;
    memDb.public.interceptQueries((sql) => {
      if (/^\s*begin/i.test(sql)) {
        txBackup = memDb.backup();
        return [];
      }
      if (/^\s*rollback/i.test(sql)) {
        if (txBackup) {
          txBackup.restore();
          txBackup = null;
        }
        return [];
      }
      if (/^\s*commit/i.test(sql)) {
        txBackup = null;
        return [];
      }
      return null;
    });

    // Registra suporte a jsonb_build_array e operador || no catálogo
    const cat = memDb.getSchema("pg_catalog");
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

  async function cadastrarPersonal(dados = {}) {
    const payload = {data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: dados.nome || "Personal Atomico",
      cpf: dados.cpf || "111.222.333-96",
      email: dados.email || "personal.atomico@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: dados.cref || "12345-G/SP",
      area_formacao: "Ed Física",
      atuacao_principal: "Musculação",
    };
    const res = await request(app).post("/api/auth/register").send(payload);
    return { res, cookie: res.headers["set-cookie"] };
  }

  async function cadastrarAluno(dados = {}) {
    const payload = {data_nascimento:"2000-01-15",sexo_metabolico:"masculino",
      nome: dados.nome || "Aluno Atomico",
      cpf: dados.cpf || "222.333.444-05",
      email: dados.email || "aluno.atomico@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
      peso_kg: 70,
      altura_cm: 175,
      idade: 22,
      objetivo: "Hipertrofia",
    };
    const res = await request(app).post("/api/auth/register").send(payload);
    return { res, cookie: res.headers["set-cookie"] };
  }

  describe("1. POST /api/auth/register - Transação atômica e rollback", () => {
    it("deve realizar rollback e não deixar conta órfã quando a inserção do perfil falha (CREF duplicado)", async () => {
      // 1. Cadastra o primeiro personal com sucesso
      const p1 = await cadastrarPersonal({
        nome: "Personal Original",
        cpf: "111.111.112-00",
        email: "p1.original@teste.com",
        cref: "620101-G/SP",
      });
      expect(p1.res.status).toBe(201);

      // 2. Tenta cadastrar segundo personal com o mesmo CREF
      const p2Res = await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Personal Duplicado",
        cpf: "222.222.223-03",
        email: "p2.duplicado@teste.com",
        senha: "senhaSegura123",
        tipo: "personal",
        cref: "620101-G/SP",
        area_formacao: "Ed Física",
        atuacao_principal: "Treinamento Funcional",
      });

      // Deve retornar conflito 409
      expect(p2Res.status).toBe(409);
      expect(p2Res.body.error).toMatch(/cref|conta/i);

      // Não deve ter emitido cookie de sessão
      const cookies = p2Res.headers["set-cookie"];
      expect(cookies).toBeUndefined();

      // PROVA ATÔMICA DE ROLLBACK: O usuário p2 NÃO deve constar na tabela usuarios
      const userCheck = await pool.query(
        "SELECT id, nome, email FROM usuarios WHERE email = 'p2.duplicado@teste.com'"
      );
      expect(userCheck.rows.length).toBe(0);

      // Não deve haver sessões registradas para o usuário órfão
      const sessionCheck = await pool.query("SELECT * FROM sessoes WHERE usuario_id NOT IN (SELECT id FROM usuarios)");
      expect(sessionCheck.rows.length).toBe(0);
    });

    it("deve retornar 409 adequado para conflito de email, CPF ou CREF sem vazar dados sensíveis", async () => {
      await cadastrarPersonal({
        nome: "Personal Base",
        cpf: "333.333.334-14",
        email: "base@teste.com",
        cref: "620102-G/SP",
      });

      // Conflito por email
      const resEmail = await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Outro Nome",
        cpf: "444.444.445-25",
        email: "base@teste.com",
        senha: "senhaSegura123",
        tipo: "student",
      });
      expect(resEmail.status).toBe(409);
      expect(resEmail.body.error).toBeDefined();
      expect(resEmail.body.senha).toBeUndefined();

      // Conflito por CPF
      const resCpf = await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Outro Nome",
        cpf: "333.333.334-14",
        email: "outro@teste.com",
        senha: "senhaSegura123",
        tipo: "student",
      });
      expect(resCpf.status).toBe(409);
      expect(resCpf.body.error).toBeDefined();

      // Conflito por CREF
      const resCref = await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Personal Outro",
        cpf: "555.555.556-36",
        email: "outro.personal@teste.com",
        senha: "senhaSegura123",
        tipo: "personal",
        cref: "620102-G/SP",
        area_formacao: "Ed Física",
        atuacao_principal: "Geral",
      });
      expect(resCref.status).toBe(409);
      expect(resCref.body.error).toBeDefined();
    });
  });

  describe("2. POST /api/personal/treinos - Transação atômica e rollback de ficha", () => {
    it("deve rejeitar payload inválido antes de abrir transação", async () => {
      const personal = await cadastrarPersonal({
        nome: "Personal Ficha",
        cpf: "666.666.667-47",
        email: "personal.ficha@teste.com",
        cref: "620103-G/SP",
      });

      // Aprova CREF e ativa usuário para permitir criação de treinos
      await pool.query(
        "UPDATE usuarios SET status = 'Ativo' WHERE email = 'personal.ficha@teste.com'"
      );
      await pool.query(
        "UPDATE perfis_personais SET status_cref = 'Validado' WHERE cref = '620103-G/SP'"
      );

      // Título vazio deve retornar 400
      const resSemTitulo = await request(app)
        .post("/api/personal/treinos")
        .set("Cookie", personal.cookie)
        .send({
          titulo: "",
          exercicios: [],
        });
      expect(resSemTitulo.status).toBe(400);

      // exercicios não-array deve retornar 400
      const resExInvalido = await request(app)
        .post("/api/personal/treinos")
        .set("Cookie", personal.cookie)
        .send({
          titulo: "Treino Invalido",
          exercicios: "não é array",
        });
      expect(resExInvalido.status).toBe(400);
    });

    it("deve executar rollback completo quando o segundo exercício falha (0 treinos e 0 itens persistidos)", async () => {
      const personal = await cadastrarPersonal({
        nome: "Personal Treino Atomic",
        cpf: "777.777.778-58",
        email: "personal.atomic@teste.com",
        cref: "620104-G/SP",
      });

      // Aprova CREF e ativa usuário
      await pool.query(
        "UPDATE usuarios SET status = 'Ativo' WHERE email = 'personal.atomic@teste.com'"
      );
      await pool.query(
        "UPDATE perfis_personais SET status_cref = 'Validado' WHERE cref = '620104-G/SP'"
      );

      // Envia treino com 2 exercícios: o primeiro válido e o segundo inválido no banco (> 150 chars)
      const resFalha = await request(app)
        .post("/api/personal/treinos")
        .set("Cookie", personal.cookie)
        .send({
          titulo: "Treino Falha Segundo Exercicio",
          exercicios: [
            {
              nome: "Supino Reto Valido",
              grupo_muscular: "Peito",
            },
            {
              // Excede VARCHAR(150) da coluna nome no banco de dados
              nome: "X".repeat(200),
              grupo_muscular: "Peito",
            },
          ],
        });

      expect(resFalha.status).toBe(400);

      // PROVA ATÔMICA: nenhum treino com este título deve existir
      const treinosCheck = await pool.query(
        "SELECT * FROM treinos WHERE titulo = 'Treino Falha Segundo Exercicio'"
      );
      expect(treinosCheck.rows.length).toBe(0);

      // PROVA ATÔMICA: nenhum exercício do primeiro item deve ter sido persistido
      const itensCheck = await pool.query(
        "SELECT * FROM treino_exercicios WHERE nome = 'Supino Reto Valido'"
      );
      expect(itensCheck.rows.length).toBe(0);
    });
  });

  describe("3. POST /api/aluno/hidratacao e /refeicoes - UPSERT atômico e agregação cumulativa", () => {
    it("deve realizar dois incrementos de hidratação sem perda e sem erro de UNIQUE na mesma data", async () => {
      const aluno = await cadastrarAluno({
        nome: "Aluno Hidro",
        cpf: "888.888.889-69",
        email: "aluno.hidro@teste.com",
      });

      const res1 = await request(app)
        .post("/api/aluno/hidratacao")
        .set("Cookie", aluno.cookie)
        .send({ incremento_ml: 350 });
      expect(res1.status).toBe(200);
      expect(Number(res1.body.nutricao.agua_ml)).toBe(350);

      const res2 = await request(app)
        .post("/api/aluno/hidratacao")
        .set("Cookie", aluno.cookie)
        .send({ incremento_ml: 450 });
      expect(res2.status).toBe(200);
      expect(Number(res2.body.nutricao.agua_ml)).toBe(800);

      // Confirma no banco que existe exatamente 1 registro para hoje com agua_ml somado
      const dbCheck = await pool.query(
        "SELECT * FROM registros_nutricao WHERE aluno_id = (SELECT id FROM usuarios WHERE email = 'aluno.hidro@teste.com')"
      );
      expect(dbCheck.rows.length).toBe(1);
      expect(Number(dbCheck.rows[0].agua_ml)).toBe(800);
    });

    it("deve acumular duas refeições via JSONB sem perda e agregar macros em instrução única", async () => {
      const aluno = await cadastrarAluno({
        nome: "Aluno Refeicao",
        cpf: "999.999.990-50",
        email: "aluno.refeicao@teste.com",
      });

      // Refeição 1
      const resMeal1 = await request(app)
        .post("/api/aluno/refeicoes")
        .set("Cookie", aluno.cookie)
        .send({
          titulo: "Café da Manhã",
          itens: "Ovos mexidos e aveia",
          kcal: 350,
          proteinas: 25,
          carboidratos: 30,
          gorduras: 12,
        });
      expect(resMeal1.status).toBe(201);
      expect(resMeal1.body.nutricao.refeicoes.length).toBe(1);
      expect(Number(resMeal1.body.nutricao.calorias_consumidas)).toBe(350);
      expect(Number(resMeal1.body.nutricao.proteinas_g)).toBe(25);

      // Refeição 2 na mesma data
      const resMeal2 = await request(app)
        .post("/api/aluno/refeicoes")
        .set("Cookie", aluno.cookie)
        .send({
          titulo: "Almoço Completo",
          itens: "Frango, arroz e salada",
          kcal: 650,
          proteinas: 50,
          carboidratos: 70,
          gorduras: 15,
        });
      expect(resMeal2.status).toBe(201);
      expect(resMeal2.body.nutricao.refeicoes.length).toBe(2);
      expect(Number(resMeal2.body.nutricao.calorias_consumidas)).toBe(1000);
      expect(Number(resMeal2.body.nutricao.proteinas_g)).toBe(75);
      expect(Number(resMeal2.body.nutricao.carboidratos_g)).toBe(100);
      expect(Number(resMeal2.body.nutricao.gorduras_g)).toBe(27);

      // Confirma no banco 1 único registro com 2 refeições
      const dbCheck = await pool.query(
        "SELECT * FROM registros_nutricao WHERE aluno_id = (SELECT id FROM usuarios WHERE email = 'aluno.refeicao@teste.com')"
      );
      expect(dbCheck.rows.length).toBe(1);
      expect(Number(dbCheck.rows[0].calorias_consumidas)).toBe(1000);
    });

    it("deve rejeitar refeição com valores inválidos ou negativos sem realizar writes", async () => {
      const aluno = await cadastrarAluno({
        nome: "Aluno Invalido",
        cpf: "123.987.456-19",
        email: "aluno.invalido@teste.com",
      });

      // kcal negativo
      const resNegKcal = await request(app)
        .post("/api/aluno/refeicoes")
        .set("Cookie", aluno.cookie)
        .send({
          titulo: "Invalido",
          kcal: -200,
        });
      expect(resNegKcal.status).toBe(400);

      // proteinas negativas
      const resNegProt = await request(app)
        .post("/api/aluno/refeicoes")
        .set("Cookie", aluno.cookie)
        .send({
          titulo: "Invalido",
          kcal: 200,
          proteinas: -10,
        });
      expect(resNegProt.status).toBe(400);

      // sem título
      const resSemTitulo = await request(app)
        .post("/api/aluno/refeicoes")
        .set("Cookie", aluno.cookie)
        .send({
          titulo: "",
          kcal: 200,
        });
      expect(resSemTitulo.status).toBe(400);

      // Confirma que NENHUM write foi realizado na tabela registros_nutricao
      const dbCheck = await pool.query(
        "SELECT * FROM registros_nutricao WHERE aluno_id = (SELECT id FROM usuarios WHERE email = 'aluno.invalido@teste.com')"
      );
      expect(dbCheck.rows.length).toBe(0);
    });
  });
});
