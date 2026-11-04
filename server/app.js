import express from "express";
import nutricaoRoutes from "./routes/nutricao.js";
import { authRateLimit } from "./middleware/rateLimit.js";
import cookieParser from "cookie-parser";
import csrfProtection from "./middleware/csrf.js";
import { authenticate } from "./middleware/auth.js";

import authRoutes from "./routes/auth.js";
import usuariosRoutes from "./routes/usuarios.js";
import alunoRoutes from "./routes/aluno.js";
import personalRoutes from "./routes/personal.js";
import chatRoutes from "./routes/chat.js";
import adminRoutes from "./routes/admin.js";
import exerciciosRoutes from "./routes/exercicios.js";
import feedbackRoutes from "./routes/feedback.js";
import { getPool } from "./db.js";
import { transactionalMutation } from "./middleware/transaction.js";

export function createApp() {
  const app = express();

  // Middlewares básicos
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  // Proteção CSRF / validação de Origem nas mutações
  app.use(csrfProtection);

  // Middleware de identificação e validação de sessão em banco
  app.use(authenticate);
  app.use("/api", transactionalMutation);

  // Healthcheck da API e banco
  app.get("/api/health", async (_req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: "Banco de dados não configurado ou pool indisponível.",
      });
    }

    try {
      // Validação estrita com SELECT 1 (somente leitura, sem efeito colateral de escrita)
      await pool.query("SELECT 1");
      return res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "connected",
      });
    } catch {
      return res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: "Falha na comunicação com o banco de dados.",
      });
    }
  });

  // Rotas de API
  app.use("/api/auth", authRateLimit(), authRoutes);
  app.use("/api/usuarios", usuariosRoutes);
  app.use("/api/aluno", alunoRoutes);
  app.use("/api/nutricao", nutricaoRoutes);
  app.use("/api/personal", personalRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/exercicios", exerciciosRoutes);
  app.use("/api/feedbacks", feedbackRoutes);

  // Handler de erros global
  app.use((err, _req, res, _next) => {
    console.error("Unhandled API Error:", err);
    return res.status(err.status || 500).json({
      error:
        err.status && err.status < 500
          ? err.message
          : "Erro interno do servidor.",
    });
  });

  return app;
}

export default createApp;
