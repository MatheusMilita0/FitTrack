import { startCrefQueue } from "./services/crefQueue.js";
("use strict");
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import { createApp } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer() {
  const app = createApp();
  const server = createServer(app);

  // Caminho dos assets compilados pelo Vite
  const staticPath = fs.existsSync(path.resolve(__dirname, "public"))
    ? path.resolve(__dirname, "public")
    : path.resolve(__dirname, "..", "dist", "public");

  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get("*", (req, res, next) => {
      // Ignora rotas de API no fallback do SPA
      if (req.path.startsWith("/api")) {
        return res
          .status(404)
          .json({ error: "Endpoint de API não encontrado." });
      }
      res.sendFile(path.join(staticPath, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.json({
        message:
          "FitTrack API Server em execução. Frontend não compilado em dist/public.",
      });
    });
  }

  const port =
    Number(process.env.PORT) ||
    (process.env.NODE_ENV === "production" ? 3000 : 5000);

  return new Promise(resolve => {
    server.listen(port, () => {
      console.log(`FitTrack Server running on http://localhost:${port}/`);
      const stopQueue =
        process.env.NODE_ENV !== "test" ? startCrefQueue() : () => {};
      server.on("close", stopQueue);
      resolve({ server, app });
    });
  });
}

// Inicia automaticamente quando executado como script principal
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("index.js") || process.argv[1].includes("server"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  startServer().catch(console.error);
}

export default startServer;
