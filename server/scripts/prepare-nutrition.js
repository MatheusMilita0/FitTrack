import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export function parseCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("CSV com aspas não fechadas.");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift();
  return rows.map(values => {
    if (values.length !== headers.length)
      throw new Error("CSV com número de colunas divergente.");
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
export const fingerprint = row =>
  "pof-" + createHash("sha256").update(JSON.stringify(row)).digest("hex");
function numeric(v) {
  if (v === "" || v === "NA" || v === "NaN") return null;
  const n = Number(v);
  if (n < 0) return null;
  if (!Number.isFinite(n)) throw new Error(`Valor nutricional inválido: ${v}`);
  return n;
}
export async function prepareNutrition() {
  const dir = new URL("../../data/nutrition/", import.meta.url);
  const foods = parseCsv(
    await readFile(new URL("taco_composicao.csv", dir), "utf8")
  );
  const measures = parseCsv(
    await readFile(new URL("pof_medidas_caseiras.csv", dir), "utf8")
  );
  const nutrientKeys = Object.keys(foods[0]).filter(k =>
    /_(g|mg|mcg|kcal|kj)$/.test(k)
  );
  const alimentos = foods.map(row => ({
    id: Number(row.numero_alimento),
    nome: row.descricao,
    base: row.base,
    preparo: row.preparo,
    categoria: row.categoria,
    nutrientes_100g: Object.fromEntries(
      nutrientKeys.map(k => [k, numeric(row[k])])
    ),
    qualificadores: Object.fromEntries(
      nutrientKeys.map(k => [
        k,
        row[k] !== "" && Number(row[k]) < 0
          ? "inconsistente"
          : row[k] === "1e-05"
            ? "traco"
            : numeric(row[k]) === null
              ? "nao_informado"
              : "informado",
      ])
    ),
  }));
  const medidas = measures.map(row => ({
    id: fingerprint(row),
    codigo_alimento: row.codigo_alimento,
    nome_alimento: row.descricao_alimento,
    codigo_preparo: row.codigo_preparacao,
    preparo: row.descricao_preparacao,
    nome: row.descricao_medida,
    gramas: numeric(row.quantidade_g),
    fonte: row.descricao_fonte,
    original: row,
  }));
  // Only these explicit correspondences are curated for this pinned snapshot.
  const vinculos = medidas
    .filter(
      m =>
        (m.codigo_alimento === "6300201" &&
          m.codigo_preparo === "99" &&
          m.fonte.startsWith("Arroz integral cozido")) ||
        (m.codigo_alimento === "6801101" &&
          m.codigo_preparo === "1" &&
          m.fonte.startsWith("Banana prata"))
    )
    .map(m => ({
      taco_id: m.codigo_alimento === "6300201" ? 1 : 182,
      pof_id: m.id,
      criterio:
        "Curadoria técnica: nome/variedade e preparo explicitados na descrição da fonte POF; não corresponde a equivalência geral entre códigos.",
      evidencia: m.fonte,
    }));
  const result = { alimentos, medidas, vinculos };
  await writeFile(
    new URL("catalogo-normalizado.json", dir),
    JSON.stringify(result, null, 2) + "\n"
  );
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  prepareNutrition()
    .then(r =>
      console.log({
        alimentos: r.alimentos.length,
        medidas: r.medidas.length,
        vinculos: r.vinculos.length,
      })
    )
    .catch(e => {
      console.error(e);
      process.exitCode = 1;
    });
