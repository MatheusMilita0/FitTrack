import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { setupTestEnvironment } from "./setup.js";

describe("Autenticação e Sessões (/api/auth)", () => {
  let app;
  let pool;
  let memDb;

  beforeEach(() => {
    const env = setupTestEnvironment();
    app = env.app;
    pool = env.pool;
    memDb = env.memDb;

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
  });

  it("deve cadastrar um novo aluno com hash bcrypt real e sessão em banco", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",
        nome: "Aluno Teste",
        cpf: "111.222.333-96",
        email: "aluno@teste.com",
        senha: "senhaSegura123",
        tipo: "student",
        peso_kg: 78.5,
        altura_cm: 180,
        idade: 25,
        objetivo: "Hipertrofia",
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("aluno@teste.com");
    expect(res.body.user.tipo).toBe("student");
    expect(res.body.profile.objetivo).toBe("Hipertrofia");

    // Verifica que o cookie de sessão foi emitido
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/fittrack_session=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);

    // Verifica no banco de dados se a senha foi hasheada com bcrypt
    const dbUser = await pool.query(
      "SELECT senha_hash FROM usuarios WHERE email = 'aluno@teste.com'"
    );
    expect(dbUser.rows.length).toBe(1);
    expect(dbUser.rows[0].senha_hash).not.toBe("senhaSegura123");
    const validHash = await bcrypt.compare(
      "senhaSegura123",
      dbUser.rows[0].senha_hash
    );
    expect(validHash).toBe(true);

    // Verifica se a sessão foi gravada na tabela sessoes
    const sessions = await pool.query("SELECT * FROM sessoes");
    expect(sessions.rows.length).toBe(1);
  });

  it("deve cadastrar personal com status_cref 'Pendente' para validação", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Personal Teste",
        cpf: "555.666.777-20",
        email: "personal@teste.com",
        senha: "senhaSegura123",
        tipo: "personal",
        cref: "99999-G/SP",
        area_formacao: "Educação Física",
        atuacao_principal: "Condicionamento",
      });

    expect(res.status).toBe(201);
    expect(res.body.user.tipo).toBe("personal");
    expect(res.body.profile.status_cref).toBe("Pendente");
  });

  it("deve rejeitar tentativa de cadastro com perfil admin via rota pública", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Hacker Admin",
        cpf: "999.999.990-50",
        email: "hacker@teste.com",
        senha: "senhaSegura123",
        tipo: "admin",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrador não permitido/i);

    // Confirma que não foi inserido no banco
    const dbCheck = await pool.query(
      "SELECT * FROM usuarios WHERE email = 'hacker@teste.com'"
    );
    expect(dbCheck.rows.length).toBe(0);
  });

  it("deve rejeitar duplicidade de e-mail ou CPF", async () => {
    await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno ",
      cpf: "123.123.123-87",
      email: "dup@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    const resDup = await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno ",
      cpf: "123.123.123-87",
      email: "dup@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    expect(resDup.status).toBe(409);
  });

  it("deve executar rollback e não deixar conta órfã quando a inserção do perfil falha por CREF duplicado", async () => {
    // 1. Cadastra primeiro personal com sucesso
    const res1 = await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Um",
      cpf: "123.456.789-09",
      email: "personal1@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "620100-G/SP",
      area_formacao: "Educação Física",
      atuacao_principal: "Musculação",
    });
    expect(res1.status).toBe(201);

    // 2. Tenta cadastrar segundo personal com mesmo CREF
    const resDup = await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Dois",
      cpf: "529.982.247-25",
      email: "personal2@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "620100-G/SP",
      area_formacao: "Educação Física",
      atuacao_principal: "Musculação",
    });
    expect(resDup.status).toBe(409);
    expect(resDup.body.error).toMatch(/cref/i);
    expect(resDup.headers["set-cookie"]).toBeUndefined();

    // 3. Prova do rollback: nenhum registro do segundo usuário deve existir em usuarios
    const checkUser = await pool.query(
      "SELECT id FROM usuarios WHERE email = 'personal2@teste.com'"
    );
    expect(checkUser.rows.length).toBe(0);

    // 4. Prova do rollback: nenhuma sessão criada para o segundo usuário
    const checkSessions = await pool.query(
      "SELECT * FROM sessoes WHERE usuario_id NOT IN (SELECT id FROM usuarios)"
    );
    expect(checkSessions.rows.length).toBe(0);
  });

  it("deve autenticar usuário no login e validar sessão via /api/auth/me", async () => {
    // Registra usuário
    await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Login",
      cpf: "321.321.321-78",
      email: "login@teste.com",
      senha: "minhaSenha123",
      tipo: "student",
    });

    // Login com senha errada
    const resErr = await request(app).post("/api/auth/login").send({
      identifier: "login@teste.com",
      senha: "senhaErrada",
    });
    expect(resErr.status).toBe(401);

    // Login correto
    const resOk = await request(app).post("/api/auth/login").send({
      identifier: "login@teste.com",
      senha: "minhaSenha123",
    });
    expect(resOk.status).toBe(200);

    const cookie = resOk.headers["set-cookie"];

    // Acessa /api/auth/me com o cookie recebido
    const resMe = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(resMe.status).toBe(200);
    expect(resMe.body.user.email).toBe("login@teste.com");
  });

  it("deve invalidar a sessão no logout", async () => {
    const regRes = await request(app).post("/api/auth/register").send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Logout",
      cpf: "789.789.789-32",
      email: "logout@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    const cookie = regRes.headers["set-cookie"];

    // Logout
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie);
    expect(logoutRes.status).toBe(200);

    // Tentativa de acessar /api/auth/me após logout deve retornar 401
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);
    expect(meRes.status).toBe(401);
  });

  it("deve permitir fluxo completo de recuperação e redefinição de senha com token seguro (RN13, RN02, UC03)", async () => {
    // 1. Cadastra usuário
    await request(app)
      .post("/api/auth/register")
      .send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        nome: "Usuario Recupera",
        cpf: "111.444.777-35",
        email: "recupera@fittrack.com",
        senha: "SenhaAntiga123",
        tipo: "student",
      });

    // 2. Solicita recuperação de senha
    const reqRes = await request(app)
      .post("/api/auth/recuperar-senha")
      .send({ email: "recupera@fittrack.com" });

    expect(reqRes.status).toBe(200);
    expect(reqRes.body.message).toMatch(/instruções/i);

    // 3. Verifica se token foi gravado no banco
    const tokens = await pool.query(
      "SELECT * FROM tokens_recuperacao_senha WHERE usado = FALSE"
    );
    expect(tokens.rows.length).toBe(1);

    // 4. Busca token enviado pelo emailService
    const { getLastSentEmail } = await import("../server/services/emailService.js");
    const lastEmail = getLastSentEmail();
    expect(lastEmail).not.toBeNull();
    expect(lastEmail.to).toBe("recupera@fittrack.com");

    const matchToken = lastEmail.text.match(/Token:\s+([a-f0-9]{64})/i);
    expect(matchToken).not.toBeNull();
    const rawToken = matchToken[1];

    // 5. Tenta redefinir com senha fraca (RN02) -> deve falhar com 400
    const failRes = await request(app)
      .post("/api/auth/redefinir-senha")
      .send({ token: rawToken, novaSenha: "fraca" });
    expect(failRes.status).toBe(400);

    // 6. Redefine com nova senha forte
    const okRes = await request(app)
      .post("/api/auth/redefinir-senha")
      .send({ token: rawToken, novaSenha: "NovaSenhaForte456!" });
    expect(okRes.status).toBe(200);

    // 7. Tenta reutilizar o mesmo token -> deve falhar (uso único)
    const reuseRes = await request(app)
      .post("/api/auth/redefinir-senha")
      .send({ token: rawToken, novaSenha: "OutraSenha123!" });
    expect(reuseRes.status).toBe(400);

    // 8. Tenta logar com a senha antiga -> deve falhar 401
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "recupera@fittrack.com", senha: "SenhaAntiga123" });
    expect(oldLogin.status).toBe(401);

    // 9. Loga com a nova senha -> sucesso 200
    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "recupera@fittrack.com", senha: "NovaSenhaForte456!" });
    expect(newLogin.status).toBe(200);
  });
});
