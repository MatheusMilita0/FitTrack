import { describe, expect, it } from "vitest";
import { resolveRoute } from "../client/src/lib/routes.js";

const student = { tipo: "student", status: "Ativo" };
const personal = { tipo: "personal", status: "Ativo" };
const admin = { tipo: "admin", status: "Ativo" };

describe("autorizacao de rotas no cliente", () => {
  it("nao renderiza paginas de outros papeis em links diretos", () => {
    expect(resolveRoute(student, {}, "admin-dashboard")).toBe("student-dashboard");
    expect(resolveRoute(personal, { status_cref: "Validado" }, "nutrition")).toBe("personal-dashboard");
    expect(resolveRoute(admin, {}, "students")).toBe("admin-dashboard");
  });

  it("preserva paginas permitidas e limita personal sem CREF validado", () => {
    expect(resolveRoute(student, {}, "nutrition")).toBe("nutrition");
    expect(resolveRoute(personal, { status_cref: "Validado" }, "students")).toBe("students");
    expect(resolveRoute({ ...personal, status: "Pendente" }, { status_cref: "Pendente" }, "personal-dashboard")).toBe("personal-pending");
    expect(resolveRoute(personal, { status_cref: "Rejeitado" }, "profile")).toBe("personal-pending");
  });

  it("nao revela dados enquanto nao existe usuario autenticado", () => {
    expect(resolveRoute(null, null, "admin-dashboard")).toBe("login");
  });
});
