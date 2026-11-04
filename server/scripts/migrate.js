import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("ERRO: Variável DATABASE_URL não definida no ambiente.");
    console.error(
      "Configure o arquivo .env ou informe DATABASE_URL na execução."
    );
    process.exit(1);
  }

  const schemaPath = path.resolve(__dirname, "..", "..", "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.error(`ERRO: Arquivo schema.sql não encontrado em: ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, "utf-8");

  console.log("Iniciando migração do esquema PostgreSQL...");
  console.log(`Lendo arquivo: ${schemaPath} (${sql.length} bytes)`);

  const poolConfig = {
    connectionString,
  };

  if (
    connectionString.includes("sslmode=require") ||
    connectionString.includes("ssl=true") ||
    process.env.NODE_ENV === "production"
  ) {
    poolConfig.ssl = {
      rejectUnauthorized: true,
      ...(process.env.DB_CA_CERT ? { ca: process.env.DB_CA_CERT } : {}),
    };
  }

  const pool = new pg.Pool(poolConfig);

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log("SUCESSO: Esquema PostgreSQL migrado e validado com êxito!");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("FALHA na execução da migração:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
