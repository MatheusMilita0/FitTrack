import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { getPool } from "../db.js";
import { loadDataset, seedCatalog } from "../services/exerciseCatalog.js";
export async function runSeed(pool = getPool()) {
  if (!pool)
    throw new Error(
      "Configure DATABASE_URL e execute npm run migrate antes da carga."
    );
  const manifest = JSON.parse(
    await readFile(
      new URL("../../data/exercises/manifest.json", import.meta.url),
      "utf8"
    )
  );
  const { rows } = await loadDataset(
    new URL(
      "../../data/exercises/exercises-ptbr-full-translation.json",
      import.meta.url
    ),
    manifest.sha256
  );
  if (rows.length !== manifest.records)
    throw new Error("Quantidade de exercícios diverge do manifesto.");
  return seedCatalog(pool, rows, manifest.commit);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = getPool();
  try {
    console.log(await runSeed(pool));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
