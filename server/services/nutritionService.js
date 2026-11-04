import { query, getClient } from "../db.js";
import { serverDay } from "../utils/day.js";
import crypto from "node:crypto";
export const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function scaleNutrients(values, grams) {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 10000)
    throw fail("Porção deve ter de 0 a 10.000 g, sem incluir zero.");
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [
      k,
      v === null ? null : round((v * grams) / 100),
    ])
  );
}
export function sumNutrients(items) {
  const keys = [...new Set(items.flatMap(i => Object.keys(i.nutrientes)))],
    values = {},
    known = {},
    missing = [];
  for (const key of keys) {
    known[key] = round(
      items.reduce(
        (s, i) => s + (i.conhecidos?.[key] ?? i.nutrientes[key] ?? 0),
        0
      )
    );
    const absent = items.some(
      i => i.nutrientes[key] === null || i.nutrientes[key] === undefined
    );
    values[key] = absent ? null : known[key];
    if (absent) missing.push(key);
  }
  return { valores: values, conhecidos: known, ausentes: missing };
}
export async function calculatePortions(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 50)
    throw fail("Informe de 1 a 50 alimentos.");
  const items = [];
  for (const entry of entries) {
    if (
      !entry ||
      !Number.isInteger(Number(entry.alimento_id)) ||
      Number(entry.alimento_id) <= 0
    )
      throw fail("Alimento inválido.");
    const food = (
      await query("SELECT * FROM alimentos_taco WHERE id=$1", [
        Number(entry.alimento_id),
      ])
    ).rows[0];
    if (!food) throw fail("Alimento não encontrado.", 404);
    const quantity = Number(entry.quantidade);
    if (
      typeof entry.quantidade === "boolean" ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 10000
    )
      throw fail("Quantidade inválida.");
    let grams = quantity,
      measure = null;
    if (entry.medida_id && entry.medida_id !== "g") {
      const result = await query(
        "SELECT p.* FROM medidas_pof p JOIN vinculos_taco_pof v ON v.pof_id=p.id WHERE v.taco_id=$1 AND p.id=$2 AND v.ativo=TRUE",
        [food.id, String(entry.medida_id)]
      );
      measure = result.rows[0];
      if (
        !measure ||
        !Number.isFinite(Number(measure.gramas)) ||
        Number(measure.gramas) <= 0
      )
        throw fail("Medida sem correspondência confirmada para este alimento.");
      grams = round(quantity * Number(measure.gramas));
    }
    const nutrientes = scaleNutrients(food.nutrientes_100g, grams);
    items.push({
      alimento_id: food.id,
      nome: food.nome,
      quantidade: quantity,
      medida_id: measure?.id || "g",
      medida: measure?.nome || "gramas",
      gramas: grams,
      fonte_medida: measure?.fonte || null,
      versao: food.versao,
      nutrientes,
      qualificadores: food.qualificadores,
    });
  }
  if (items.reduce((s, i) => s + i.gramas, 0) > 10000)
    throw fail("A refeição não pode exceder 10.000 g.");
  return { alimentos: items, ...sumNutrients(items) };
}
function mealNutrients(meal) {
  return (
    meal.nutrientes?.valores || {
      energia_kcal: meal.kcal ?? null,
      proteina_g: meal.proteinas ?? null,
      carboidrato_g: meal.carboidratos ?? null,
      lipideos_g: meal.gorduras ?? null,
    }
  );
}
export async function saveDailyMeal(alunoId, meal, ip) {
  const client = await getClient(),
    day = serverDay();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO registros_nutricao(aluno_id,data) VALUES($1,$2) ON CONFLICT(aluno_id,data) DO NOTHING",
      [alunoId, day]
    );
    const current = (
      await client.query(
        "SELECT * FROM registros_nutricao WHERE aluno_id=$1 AND data=$2 FOR UPDATE",
        [alunoId, day]
      )
    ).rows[0];
    const previous =
      typeof current.refeicoes === "string"
        ? JSON.parse(current.refeicoes)
        : current.refeicoes;
    const entries = [
      ...(previous || []),
      {
        ...meal,
        id: crypto.randomUUID(),
        hora: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        registrado_em: new Date().toISOString(),
      },
    ];
    const totals = sumNutrients(
      entries.map(m => ({
        nutrientes: mealNutrients(m),
        conhecidos: m.nutrientes?.conhecidos,
      }))
    );
    const result = await client.query(
      "UPDATE registros_nutricao SET refeicoes=$1,calorias_consumidas=$2,proteinas_g=$3,carboidratos_g=$4,gorduras_g=$5,nutrientes_totais=$6 WHERE aluno_id=$7 AND data=$8 RETURNING *",
      [
        JSON.stringify(entries),
        totals.conhecidos.energia_kcal || 0,
        totals.conhecidos.proteina_g || 0,
        totals.conhecidos.carboidrato_g || 0,
        totals.conhecidos.lipideos_g || 0,
        JSON.stringify(totals),
        alunoId,
        day,
      ]
    );
    await client.query(
      "INSERT INTO auditoria_operacoes(usuario_id,operacao,detalhes,ip) VALUES($1,$2,$3,$4)",
      [
        alunoId,
        "REGISTRO_REFEICAO",
        JSON.stringify({ data: day, origem: meal.origem }),
        ip || null,
      ]
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
