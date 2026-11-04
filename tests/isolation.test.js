import { vi } from 'vitest';
// Contract simulation: only this test suite replaces the external council adapter.
vi.mock('../server/services/crefService.js', async importOriginal => ({...(await importOriginal()),validarCrefExterno:async()=>({status:'Validado',mock:false,detalhe:'Resposta simulada exclusivamente pelo teste'})}));
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { setupTestEnvironment } from "./setup.js";

describe("Isolamento de Papéis, Vínculos e Segurança (/api/*)", () => {
  let app;
  let pool;

  beforeEach(() => {
    const env = setupTestEnvironment();
    app = env.app;
    pool = env.pool;
  });

  // Helper para cadastrar e obter cookie
  async function cadastrarUsuario(dados) {
    const res = await request(app).post("/api/auth/register").send(dados);
    return {
      user: res.body.user,
      cookie: res.headers["set-cookie"],
    };
  }

  it("aluno não deve ter acesso a rotas exclusivas de personal trainer", async () => {
    const aluno = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Isolado",
      cpf: "111.111.112-00",
      email: "aluno_iso@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    const res = await request(app)
      .get("/api/personal/dashboard")
      .set("Cookie", aluno.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/acesso negado/i);
  });

  it("personal trainer não deve ter acesso a rotas de administrador", async () => {
    const personal = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Isolado",
      cpf: "222.222.223-03",
      email: "personal_iso@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "12345-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Hipertrofia",
    });

    const res = await request(app)
      .get("/api/admin/usuarios")
      .set("Cookie", personal.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/acesso negado/i);
  });

  it("personal não pode prescrever treino para aluno sem vínculo ativo", async () => {
    const personal = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal A",
      cpf: "333.333.334-14",
      email: "personal_a@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "33333-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Geral",
    });

    // Ativa e valida o personal para permitir criação de treino
    await pool.query(
      "UPDATE perfis_personais SET status_cref = 'Validado' WHERE usuario_id = $1",
      [personal.user.id]
    );
    await pool.query(
      "UPDATE usuarios SET status = 'Ativo' WHERE id = $1",
      [personal.user.id]
    );

    const aluno = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno B",
      cpf: "444.444.445-25",
      email: "aluno_b@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    // Cria um treino com o Personal A
    const treinoRes = await request(app)
      .post("/api/personal/treinos")
      .set("Cookie", personal.cookie)
      .send({
        titulo: "Treino Teste Isolamento",
        exercicios: [{ nome: "Flexão", grupo_muscular: "Peito", reps_padrao: "12", descanso_padrao: "60s" }],
      });
    const treinoId = treinoRes.body.treino.id;

    // Tenta atribuir ao Aluno B (SEM vínculo ativo)
    const atribuirRes = await request(app)
      .post("/api/personal/treinos/atribuir")
      .set("Cookie", personal.cookie)
      .send({
        treino_id: treinoId,
        aluno_id: aluno.user.id,
        dias_semana: ["SEG", "QUA"],
      });

    expect(atribuirRes.status).toBe(403);
    expect(atribuirRes.body.error).toMatch(/não autorizado/i);
  });

  it("chat deve bloquear envio de mensagens entre usuários não vinculados", async () => {
    const personal = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal C",
      cpf: "555.555.556-36",
      email: "personal_c@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "55555-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Geral",
    });

    const aluno = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno D",
      cpf: "666.666.667-47",
      email: "aluno_d@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    // Tenta enviar mensagem sem vínculo ativo
    const msgRes = await request(app)
      .post("/api/chat/mensagens")
      .set("Cookie", aluno.cookie)
      .send({
        destinatario_id: personal.user.id,
        texto: "Olá instrutor!",
      });

    expect(msgRes.status).toBe(403);
    expect(msgRes.body.error).toMatch(/acesso negado/i);

    // Agora cria vínculo com status 'active'
    await pool.query(
      `INSERT INTO vinculos_aluno_personal (aluno_id, personal_id, status)
       VALUES ($1, $2, 'active')`,
      [aluno.user.id, personal.user.id]
    );

    // Com vínculo ativo, envio deve suceder
    const msgOk = await request(app)
      .post("/api/chat/mensagens")
      .set("Cookie", aluno.cookie)
      .send({
        destinatario_id: personal.user.id,
        texto: "Olá instrutor com vínculo!",
      });

    expect(msgOk.status).toBe(201);
    expect(msgOk.body.mensagem.texto).toBe("Olá instrutor com vínculo!");
  });

  it("deve bloquear requisições com cabeçalho Origin malicioso (CSRF Protection)", async () => {
    const aluno = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno CSRF",
      cpf: "777.777.778-58",
      email: "csrf@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    const res = await request(app)
      .post("/api/aluno/hidratacao")
      .set("Cookie", aluno.cookie)
      .set("Host", "localhost:3000")
      .set("Origin", "https://site-malicioso.com")
      .send({ incremento_ml: 250 });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF/i);
  });

  // Helper para criar administrador e obter cookie de sessão
  async function criarAdmin() {
    const res = await pool.query(
      `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo, status)
       VALUES ('Admin Teste', '000.000.001-91', 'admintest@fittrack.com', 'hash', 'admin', 'Ativo')
       RETURNING id, nome, email, tipo`
    );
    const adminId = res.rows[0].id;
    await pool.query(
      `INSERT INTO sessoes (token, usuario_id, expira_em)
       VALUES ('admin-iso-token', $1, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [adminId]
    );
    return {
      adminId,
      cookie: ["fittrack_session=admin-iso-token; Path=/; HttpOnly"],
    };
  }

  // 1. Invariante Personal Pendente (RBAC / Auth)
  it("personal pendente de validação CREF não lista alunos nem cria treinos, mas acessa /api/auth/me e logout; passa após validação CREF", async () => {
    const personal = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Pendente",
      cpf: "123.456.789-09",
      email: "personal_pendente@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "88888-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Hipertrofia",
    });

    // 1. Acesso a /api/auth/me é permitido mesmo com status Pendente
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", personal.cookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.status).toBe("Pendente");
    expect(meRes.body.profile.status_cref).toBe("Pendente");

    // 2. Ações protegidas bloqueadas para status Pendente
    const alunosRes = await request(app)
      .get("/api/personal/alunos")
      .set("Cookie", personal.cookie);
    expect(alunosRes.status).toBe(403);
    expect(alunosRes.body.error).toMatch(/pendente|inativo|acesso negado/i);

    const treinoRes = await request(app)
      .post("/api/personal/treinos")
      .set("Cookie", personal.cookie)
      .send({
        titulo: "Treino Personal Pendente",
        exercicios: [{ nome: "Agachamento", grupo_muscular: "Pernas", reps_padrao: "12", descanso_padrao: "60s" }],
      });
    expect(treinoRes.status).toBe(403);
    expect(treinoRes.body.error).toMatch(/pendente|inativo|acesso negado/i);

    // 3. Admin valida o CREF
    const admin = await criarAdmin();
    const validaRes = await request(app)
      .patch(`/api/admin/personais/${personal.user.id}/validar-cref`)
      .set("Cookie", admin.cookie)
      .send({ status_cref: "Validado" });
    expect(validaRes.status).toBe(200);
    expect(validaRes.body.perfil.status_cref).toBe("Validado");

    // 4. Após validação do CREF (status torna-se Ativo), ações protegidas passam
    const alunosApos = await request(app)
      .get("/api/personal/alunos")
      .set("Cookie", personal.cookie);
    expect(alunosApos.status).toBe(200);

    const treinoApos = await request(app)
      .post("/api/personal/treinos")
      .set("Cookie", personal.cookie)
      .send({
        titulo: "Treino Personal Validado",
        exercicios: [{ nome: "Agachamento", grupo_muscular: "Pernas", reps_padrao: "12", descanso_padrao: "60s" }],
      });
    expect(treinoApos.status).toBe(201);
    expect(treinoApos.body.treino.titulo).toBe("Treino Personal Validado");

    // 5. Logout continua acessível
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", personal.cookie);
    expect(logoutRes.status).toBe(200);
  });

  // 2. Invariantes Admin (moderação de status, validação de CREF e invalidação de sessões)
  it("admin não pode ativar personal sem CREF validado via PATCH /api/admin/usuarios/:id/status", async () => {
    const admin = await criarAdmin();
    const personal = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Sem Cref",
      cpf: "321.654.987-91",
      email: "semcref@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "11223-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Pilates",
    });

    // Admin tenta ativar o personal cujo CREF ainda está Pendente
    const ativaRes = await request(app)
      .patch(`/api/admin/usuarios/${personal.user.id}/status`)
      .set("Cookie", admin.cookie)
      .send({ status: "Ativo" });
    expect(ativaRes.status).toBe(400);
    expect(ativaRes.body.error).toMatch(/CREF validado/i);

    // Confirma que status do usuário permanece Pendente no banco
    const userDb = await pool.query("SELECT status FROM usuarios WHERE id = $1", [personal.user.id]);
    expect(userDb.rows[0].status).toBe("Pendente");

    // Admin pode bloquear o personal normalmente
    const blockRes = await request(app)
      .patch(`/api/admin/usuarios/${personal.user.id}/status`)
      .set("Cookie", admin.cookie)
      .send({ status: "Bloqueado" });
    expect(blockRes.status).toBe(200);
    expect(blockRes.body.usuario.status).toBe("Bloqueado");
  });

  it("mudança de CREF para Rejeitado ou Pendente tira status Ativo e invalida sessões", async () => {
    const admin = await criarAdmin();
    const personal = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Ativo Cref",
      cpf: "987.654.321-00",
      email: "ativo_cref@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "44556-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Musculação",
    });

    // Valida o CREF tornando o personal Ativo
    await request(app)
      .patch(`/api/admin/personais/${personal.user.id}/validar-cref`)
      .set("Cookie", admin.cookie)
      .send({ status_cref: "Validado" });

    // Confirma que personal está Ativo e sessão válida
    const meOk = await request(app).get("/api/auth/me").set("Cookie", personal.cookie);
    expect(meOk.status).toBe(200);
    expect(meOk.body.user.status).toBe("Ativo");

    // Admin rejeita o CREF
    const rejRes = await request(app)
      .patch(`/api/admin/personais/${personal.user.id}/validar-cref`)
      .set("Cookie", admin.cookie)
      .send({ status_cref: "Rejeitado" });
    expect(rejRes.status).toBe(200);
    expect(rejRes.body.perfil.status_cref).toBe("Rejeitado");

    // Verifica que usuário perdeu status Ativo no banco (passou a Pendente)
    const userCheck = await pool.query("SELECT status FROM usuarios WHERE id = $1", [personal.user.id]);
    expect(userCheck.rows[0].status).toBe("Pendente");

    // Verifica que a sessão anterior foi invalidada (não existe mais no banco de sessoes)
    const meAposRejeicao = await request(app)
      .get("/api/auth/me")
      .set("Cookie", personal.cookie);
    expect(meAposRejeicao.status).toBe(401);
  });

  it("validação de CREF não reativa conta bloqueada por administrador", async () => {
    const admin = await criarAdmin();
    const personal = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Bloqueado",
      cpf: "111.999.888-39",
      email: "bloqueado_cref@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "66778-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Crossfit",
    });

    // Bloqueia a conta do personal pelo admin
    await request(app)
      .patch(`/api/admin/usuarios/${personal.user.id}/status`)
      .set("Cookie", admin.cookie)
      .send({ status: "Bloqueado" });

    // Valida o CREF enquanto a conta está Bloqueada
    const valRes = await request(app)
      .patch(`/api/admin/personais/${personal.user.id}/validar-cref`)
      .set("Cookie", admin.cookie)
      .send({ status_cref: "Validado" });
    expect(valRes.status).toBe(200);

    // Conta deve permanecer Bloqueada (invariante preservada)
    const userDb = await pool.query("SELECT status FROM usuarios WHERE id = $1", [personal.user.id]);
    expect(userDb.rows[0].status).toBe("Bloqueado");
  });

  // 3. Invariante Execução de Treino pelo Aluno
  it("aluno não pode registrar execução de treino de terceiro que não é modelo nem atribuído", async () => {
    const aluno1 = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno ",
      cpf: "111.000.111-88",
      email: "aluno1_treino@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    const aluno2 = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno ",
      cpf: "222.000.222-55",
      email: "aluno2_treino@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    // Cria treino privado pertencente ao Aluno 1 (não é modelo)
    const treinoPrivado = await pool.query(
      `INSERT INTO treinos (criador_id, titulo, nivel, e_modelo)
       VALUES ($1, 'Treino Privado Aluno 1', 'Avançado', FALSE)
       RETURNING id`,
      [aluno1.user.id]
    );
    const treinoId = treinoPrivado.rows[0].id;

    // Aluno 2 tenta executar o treino de Aluno 1 (não atribuído a ele e não é modelo)
    const execRes = await request(app)
      .post("/api/aluno/treinos/execucao")
      .set("Cookie", aluno2.cookie)
      .send({
        treino_id: treinoId,
        duracao_segundos: 1800,
        series_executadas: [{ nome: "Supino", carga: 50, reps: 10, feito: true }],
      });

    expect(execRes.status).toBe(403);
    expect(execRes.body.error).toMatch(/acesso negado|não disponível/i);

    // Confirma que nenhuma execução foi registrada
    const dbExecs = await pool.query("SELECT * FROM execucoes_treino WHERE treino_id = $1", [treinoId]);
    expect(dbExecs.rows.length).toBe(0);
  });

  it("aluno pode registrar execução de treino atribuído ou modelo da biblioteca", async () => {
    const aluno = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Executor",
      cpf: "333.000.333-22",
      email: "aluno_exec@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    // 1. Treino modelo da biblioteca (e_modelo = TRUE)
    const treinoModelo = await pool.query(
      `INSERT INTO treinos (criador_id, titulo, nivel, e_modelo)
       VALUES ($1, 'Treino Modelo Global', 'Iniciante', TRUE)
       RETURNING id`,
      [aluno.user.id]
    );
    const modeloId = treinoModelo.rows[0].id;

    const execModelo = await request(app)
      .post("/api/aluno/treinos/execucao")
      .set("Cookie", aluno.cookie)
      .send({
        treino_id: modeloId,
        duracao_segundos: 1200,
        series_executadas: [{ nome: "Agachamento", carga: 0, reps: 12, concluido: true }],
      });
    expect(execModelo.status).toBe(201);
    expect(execModelo.body.message).toMatch(/sucesso/i);

    // 2. Treino de terceiro atribuído ativamente ao aluno
    const instrutor = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Instrutor Atribuidor",
      cpf: "444.000.444-08",
      email: "instrutor_atrib@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "44411-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Musculação",
    });

    const treinoAtribuido = await pool.query(
      `INSERT INTO treinos (criador_id, titulo, nivel, e_modelo)
       VALUES ($1, 'Treino Atribuído Personal', 'Intermediário', FALSE)
       RETURNING id`,
      [instrutor.user.id]
    );
    const atribuidoId = treinoAtribuido.rows[0].id;

    await pool.query(
      `INSERT INTO atribuicoes_treino (treino_id, aluno_id, ativo)
       VALUES ($1, $2, TRUE)`,
      [atribuidoId, aluno.user.id]
    );

    const execAtribuido = await request(app)
      .post("/api/aluno/treinos/execucao")
      .set("Cookie", aluno.cookie)
      .send({
        treino_id: atribuidoId,
        duracao_segundos: 2000,
        series_executadas: [{ nome: "Agachamento", carga: 0, reps: 12, concluido: true }],
      });
    expect(execAtribuido.status).toBe(201);

    // 3. Atribuição inativa deve ser rejeitada
    await pool.query(
      `UPDATE atribuicoes_treino SET ativo = FALSE WHERE treino_id = $1 AND aluno_id = $2`,
      [atribuidoId, aluno.user.id]
    );

    const execInativo = await request(app)
      .post("/api/aluno/treinos/execucao")
      .set("Cookie", aluno.cookie)
      .send({
        treino_id: atribuidoId,
        duracao_segundos: 2000,
        series_executadas: [{ nome: "Agachamento", carga: 0, reps: 12, concluido: true }],
      });
    expect(execInativo.status).toBe(403);
  });

  // 4. Invariante Chat (bloqueio de vídeo e garantia de texto puro)
  it("chat rejeita payload com vídeo retornando 501 e força tipo texto com vídeo nulo para mensagens válidas", async () => {
    const personal = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Personal Chat Video",
      cpf: "777.111.222-68",
      email: "chat_video_p@teste.com",
      senha: "senhaSegura123",
      tipo: "personal",
      cref: "99887-G/SP",
      area_formacao: "Ed. Física",
      atuacao_principal: "Geral",
    });

    const aluno = await cadastrarUsuario({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
      nome: "Aluno Chat Video",
      cpf: "888.111.222-10",
      email: "chat_video_a@teste.com",
      senha: "senhaSegura123",
      tipo: "student",
    });

    // Cria vínculo ativo entre aluno e personal
    await pool.query(
      `INSERT INTO vinculos_aluno_personal (aluno_id, personal_id, status)
       VALUES ($1, $2, 'active')`,
      [aluno.user.id, personal.user.id]
    );

    // 1. Tenta enviar mensagem com tipo video_feedback -> 501
    const resTipoVideo = await request(app)
      .post("/api/chat/mensagens")
      .set("Cookie", aluno.cookie)
      .send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        destinatario_id: personal.user.id,
        texto: "Feedback em vídeo da execução do agachamento",
        tipo: "video_feedback",
      });
    expect(resTipoVideo.status).toBe(400);
    expect(resTipoVideo.body.error).toMatch(/HTTPS/i);

    // 2. Tenta enviar mensagem com video_url arbitrário -> 501
    const resUrlVideo = await request(app)
      .post("/api/chat/mensagens")
      .set("Cookie", aluno.cookie)
      .send({
        destinatario_id: personal.user.id,
        texto: "Assista meu vídeo aqui",
        video_url: "https://storage.exemplo.com/videos/execucao.mp4",
      });
    expect(resUrlVideo.status).toBe(201);
    expect(resUrlVideo.body.mensagem.tipo).toBe("video_feedback");

    // 3. Envia mensagem válida de texto mesmo passando outro tipo arbitrário
    const resTexto = await request(app)
      .post("/api/chat/mensagens")
      .set("Cookie", aluno.cookie)
      .send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",peso_kg:70,altura_cm:175,
        destinatario_id: personal.user.id,
        texto: "Mensagem puramente textual de orientação",
        tipo: "orientacao",
      });
    expect(resTexto.status).toBe(201);
    expect(resTexto.body.mensagem.tipo).toBe("texto");
    expect(resTexto.body.mensagem.video_url).toBeNull();

    // Confirma integridade no banco de dados
    const msgDb = await pool.query(
      "SELECT tipo, video_url, texto FROM mensagens_chat WHERE id = $1",
      [resTexto.body.mensagem.id]
    );
    expect(msgDb.rows[0].tipo).toBe("texto");
    expect(msgDb.rows[0].video_url).toBeNull();
  });
});
