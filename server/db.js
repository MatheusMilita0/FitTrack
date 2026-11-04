import pg from "pg";
import dotenv from "dotenv";
import { transactionContext } from "./transactionContext.js";

dotenv.config();

const { Pool } = pg;

let activePool = null;

export function getPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  const config = {
    connectionString,
  };

  // Configuração segura de SSL/TLS (NUNCA rejectUnauthorized: false)
  if (
    connectionString.includes("sslmode=require") ||
    connectionString.includes("ssl=true") ||
    process.env.NODE_ENV === "production"
  ) {
    config.ssl = {
      rejectUnauthorized: true,
      ...(process.env.DB_CA_CERT ? { ca: process.env.DB_CA_CERT } : {}),
    };
  }

  return config;
}

export function getPool() {
  if (activePool) {
    return activePool;
  }

  const config = getPoolConfig();
  if (!config) {
    return null;
  }

  activePool = new Pool(config);
  activePool.on("error", err => {
    console.error("Erro inesperado no pool do PostgreSQL:", err);
  });

  return activePool;
}

export function setPool(customPool) {
  activePool = customPool;
}

export async function query(text, params = []) {
  const context = transactionContext.getStore();
  if (context) return context.query(text, params);
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error(
      "DATABASE_URL não configurada no ambiente. Não é possível executar queries."
    );
  }
  return currentPool.query(text, params);
}

export async function getClient() {
  const context = transactionContext.getStore();
  if (context) return context.client();
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error(
      "DATABASE_URL não configurada no ambiente. Não é possível obter cliente."
    );
  }
  return currentPool.connect();
}

export const db = {
  getPool,
  setPool,
  query,
  getClient,
};

export default db;
