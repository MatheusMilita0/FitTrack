import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { setupTestEnvironment } from "./setup.js";
import {
  loadDataset,
  seedCatalog,
  normalizeExercise,
  mediaUrls,
} from "../server/services/exerciseCatalog.js";
import { readFile } from "node:fs/promises";
const dataset = new URL(
  "../data/exercises/exercises-ptbr-full-translation.json",
  import.meta.url
);
const manifest = JSON.parse(
  await readFile(
    new URL("../data/exercises/manifest.json", import.meta.url),
    "utf8"
  )
);
const { rows } = await loadDataset(dataset, manifest.sha256);
describe("Catálogo próprio PT-BR", () => {
  let app, pool;
  beforeEach(() => {
    ({ app, pool } = setupTestEnvironment());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it("valida todos os 873 registros e normaliza força sem baixar mídia", () => {
    expect(rows).toHaveLength(873);
    expect(new Set(rows.map(r => r.id)).size).toBe(873);
    expect(rows[0].forca).toBe("puxar");
    expect(rows.every(r => Array.isArray(r.instrucoes) && r.nome)).toBe(true);
    expect(rows.filter(r => !r.instrucoes.length)).toHaveLength(5);
  });
  it("carga repetida faz upsert, atualiza índice e preserva identificadores", async () => {
    await seedCatalog(pool, rows.slice(0, 3), "v1");
    await seedCatalog(pool, rows.slice(0, 3), "v2");
    expect(
      (await pool.query("SELECT * FROM exercicios_catalogo")).rows
    ).toHaveLength(3);
    expect(
      (
        await pool.query("SELECT versao_origem FROM exercicios_catalogo")
      ).rows.every(r => r.versao_origem === "v2")
    ).toBe(true);
  });
  it("busca, filtra e pagina no banco sem chamada externa", async () => {
    await seedCatalog(pool, rows.slice(0, 8), "teste");
    const fetch = vi
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("Rede proibida no teste"));
    const r = await request(app).get(
      "/api/exercicios/catalogo?busca=abdominal&grupo=abdominais&nivel=iniciante&equipamento=peso-do-corpo&limit=1"
    );
    expect(r.status, r.body.error).toBe(200);
    expect(r.body.length).toBe(1);
    expect(r.body[0].name).toBe("Abdominal 3/4");
    expect(r.body[0].instructions[0]).toMatch(/Deite/);
    expect(r.body[0].images).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    const f = await request(app).get("/api/exercicios/filtros");
    expect(f.body.grupos).toContain("abdominais");
    const detail = await request(app).get("/api/exercicios/3_4_Sit-Up");
    expect(detail.body.forca).toBe("puxar");
    expect(
      (await request(app).get("/api/exercicios/catalogo?limit=1&offset=1"))
        .body[0].id
    ).not.toBe(
      (await request(app).get("/api/exercicios/catalogo?limit=1")).body[0].id
    );
  });
  it("busca ignora acentos e atende termos além da página inicial", async () => {
    const ex = {
      ...rows[0],
      id: "teste",
      nome: "Elevação de braços",
      musculos_primarios: ["ombros"],
    };
    await seedCatalog(pool, [ex], "teste");
    expect(
      (await request(app).get("/api/exercicios/catalogo?busca=ELEVACAO"))
        .body[0].id
    ).toBe("teste");
    expect(
      (await request(app).get("/api/exercicios/catalogo?busca=zzzz")).body
    ).toEqual([]);
  });
  it("falha honestamente sem banco, rejeita paginação inválida e não injeta SQL", async () => {
    expect(
      (await request(app).get("/api/exercicios/catalogo?limit=-1")).status
    ).toBe(400);
    expect(
      (
        await request(app).get(
          "/api/exercicios/catalogo?busca=%27%3B%20DROP%20TABLE"
        )
      ).status
    ).toBe(200);
    const spy = vi.spyOn(pool, "query").mockRejectedValue(new Error("offline"));
    expect((await request(app).get("/api/exercicios/catalogo")).status).toBe(
      503
    );
    spy.mockRestore();
  });
  it("mídias usam somente base própria HTTPS e caminhos seguros", () => {
    expect(
      mediaUrls(["3_4_Sit-Up/0.jpg"], "https://storage.example/bucket/")
    ).toEqual(["https://storage.example/bucket/3_4_Sit-Up/0.jpg"]);
    expect(() => mediaUrls(["a.jpg"], "http://storage.example/")).toThrow();
    expect(() =>
      normalizeExercise({
        ...JSON.parse(
          JSON.stringify({
            id: "x",
            name: "X",
            instructions: ["X"],
            primaryMuscles: [],
            secondaryMuscles: [],
          })
        ),
        images: ["../segredo"],
      })
    ).toThrow();
  });
  it("arquivo com checksum diferente é rejeitado antes de gravar", async () => {
    await expect(loadDataset(dataset, "invalido")).rejects.toThrow(/Checksum/);
  });
});
