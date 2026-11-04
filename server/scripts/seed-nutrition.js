import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getPool } from "../db.js";
import { normalizeSearch } from "../services/exerciseCatalog.js";
export async function loadNutrition() {
  const dir = new URL("../../data/nutrition/", import.meta.url),
    manifest = JSON.parse(
      await readFile(new URL("manifest.json", dir), "utf8")
    );
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (
      createHash("sha256")
        .update(await readFile(new URL(name, dir)))
        .digest("hex") !== hash
    )
      throw new Error(`Checksum nutricional divergente: ${name}`);
  }
  const data = JSON.parse(
    await readFile(new URL("catalogo-normalizado.json", dir), "utf8")
  );
  if (!data.alimentos.length || !data.medidas.length)
    throw new Error("Base nutricional vazia.");
  return { data, version: manifest.commit };
}
async function bulk(client, table, columns, rows, key = "id") {
  for (let start = 0; start < rows.length; start += 100) {
    const params = [];
    const tuples = rows.slice(start, start + 100).map(
      row =>
        "(" +
        columns
          .map(c => {
            params.push(
              typeof row[c] === "object" && row[c] !== null
                ? JSON.stringify(row[c])
                : row[c]
            );
            return "$" + params.length;
          })
          .join(",") +
        ")"
    );
    await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT (${key}) DO UPDATE SET ${columns
        .filter(c => c !== key)
        .map(c => `${c}=EXCLUDED.${c}`)
        .join(",")}`,
      params
    );
  }
}
export async function seedNutrition(pool, data, version) {
  if (!pool)
    throw new Error("Configure DATABASE_URL e execute npm run migrate.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await bulk(
      client,
      "alimentos_taco",
      [
        "id",
        "nome",
        "busca",
        "base",
        "preparo",
        "categoria",
        "nutrientes_100g",
        "qualificadores",
        "versao",
      ],
      data.alimentos.map(f => ({
        ...f,
        busca: normalizeSearch([f.nome, f.categoria, f.preparo].join(" ")),
        versao: version,
      }))
    );
    await bulk(
      client,
      "medidas_pof",
      [
        "id",
        "codigo_alimento",
        "nome_alimento",
        "codigo_preparo",
        "preparo",
        "nome",
        "busca",
        "gramas",
        "fonte",
        "original",
        "versao",
      ],
      data.medidas.map(m => ({
        ...m,
        busca: normalizeSearch(
          [m.nome_alimento, m.nome, m.preparo, m.fonte].join(" ")
        ),
        versao: version,
      }))
    );
    for (const link of data.vinculos)
      await client.query(
        "INSERT INTO vinculos_taco_pof(taco_id,pof_id,criterio,evidencia) VALUES($1,$2,$3,$4) ON CONFLICT(taco_id,pof_id) DO NOTHING",
        [link.taco_id, link.pof_id, link.criterio, link.evidencia]
      );
    await client.query("COMMIT");
    return {
      alimentos: data.alimentos.length,
      medidas: data.medidas.length,
      vinculos: data.vinculos.length,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = getPool();
  try {
    const { data, version } = await loadNutrition();
    console.log(await seedNutrition(pool, data, version));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
