import { describe, it, expect, beforeEach } from "vitest";
import { setupTestEnvironment } from "./setup.js";

describe("Esquema PostgreSQL (schema.sql)", () => {
  let pool;

  beforeEach(() => {
    const env = setupTestEnvironment();
    pool = env.pool;
  });

  it("deve criar todas as 14 tabelas obrigatórias no banco", async () => {
    const expectedTables = [
      "usuarios",
      "sessoes",
      "perfis_alunos",
      "perfis_personais",
      "vinculos_aluno_personal",
      "treinos",
      "treino_exercicios",
      "atribuicoes_treino",
      "execucoes_treino",
      "registros_nutricao",
      "mensagens_chat",
      "tokens_recuperacao_senha",
      "auditoria_operacoes",
      "feedbacks_treino",
    ];

    for (const table of expectedTables) {
      const res = await pool.query(
        `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = $1`,
        [table]
      );
      expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(1);
    }
  });

  it("deve aplicar unicidade em CPF e e-mail de usuários", async () => {
    await pool.query(
      `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo)
       VALUES ('User A', '111.111.111-11', 'a@email.com', 'hash1', 'student')`
    );

    // Tentativa de duplicar e-mail deve falhar
    await expect(
      pool.query(
        `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo)
         VALUES ('User B', '222.222.222-22', 'a@email.com', 'hash2', 'student')`
      )
    ).rejects.toThrow();

    // Tentativa de duplicar CPF deve falhar
    await expect(
      pool.query(
        `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo)
         VALUES ('User C', '111.111.111-11', 'c@email.com', 'hash3', 'student')`
      )
    ).rejects.toThrow();
  });

  it("deve validar constraint de tipo permitido (student, personal, admin)", async () => {
    await expect(
      pool.query(
        `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo)
         VALUES ('User Inv', '333.333.333-33', 'inv@email.com', 'hash', 'superuser')`
      )
    ).rejects.toThrow();
  });

  it("deve remover dados vinculados em cascata quando o usuário é excluído", async () => {
    const userRes = await pool.query(
      `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo)
       VALUES ('Aluno Exclusao', '444.444.444-44', 'exclusao@email.com', 'hash', 'student')
       RETURNING id`
    );
    const userId = userRes.rows[0].id;

    await pool.query(
      `INSERT INTO perfis_alunos (usuario_id, peso_kg, objetivo)
       VALUES ($1, 80, 'Força')`,
      [userId]
    );

    await pool.query(
      `INSERT INTO sessoes (token, usuario_id, expira_em)
       VALUES ('token-teste-exclusao', $1, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [userId]
    );

    // Remove usuário
    await pool.query("DELETE FROM usuarios WHERE id = $1", [userId]);

    // Verifica se perfil e sessão sumiram
    const perfilCheck = await pool.query(
      "SELECT * FROM perfis_alunos WHERE usuario_id = $1",
      [userId]
    );
    expect(perfilCheck.rows.length).toBe(0);

    const sessionCheck = await pool.query(
      "SELECT * FROM sessoes WHERE usuario_id = $1",
      [userId]
    );
    expect(sessionCheck.rows.length).toBe(0);
  });
});
