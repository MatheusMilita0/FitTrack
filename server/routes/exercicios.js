import { Router } from "express";
import { query } from "../db.js";
import {
  catalogDto,
  normalizeSearch,
  searchTokens,
} from "../services/exerciseCatalog.js";
const router = Router();
router.get("/catalogo", async (req, res) => {
  try {
    const { busca = "", grupo, nivel, equipamento, categoria } = req.query;
    if (
      typeof busca !== "string" ||
      busca.length > 200 ||
      [grupo, nivel, equipamento, categoria].some(
        v => v !== undefined && (typeof v !== "string" || v.length > 80)
      )
    )
      return res.status(400).json({ error: "Filtros inválidos." });
    const limit = Number(req.query.limit || 48),
      offset = Number(req.query.offset || 0);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 250 ||
      !Number.isInteger(offset) ||
      offset < 0
    )
      return res.status(400).json({ error: "Paginação inválida." });
    const params = [],
      clauses = [],
      bind = v => {
        params.push(v);
        return "$" + params.length;
      };
    const lookups = [];
    if (grupo)
      lookups.push(
        query("SELECT exercicio_id FROM exercicios_busca WHERE termo=$1", [
          "grupo:" + normalizeSearch(grupo),
        ])
      );
    for (const token of searchTokens(busca).slice(0, 12))
      lookups.push(
        query(
          "SELECT exercicio_id FROM exercicios_busca WHERE termo >= $1 AND termo < $2",
          [token, token + "\uffff"]
        )
      );
    if (lookups.length) {
      const results = await Promise.all(lookups);
      const sets = results.map(
        r => new Set(r.rows.map(row => row.exercicio_id))
      );
      const ids = [...sets[0]].filter(id => sets.every(set => set.has(id)));
      if (!ids.length) {
        res.setHeader("X-Total-Count", "0");
        res.setHeader("X-Catalog-Source", "postgresql");
        return res.json([]);
      }
      clauses.push(`id IN (${ids.map(bind).join(",")})`);
    }
    for (const [column, value] of Object.entries({
      nivel,
      equipamento,
      categoria,
    }))
      if (value) clauses.push(`${column}=${bind(normalizeSearch(value))}`);
    const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
    const count = await query(
      "SELECT COUNT(*) AS total FROM exercicios_catalogo" + where,
      params
    );
    const rows = await query(
      `SELECT * FROM exercicios_catalogo${where} ORDER BY nome,id LIMIT ${bind(limit)} OFFSET ${bind(offset)}`,
      params
    );
    res.setHeader("X-Total-Count", String(count.rows[0].total));
    res.setHeader("X-Catalog-Source", "postgresql");
    return res.json(rows.rows.map(catalogDto));
  } catch (e) {
    console.error("Falha no catálogo local:", e.message);
    return res.status(503).json({
      error:
        "Catálogo local indisponível. Verifique o banco, a migração e a carga de exercícios.",
    });
  }
});
router.get("/filtros", async (_req, res) => {
  try {
    const rows = await query(
      "SELECT nivel,equipamento,categoria,musculos_primarios FROM exercicios_catalogo"
    );
    const distinct = values =>
      [...new Set(values.filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      );
    return res.json({
      grupos: distinct(rows.rows.flatMap(r => r.musculos_primarios)),
      niveis: distinct(rows.rows.map(r => r.nivel)),
      equipamentos: distinct(rows.rows.map(r => r.equipamento)),
      categorias: distinct(rows.rows.map(r => r.categoria)),
      total: rows.rows.length,
    });
  } catch {
    return res.status(503).json({
      error: "Não foi possível carregar os filtros do catálogo local.",
    });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const r = await query("SELECT * FROM exercicios_catalogo WHERE id=$1", [
      req.params.id,
    ]);
    if (!r.rows.length)
      return res.status(404).json({ error: "Exercício não encontrado." });
    return res.json(catalogDto(r.rows[0]));
  } catch {
    return res.status(503).json({ error: "Catálogo local indisponível." });
  }
});
export default router;
