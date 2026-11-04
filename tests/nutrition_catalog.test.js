import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import { setupTestEnvironment } from "./setup.js";
import {
  loadNutrition,
  seedNutrition,
} from "../server/scripts/seed-nutrition.js";
import {
  scaleNutrients,
  sumNutrients,
} from "../server/services/nutritionService.js";
import { parseCsv } from "../server/scripts/prepare-nutrition.js";
const { data, version } = await loadNutrition();
const ids = new Set(data.vinculos.map(v => v.pof_id));
const fixture = {
  alimentos: data.alimentos.filter(f => [1, 182].includes(f.id)),
  medidas: data.medidas.filter(m => ids.has(m.id)),
  vinculos: data.vinculos,
};
describe("TACO, medidas POF e diário calculado", () => {
  let app, pool, cookie;
  beforeEach(async () => {
    ({ app, pool } = setupTestEnvironment());
    await seedNutrition(pool, fixture, version);
    const r = await request(app)
      .post("/api/auth/register")
      .send({data_nascimento:"2000-01-15",sexo_metabolico:"masculino",
        nome: "Aluno Nutricao",
        cpf: "52998224725",
        email: "nutricao@teste.com",
        senha: "SenhaForte123",
        tipo: "student",
        peso_kg: 70,
        altura_cm: 175,
      });
    expect(r.status, r.body.error).toBe(201);
    cookie = r.headers["set-cookie"];
  });
  afterEach(() => vi.restoreAllMocks());
  it("preserva 597 alimentos, 11.801 medidas, ausências e 12 vínculos específicos", () => {
    expect(data.alimentos.length).toBe(597);
    expect(data.medidas.length).toBe(11801);
    expect(data.vinculos.length).toBe(12);
    expect(
      data.alimentos.some(f => f.nutrientes_100g.proteina_g === null)
    ).toBe(true);
    expect(
      data.alimentos.some(f =>
        Object.values(f.qualificadores).includes("traco")
      )
    ).toBe(true);
    expect(
      data.alimentos.some(f =>
        Object.values(f.qualificadores).includes("inconsistente")
      )
    ).toBe(true);
  });
  it("interpreta CSV com vírgulas, aspas escapadas e quebras de linha", () => {
    expect(
      parseCsv('id,nome\n1,"Arroz, integral"\n2,"Item ""teste"""\n')[1].nome
    ).toBe('Item "teste"');
  });
  it("carga idempotente mantém IDs sem duplicação", async () => {
    await seedNutrition(pool, fixture, version);
    expect((await pool.query("SELECT * FROM alimentos_taco")).rows.length).toBe(
      2
    );
    expect((await pool.query("SELECT * FROM medidas_pof")).rows.length).toBe(
      12
    );
  });
  it("calcula por 100 g, frações, macros e micronutrientes sem converter ausente em zero", () => {
    expect(
      scaleNutrients({ energia_kcal: 200, ferro_mg: 2, retinol_mcg: null }, 25)
    ).toEqual({ energia_kcal: 50, ferro_mg: 0.5, retinol_mcg: null });
    expect(
      sumNutrients([
        { nutrientes: { proteina_g: 1 } },
        { nutrientes: { proteina_g: null } },
      ])
    ).toEqual({
      valores: { proteina_g: null },
      conhecidos: { proteina_g: 1 },
      ausentes: ["proteina_g"],
    });
  });
  it("converte colher de sopa de arroz integral cozido em massa correta", async () => {
    const food = await request(app)
      .get("/api/nutricao/alimentos/1")
      .set("Cookie", cookie);
    expect(food.status, food.body.error).toBe(200);
    const spoon = food.body.medidas.find(
      m => m.original.codigo_medida === "16"
    );
    expect(Number(spoon.gramas)).toBe(20);
    const r = await request(app)
      .post("/api/nutricao/calcular")
      .set("Cookie", cookie)
      .send({
        alimentos: [{ alimento_id: 1, medida_id: spoon.id, quantidade: 2.5 }],
      });
    expect(r.status, r.body.error).toBe(200);
    expect(r.body.alimentos[0].gramas).toBe(50);
    expect(r.body.valores.energia_kcal).toBeCloseTo(
      fixture.alimentos[0].nutrientes_100g.energia_kcal * 0.5,
      5
    );
  });
  it("bloqueia medida de outro alimento e quantidades inválidas", async () => {
    const banana = fixture.vinculos.find(v => v.taco_id === 182).pof_id;
    for (const entry of [
      { alimento_id: 1, medida_id: banana, quantidade: 1 },
      { alimento_id: 1, quantidade: -1 },
      { alimento_id: 1, quantidade: true },
      { alimento_id: 1, quantidade: 10001 },
    ])
      expect(
        (
          await request(app)
            .post("/api/nutricao/calcular")
            .set("Cookie", cookie)
            .send({ alimentos: [entry] })
        ).status
      ).toBe(400);
  });
  it("busca no banco sem rede e protege curadoria por perfil", async () => {
    const fetch = vi
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("Sem internet"));
    const r = await request(app)
      .get("/api/nutricao/alimentos?busca=ARROZ%20INTEGRAL")
      .set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.body[0].id).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (
        await request(app)
          .post("/api/nutricao/vinculos")
          .set("Cookie", cookie)
          .send({})
      ).status
    ).toBe(403);
  });
  it("persiste cálculo do servidor, micronutrientes, água e autoria sem confiar nas calorias do cliente", async () => {
    await request(app)
      .post("/api/aluno/hidratacao")
      .set("Cookie", cookie)
      .send({ incremento_ml: 250 });
    const r = await request(app)
      .post("/api/aluno/refeicoes")
      .set("Cookie", cookie)
      .send({
        titulo: "Almoço",
        kcal: 9999,
        alimentos: [{ alimento_id: 1, quantidade: 100 }],
      });
    expect(r.status, r.body.error).toBe(201);
    expect(Number(r.body.nutricao.calorias_consumidas)).toBeCloseTo(
      fixture.alimentos[0].nutrientes_100g.energia_kcal,
      5
    );
    expect(r.body.nutricao.agua_ml).toBe(250);
    expect(r.body.nutricao.refeicoes[0].alimentos[0].nome).toMatch(/Arroz/);
    expect(r.body.nutricao.nutrientes_totais.valores.ferro_mg).toBeGreaterThan(
      0
    );
    const again = await request(app)
      .post("/api/aluno/refeicoes")
      .set("Cookie", cookie)
      .send({
        titulo: "Jantar",
        alimentos: [{ alimento_id: 1, quantidade: 50 }],
      });
    expect(again.status, again.body.error).toBe(201);
    expect(again.body.nutricao.refeicoes.length).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT * FROM auditoria_operacoes WHERE operacao='REGISTRO_REFEICAO'"
        )
      ).rows.length
    ).toBe(2);
  });
  it("ausência de correspondência mantém gramas disponíveis", async () => {
    await pool.query(
      "UPDATE vinculos_taco_pof SET ativo=FALSE WHERE taco_id=1"
    );
    const r = await request(app)
      .get("/api/nutricao/alimentos/1")
      .set("Cookie", cookie);
    expect(r.body.medidas).toEqual([]);
    expect(
      (
        await request(app)
          .post("/api/nutricao/calcular")
          .set("Cookie", cookie)
          .send({ alimentos: [{ alimento_id: 1, quantidade: 10 }] })
      ).status
    ).toBe(200);
  });
});
