import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { setupTestEnvironment } from "./setup.js";
import { runBootstrap, parseArgs } from "../server/scripts/bootstrap-admin.js";

describe("Bootstrap Seguro do Administrador (bootstrap-admin.js)", () => {
  let pool;

  beforeEach(() => {
    const env = setupTestEnvironment();
    pool = env.pool;
  });

  describe("Validação Prévia de Variáveis de Ambiente e Argumentos CLI", () => {
    it("deve recusar antes de conectar se faltar ADMIN_PASSWORD", async () => {
      await expect(
        runBootstrap({
          pool,
          env: {
            ADMIN_EMAIL: "admin@fittrack.com.br",
            ADMIN_CPF: "123.456.789-09",
          },
          args: {},
          throwOnError: true,
        })
      ).rejects.toThrow(/ADMIN_PASSWORD/);
    });

    it("deve recusar antes de conectar se faltar ADMIN_EMAIL", async () => {
      await expect(
        runBootstrap({
          pool,
          env: {
            ADMIN_PASSWORD: "SenhaSuperSegura!123",
            ADMIN_CPF: "123.456.789-09",
          },
          args: {},
          throwOnError: true,
        })
      ).rejects.toThrow(/ADMIN_EMAIL/);
    });

    it("deve recusar antes de conectar se faltar ADMIN_CPF", async () => {
      await expect(
        runBootstrap({
          pool,
          env: {
            ADMIN_EMAIL: "admin@fittrack.com.br",
            ADMIN_PASSWORD: "SenhaSuperSegura!123",
          },
          args: {},
          throwOnError: true,
        })
      ).rejects.toThrow(/ADMIN_CPF/);
    });

    it("deve recusar antes de conectar se faltar DATABASE_URL quando pool não for injetado", async () => {
      await expect(
        runBootstrap({
          env: {
            ADMIN_EMAIL: "admin@fittrack.com.br",
            ADMIN_PASSWORD: "SenhaSuperSegura!123",
            ADMIN_CPF: "123.456.789-09",
          },
          args: {},
          throwOnError: true,
        })
      ).rejects.toThrow(/DATABASE_URL/);
    });

    it("deve recusar senha com menos de 8 caracteres", async () => {
      await expect(
        runBootstrap({
          pool,
          env: {
            ADMIN_EMAIL: "admin@fittrack.com.br",
            ADMIN_PASSWORD: "123",
            ADMIN_CPF: "123.456.789-09",
          },
          args: {},
          throwOnError: true,
        })
      ).rejects.toThrow(/pelo menos 8 caracteres/);
    });

    it("deve recusar expressamente se senha for fornecida via argumentos CLI", async () => {
      await expect(
        runBootstrap({
          pool,
          env: {
            ADMIN_EMAIL: "admin@fittrack.com.br",
            ADMIN_PASSWORD: "SenhaSuperSegura!123",
            ADMIN_CPF: "123.456.789-09",
          },
          args: { password: "senhaViaParametroCLI" },
          throwOnError: true,
        })
      ).rejects.toThrow(/Não é permitido fornecer a senha do administrador via linha de comando/);
    });

    it("deve fazer o parsing correto de argumentos CLI suportados", () => {
      const parsed = parseArgs(["--email=novo@fittrack.com", "--name=Novo Nome"]);
      expect(parsed.email).toBe("novo@fittrack.com");
      expect(parsed.name).toBe("Novo Nome");
    });
  });

  describe("Prevenção contra Elevação Indevida de Privilégios (Conflito de E-mail)", () => {
    it("deve recusar e falhar explicitamente se o e-mail pertencer a um usuário do tipo student", async () => {
      const originalHash = await bcrypt.hash("senhaOriginalAluno123", 10);
      await pool.query(
        `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo, status)
         VALUES ('Aluno Existente', '111.222.333-96', 'aluno@conflito.com', $1, 'student', 'Ativo')`,
        [originalHash]
      );

      await expect(
        runBootstrap({
          pool,
          env: {
            ADMIN_EMAIL: "aluno@conflito.com",
            ADMIN_PASSWORD: "NovaSenhaAdmin!456",
            ADMIN_CPF: "999.888.777-14",
            ADMIN_NAME: "Admin Invasor",
          },
          args: {},
          throwOnError: true,
        })
      ).rejects.toThrow(/evitar promoção indevida/);

      // Garante que o usuário aluno original NÃO foi promovido a admin nem teve dados alterados
      const checkRes = await pool.query(
        "SELECT id, nome, email, tipo, senha_hash FROM usuarios WHERE email = $1",
        ["aluno@conflito.com"]
      );
      expect(checkRes.rows[0].tipo).toBe("student");
      expect(checkRes.rows[0].nome).toBe("Aluno Existente");
      expect(checkRes.rows[0].senha_hash).toBe(originalHash);
    });

    it("deve recusar e falhar explicitamente se o e-mail pertencer a um usuário do tipo personal", async () => {
      const originalHash = await bcrypt.hash("senhaOriginalPersonal123", 10);
      await pool.query(
        `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo, status)
         VALUES ('Personal Existente', '555.666.777-20', 'personal@conflito.com', $1, 'personal', 'Ativo')`,
        [originalHash]
      );

      await expect(
        runBootstrap({
          pool,
          env: {
            ADMIN_EMAIL: "personal@conflito.com",
            ADMIN_PASSWORD: "NovaSenhaAdmin!456",
            ADMIN_CPF: "999.888.777-14",
          },
          args: {},
          throwOnError: true,
        })
      ).rejects.toThrow(/evitar promoção indevida/);

      const checkRes = await pool.query(
        "SELECT id, nome, email, tipo, senha_hash FROM usuarios WHERE email = $1",
        ["personal@conflito.com"]
      );
      expect(checkRes.rows[0].tipo).toBe("personal");
      expect(checkRes.rows[0].senha_hash).toBe(originalHash);
    });
  });

  describe("Criação e Idempotência Segura de Administrador", () => {
    it("deve criar novo administrador com sucesso quando não há conflito", async () => {
      const admin = await runBootstrap({
        pool,
        env: {
          ADMIN_EMAIL: "novoadmin@fittrack.com.br",
          ADMIN_PASSWORD: "SenhaForteCriacao!99",
          ADMIN_CPF: "333.444.555-08",
          ADMIN_NAME: "Admin Seguro",
        },
        args: {},
        throwOnError: true,
      });

      expect(admin).toBeDefined();
      expect(admin.email).toBe("novoadmin@fittrack.com.br");
      expect(admin.tipo).toBe("admin");
      expect(admin.status).toBe("Ativo");

      const dbUser = await pool.query(
        "SELECT * FROM usuarios WHERE email = $1",
        ["novoadmin@fittrack.com.br"]
      );
      expect(dbUser.rows.length).toBe(1);
      const isMatch = await bcrypt.compare("SenhaForteCriacao!99", dbUser.rows[0].senha_hash);
      expect(isMatch).toBe(true);
    });

    it("deve atualizar de forma idempotente quando a conta existente já for do tipo admin", async () => {
      const oldHash = await bcrypt.hash("SenhaAntigaAdmin!1", 10);
      const insertRes = await pool.query(
        `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo, status)
         VALUES ('Admin Anterior', '123.123.123-87', 'admin@existente.com', $1, 'admin', 'Ativo')
         RETURNING id`,
        [oldHash]
      );
      const existingId = insertRes.rows[0].id;

      const updatedAdmin = await runBootstrap({
        pool,
        env: {
          ADMIN_EMAIL: "admin@existente.com",
          ADMIN_PASSWORD: "NovaSenhaAdminForte!2",
          ADMIN_CPF: "123.123.123-87",
          ADMIN_NAME: "Admin Nome Atualizado",
        },
        args: {},
        throwOnError: true,
      });

      expect(updatedAdmin.id).toBe(existingId);
      expect(updatedAdmin.nome).toBe("Admin Nome Atualizado");
      expect(updatedAdmin.tipo).toBe("admin");

      const dbUser = await pool.query("SELECT * FROM usuarios WHERE id = $1", [existingId]);
      expect(dbUser.rows[0].tipo).toBe("admin");
      const isMatch = await bcrypt.compare("NovaSenhaAdminForte!2", dbUser.rows[0].senha_hash);
      expect(isMatch).toBe(true);
    });
  });
});
