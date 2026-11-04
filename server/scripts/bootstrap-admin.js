import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

export function parseArgs(rawArgs = process.argv.slice(2)) {
  const args = {};
  for (const arg of rawArgs) {
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...rest] = arg.slice(2).split("=");
      args[key] = rest.join("=");
    }
  }
  return args;
}

export async function runBootstrap(options = {}) {
  const {
    pool: customPool,
    env = process.env,
    args: customArgs,
    throwOnError = false,
  } = options;

  const args = customArgs !== undefined ? customArgs : parseArgs();

  // Bloqueio estrito de segurança: proibido fornecer senha via linha de comando
  if (args.password !== undefined || args.senha !== undefined) {
    const errorMsg =
      "ERRO DE SEGURANÇA: Não é permitido fornecer a senha do administrador via linha de comando (argumentos de processo ficam visíveis no sistema operacional). Configure ADMIN_PASSWORD no ambiente ou em arquivo .env seguro.";
    console.error(errorMsg);
    if (throwOnError) {
      throw new Error(errorMsg);
    }
    process.exit(1);
  }

  const connectionString = env.DATABASE_URL;
  const email = (env.ADMIN_EMAIL || args.email || "").trim().toLowerCase();
  const password = env.ADMIN_PASSWORD || "";
  const cpf = (env.ADMIN_CPF || args.cpf || "").trim();
  const nome = (env.ADMIN_NAME || args.name || "Administrador FitTrack").trim();

  // Validação estrita das variáveis obrigatórias ANTES de qualquer conexão ao banco
  const missing = [];
  if (!connectionString && !customPool) {
    missing.push("DATABASE_URL");
  }
  if (!email) {
    missing.push("ADMIN_EMAIL");
  }
  if (!password) {
    missing.push("ADMIN_PASSWORD");
  }
  if (!cpf) {
    missing.push("ADMIN_CPF");
  }

  if (missing.length > 0) {
    const errorMsg = `ERRO: Variável(is) obrigatória(s) não configurada(s): ${missing.join(", ")}.`;
    console.error(errorMsg);
    console.error(
      "Defina as variáveis obrigatórias no arquivo .env seguro (fora do controle de versão)."
    );
    console.error("Uso seguro:");
    console.error(
      "  Configure DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_CPF no .env"
    );
    console.error("  Execute: npm run bootstrap:admin");
    if (throwOnError) {
      throw new Error(errorMsg);
    }
    process.exit(1);
  }

  if (password.length < 8) {
    const errorMsg =
      "ERRO: A senha do administrador deve ter pelo menos 8 caracteres.";
    console.error(errorMsg);
    if (throwOnError) {
      throw new Error(errorMsg);
    }
    process.exit(1);
  }

  let pool = customPool;
  let poolCreatedInternally = false;

  if (!pool) {
    const poolConfig = {
      connectionString,
    };

    if (
      connectionString.includes("sslmode=require") ||
      connectionString.includes("ssl=true") ||
      env.NODE_ENV === "production"
    ) {
      poolConfig.ssl = {
        rejectUnauthorized: true,
        ...(env.DB_CA_CERT ? { ca: env.DB_CA_CERT } : {}),
      };
    }

    pool = new pg.Pool(poolConfig);
    poolCreatedInternally = true;
  }

  try {
    // 1. Verificar se já existe um usuário com o e-mail informado
    const existingResult = await pool.query(
      "SELECT id, nome, email, tipo, status FROM usuarios WHERE email = $1",
      [email]
    );

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(password, salt);

    let admin;

    if (existingResult.rows.length > 0) {
      const existingUser = existingResult.rows[0];

      // Proteção de isolamento e privilégios:
      // Se já existe e seu papel NÃO é admin, recusa imediatamente sem promover nem alterar!
      if (existingUser.tipo !== "admin") {
        const errorMsg = `ERRO: Já existe um usuário cadastrado com o e-mail '${email}' com o papel '${existingUser.tipo}'. Operação abortada para evitar promoção indevida de conta não-administradora.`;
        console.error(errorMsg);
        if (throwOnError) {
          throw new Error(errorMsg);
        }
        process.exit(1);
      }

      // Se já é administrador, atualiza de forma segura e idempotente sem alterar papel
      const updateResult = await pool.query(
        `UPDATE usuarios
         SET nome = $1,
             cpf = $2,
             senha_hash = $3,
             status = 'Ativo',
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = $4 AND tipo = 'admin'
         RETURNING id, nome, email, tipo, status`,
        [nome, cpf, senhaHash, existingUser.id]
      );

      admin = updateResult.rows[0];
      console.log(
        "SUCESSO: Conta de administrador existente atualizada com êxito!"
      );
    } else {
      // Inserção de novo administrador
      const insertResult = await pool.query(
        `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo, status)
         VALUES ($1, $2, $3, $4, 'admin', 'Ativo')
         RETURNING id, nome, email, tipo, status`,
        [nome, cpf, email, senhaHash]
      );

      admin = insertResult.rows[0];
      console.log("SUCESSO: Conta de administrador criada com êxito!");
    }

    // Registro seguro nos logs (sem segredos)
    console.log(
      `ID: ${admin.id} | Nome: ${admin.nome} | E-mail: ${admin.email} | Papel: ${admin.tipo} | Status: ${admin.status}`
    );
    return admin;
  } catch (error) {
    if (throwOnError) {
      throw error;
    }
    console.error("FALHA no bootstrap de administrador:", error.message);
    process.exit(1);
  } finally {
    if (poolCreatedInternally && pool) {
      await pool.end();
    }
  }
}

export const bootstrapAdmin = runBootstrap;
export default runBootstrap;

// Execução direta via CLI (ex.: npm run bootstrap:admin ou node server/scripts/bootstrap-admin.js)
const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  runBootstrap({ throwOnError: false }).catch(err => {
    console.error("Erro fatal:", err.message || err);
    process.exit(1);
  });
}
