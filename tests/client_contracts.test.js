import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("FitTrack Frontend Contracts & Security Rules", () => {
  const rootDir = path.resolve(__dirname, "..");
  const appPath = path.resolve(rootDir, "client", "src", "App.jsx");
  const apiPath = path.resolve(rootDir, "client", "src", "lib", "api.js");
  const authScreensPath = path.resolve(
    rootDir,
    "client",
    "src",
    "components",
    "screens",
    "AuthScreens.jsx"
  );

  it("App.jsx deve implementar verificação obrigatória de sessão via /api/auth/me", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain("/api/auth/me");
  });

  it("App.jsx NÃO deve conter login simulado loginAs(demoRole)", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).not.toContain("loginAs(demoRole)");
    expect(content).not.toContain("setDemoRole");
  });

  it("AuthScreens.jsx deve conter formulário controlado sem seletor de papel demo", () => {
    const content = fs.readFileSync(authScreensPath, "utf-8");
    expect(content).not.toContain("demoRole");
    expect(content).toContain("identifier");
    expect(content).toContain("senha");
    expect(content).toContain("api.login");
  });

  it("api.js deve utilizar credentials: 'same-origin' em todas as requisições", () => {
    const content = fs.readFileSync(apiPath, "utf-8");
    expect(content).toContain("credentials: \"same-origin\"");
  });

  it("Nenhum arquivo de código do cliente deve conter referências a DATABASE_URL ou segredos", () => {
    const clientDir = path.resolve(rootDir, "client", "src");
    const checkDir = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          checkDir(fullPath);
        } else if (file.endsWith(".js") || file.endsWith(".jsx")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          expect(content).not.toContain("DATABASE_URL");
          expect(content).not.toContain("SESSION_SECRET");
          expect(content).not.toContain("ADMIN_PASSWORD");
        }
      }
    };
    checkDir(clientDir);
  });

  it("Deve cumprir o critério de pronto estrito definido no briefing", () => {
    const s = fs.readFileSync(appPath, "utf8");
    const passed = s.includes("/api/auth/me") && !s.includes("loginAs(demoRole)");
    expect(passed).toBe(true);
  });
});
