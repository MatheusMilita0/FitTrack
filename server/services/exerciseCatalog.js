import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export const normalizeSearch = value =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export const searchTokens = value => [
  ...new Set(normalizeSearch(value).match(/[a-z0-9]+/g) || []),
];
export function normalizeExercise(raw) {
  if (
    !raw ||
    typeof raw.id !== "string" ||
    !raw.id ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    !Array.isArray(raw.instructions) ||
    !raw.instructions.every(s => typeof s === "string" && s.trim())
  )
    throw new Error(`Exercício inválido: ${raw?.id}`);
  for (const field of ["primaryMuscles", "secondaryMuscles", "images"])
    if (
      !Array.isArray(raw[field]) ||
      !raw[field].every(s => typeof s === "string" && s.trim())
    )
      throw new Error(`Campo inválido: ${field}`);
  const images = raw.images.map(p => {
    if (p.includes("..") || p.startsWith("/") || !/^[\w./()'-]+$/.test(p))
      throw new Error("Caminho de mídia inválido.");
    return p;
  });
  return {
    id: raw.id,
    nome: raw.name.trim(),
    forca:
      { push: "empurrar", pull: "puxar", static: "estatico" }[raw.force] ||
      raw.force ||
      null,
    nivel: raw.level,
    mecanica: raw.mechanic || null,
    equipamento: raw.equipment || null,
    categoria:
      {
        powerlifting: "levantamento-de-potencia",
        strongman: "atletismo-de-forca",
      }[raw.category] || raw.category,
    musculos_primarios: raw.primaryMuscles,
    musculos_secundarios: raw.secondaryMuscles,
    instrucoes: raw.instructions,
    imagens_caminhos: images,
  };
}
export async function loadDataset(file, expectedHash) {
  const bytes = await readFile(file),
    hash = createHash("sha256").update(bytes).digest("hex");
  if (expectedHash && hash !== expectedHash)
    throw new Error("Checksum do dataset não confere.");
  const data = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(data) || !data.length)
    throw new Error("Dataset deve ser uma lista não vazia.");
  const rows = data.map(normalizeExercise);
  if (new Set(rows.map(r => r.id)).size !== rows.length)
    throw new Error("IDs duplicados no dataset.");
  return { rows, hash };
}
export async function seedCatalog(pool, rows, version) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const ex of rows) {
      const values = [
        ex.id,
        ex.nome,
        ex.forca,
        ex.nivel,
        ex.mecanica,
        ex.equipamento,
        ex.categoria,
        JSON.stringify(ex.musculos_primarios),
        JSON.stringify(ex.musculos_secundarios),
        JSON.stringify(ex.instrucoes),
        JSON.stringify(ex.imagens_caminhos),
        version,
      ];
      await client.query(
        `INSERT INTO exercicios_catalogo (id,nome,forca,nivel,mecanica,equipamento,categoria,musculos_primarios,musculos_secundarios,instrucoes,imagens_caminhos,versao_origem) VALUES (${values.map((_, i) => "$" + (i + 1)).join(",")}) ON CONFLICT(id) DO UPDATE SET nome=EXCLUDED.nome,forca=EXCLUDED.forca,nivel=EXCLUDED.nivel,mecanica=EXCLUDED.mecanica,equipamento=EXCLUDED.equipamento,categoria=EXCLUDED.categoria,musculos_primarios=EXCLUDED.musculos_primarios,musculos_secundarios=EXCLUDED.musculos_secundarios,instrucoes=EXCLUDED.instrucoes,imagens_caminhos=EXCLUDED.imagens_caminhos,versao_origem=EXCLUDED.versao_origem,atualizado_em=CURRENT_TIMESTAMP`,
        values
      );
      await client.query("DELETE FROM exercicios_busca WHERE exercicio_id=$1", [
        ex.id,
      ]);
      const terms = [
        ...searchTokens(
          [
            ex.nome,
            ...ex.instrucoes,
            ex.equipamento,
            ex.categoria,
            ...ex.musculos_primarios,
            ...ex.musculos_secundarios,
          ].join(" ")
        ),
        ...new Set(
          [...ex.musculos_primarios, ...ex.musculos_secundarios].map(
            m => "grupo:" + normalizeSearch(m)
          )
        ),
      ];
      const params = [],
        tuples = terms.map(term => {
          params.push(term, ex.id);
          return `($${params.length - 1},$${params.length})`;
        });
      await client.query(
        `INSERT INTO exercicios_busca(termo,exercicio_id) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`,
        params
      );
    }
    await client.query("COMMIT");
    return { importados: rows.length, versao: version };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export function mediaUrls(paths, base = process.env.EXERCISE_MEDIA_BASE_URL) {
  if (!base) return [];
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Base de mídias exige HTTPS sem credenciais.");
  return paths.map(
    p =>
      new URL(
        p.split("/").map(encodeURIComponent).join("/"),
        base.replace(/\/$/, "") + "/"
      ).href
  );
}
export function catalogDto(row) {
  const images = mediaUrls(row.imagens_caminhos);
  return {
    ...row,
    exerciseId: row.id,
    name: row.nome,
    bodyParts: row.musculos_primarios,
    targetMuscles: row.musculos_primarios,
    secondaryMuscles: row.musculos_secundarios,
    equipments: row.equipamento ? [row.equipamento] : [],
    instructions: row.instrucoes,
    images,
    imageUrl: images[0] || "",
    mediaType: "fotos",
    mediaConfigured: !!images.length,
    source: "catalogo-local",
  };
}
