import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { normalizeSearch, searchTokens } from "../services/exerciseCatalog.js";
import { calculatePortions } from "../services/nutritionService.js";
const router = Router();
router.use(requireAuth, requireRole("student", "personal", "admin"));
async function search(req, res, table, columns) {
  const q = req.query.busca || "",
    limit = Number(req.query.limit || 24),
    offset = Number(req.query.offset || 0);
  if (
    typeof q !== "string" ||
    q.length > 150 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    return res.status(400).json({ error: "Busca ou paginação inválida." });
  const params = [],
    where = searchTokens(q)
      .slice(0, 10)
      .map(token => {
        params.push("%" + token + "%");
        return "busca LIKE $" + params.length;
      });
  const sql = where.length ? " WHERE " + where.join(" AND ") : "";
  const count = await query(
    "SELECT COUNT(*) AS total FROM " + table + sql,
    params
  );
  params.push(limit, offset);
  const r = await query(
    `SELECT ${columns} FROM ${table}${sql} ORDER BY ${table === "alimentos_taco" ? "nome,id" : "nome_alimento,nome,id"} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.setHeader("X-Total-Count", String(count.rows[0].total));
  return res.json(r.rows);
}
router.get("/alimentos", async (req, res) => {
  try {
    return await search(
      req,
      res,
      "alimentos_taco",
      "id,nome,base,preparo,categoria,nutrientes_100g,qualificadores"
    );
  } catch {
    return res
      .status(503)
      .json({ error: "Base TACO indisponível. Verifique a carga inicial." });
  }
});
router.get("/alimentos/:id", async (req, res) => {
  try {
    const food = (
      await query("SELECT * FROM alimentos_taco WHERE id=$1", [
        Number(req.params.id),
      ])
    ).rows[0];
    if (!food)
      return res.status(404).json({ error: "Alimento não encontrado." });
    const measures = await query(
      "SELECT p.*,v.criterio,v.evidencia FROM medidas_pof p JOIN vinculos_taco_pof v ON v.pof_id=p.id WHERE v.taco_id=$1 AND v.ativo=TRUE ORDER BY p.nome,p.id",
      [food.id]
    );
    return res.json({
      ...food,
      medidas: measures.rows.filter(m => Number(m.gramas) > 0),
    });
  } catch {
    return res.status(503).json({ error: "Base nutricional indisponível." });
  }
});
router.get("/medidas-pof", requireRole("admin"), async (req, res) => {
  try {
    return await search(
      req,
      res,
      "medidas_pof",
      "id,codigo_alimento,nome_alimento,codigo_preparo,preparo,nome,gramas,fonte"
    );
  } catch {
    return res.status(503).json({ error: "Medidas POF indisponíveis." });
  }
});
router.post("/calcular", async (req, res) => {
  try {
    return res.json(await calculatePortions(req.body.alimentos));
  } catch (e) {
    return res.status(e.status || 503).json({
      error: e.status ? e.message : "Não foi possível calcular a refeição.",
    });
  }
});
router.post("/vinculos", requireRole("admin"), async (req, res) => {
  try {
    const { taco_id, pof_id, criterio } = req.body;
    if (
      !Number.isInteger(Number(taco_id)) ||
      typeof pof_id !== "string" ||
      typeof criterio !== "string" ||
      criterio.trim().length < 15
    )
      return res.status(400).json({
        error:
          "Informe os alimentos correspondentes e justifique a variedade/preparo.",
      });
    const f = (
        await query("SELECT nome FROM alimentos_taco WHERE id=$1", [
          Number(taco_id),
        ])
      ).rows[0],
      m = (await query("SELECT * FROM medidas_pof WHERE id=$1", [pof_id]))
        .rows[0];
    if (!f || !m || Number(m.gramas) <= 0)
      return res.status(400).json({ error: "Alimento ou medida inválidos." });
    await query(
      "INSERT INTO vinculos_taco_pof(taco_id,pof_id,criterio,evidencia,responsavel_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(taco_id,pof_id) DO UPDATE SET criterio=EXCLUDED.criterio,evidencia=EXCLUDED.evidencia,responsavel_id=EXCLUDED.responsavel_id,ativo=TRUE",
      [
        Number(taco_id),
        pof_id,
        criterio.trim(),
        JSON.stringify({
          taco: f.nome,
          pof: m.nome_alimento,
          preparo: m.preparo,
          fonte: m.fonte,
        }),
        req.user.id,
      ]
    );
    return res.status(201).json({
      message: "Correspondência registrada. A conversão usa a massa da POF.",
    });
  } catch {
    return res
      .status(500)
      .json({ error: "Não foi possível registrar a correspondência." });
  }
});
router.delete(
  "/vinculos/:tacoId/:pofId",
  requireRole("admin"),
  async (req, res) => {
    try {
      await query(
        "UPDATE vinculos_taco_pof SET ativo=FALSE WHERE taco_id=$1 AND pof_id=$2",
        [Number(req.params.tacoId), req.params.pofId]
      );
      return res.json({ message: "Correspondência desativada." });
    } catch {
      return res
        .status(500)
        .json({ error: "Falha ao desativar correspondência." });
    }
  }
);
export default router;
