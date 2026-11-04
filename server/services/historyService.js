import { profileView } from "./profileView.js";
import { query } from "../db.js";
import { historyPeriod, serverDay } from "../utils/day.js";
export async function readHistory(alunoId, input = {}) {
  const { start, end } = historyPeriod(input);
  const limit = Number(input.limit ?? 25),
    offset = Number(input.offset ?? 0);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    throw Object.assign(new Error("Paginação inválida."), { status: 400 });
  async function read(table, field, select, join = "") {
    const args = [alunoId];
    let where = "r.aluno_id=$1";
    if (start) {
      args.push(field === "data" ? input.inicio : start);
      where += ` AND r.${field} >= $${args.length}`;
    }
    if (end) {
      args.push(field === "data" ? serverDay(end) : end);
      where += ` AND r.${field} < $${args.length}`;
    }
    const count = (
      await query(
        `SELECT COUNT(*) AS total FROM ${table} r WHERE ${where}`,
        args
      )
    ).rows[0];
    const rows = (
      await query(
        `SELECT ${select} FROM ${table} r ${join} WHERE ${where} ORDER BY r.${field} DESC,r.id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
        [...args, limit, offset]
      )
    ).rows;
    return { rows, total: Number(count.total) };
  }
  const sessions = await read(
    "execucoes_treino",
    "concluido_em",
    "r.*,t.titulo AS treino_titulo",
    "JOIN treinos t ON t.id=r.treino_id"
  );
  const bio = await read("historico_biometria", "registrado_em", "r.*");
  const food = await read("registros_nutricao", "data", "r.*");
  const perfil =
    (await query("SELECT * FROM perfis_alunos WHERE usuario_id=$1", [alunoId]))
      .rows[0] || null;
  const cargas = {};
  for (const row of sessions.rows)
    for (const s of Array.isArray(row.series_executadas)
      ? row.series_executadas
      : []) {
      if (s.nome && s.concluido !== false)
        (cargas[s.nome] ||= []).push({
          data: row.concluido_em,
          carga: Number(s.carga) || 0,
          reps: Number(s.reps) || 0,
        });
    }
  return {
    perfil: profileView(perfil),
    execucoes: sessions.rows,
    biometria: bio.rows,
    nutricao: food.rows,
    cargas_por_exercicio: cargas,
    total_treinos: sessions.total,
    paginacao: {
      limit,
      offset,
      total_execucoes: sessions.total,
      total_biometria: bio.total,
      total_nutricao: food.total,
      tem_mais:
        offset + limit < Math.max(sessions.total, bio.total, food.total),
    },
  };
}
