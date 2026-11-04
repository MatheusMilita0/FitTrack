import { query } from "../db.js";
import { logAudit } from "./auditService.js";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export async function assignWorkouts(
  personalId,
  { treino_id, aluno_ids, dias_semana },
  ip
) {
  if (
    !Number.isSafeInteger(Number(treino_id)) ||
    Number(treino_id) < 1 ||
    !Array.isArray(aluno_ids) ||
    !aluno_ids.length ||
    aluno_ids.length > 100 ||
    aluno_ids.some(
      id =>
        typeof id === "boolean" ||
        !Number.isSafeInteger(Number(id)) ||
        Number(id) < 1
    )
  )
    fail("Selecione treino e alunos válidos.");
  const ids = [...new Set(aluno_ids.map(Number))],
    days = [
      ...new Set(
        (dias_semana || []).map(d =>
          String(d)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
        )
      ),
    ];
  if (
    !days.length ||
    days.some(
      d => !["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"].includes(d)
    )
  )
    fail("Selecione dias válidos da semana.");
  const train = (
    await query(
      "SELECT id FROM treinos WHERE id=$1 AND (criador_id=$2 OR e_modelo=TRUE)",
      [Number(treino_id), personalId]
    )
  ).rows[0];
  if (!train)
    fail("Treino não encontrado ou não pertence a este instrutor.", 404);
  const exercises = await query(
    "SELECT id FROM treino_exercicios WHERE treino_id=$1 AND reps_padrao IS NOT NULL AND TRIM(reps_padrao) != '' AND descanso_padrao IS NOT NULL AND TRIM(descanso_padrao) != ''",
    [Number(treino_id)]
  );
  if (!exercises.rows.length)
    fail("A ficha deve ter exercício com repetições e descanso (RN07).");
  // Validate every recipient before the first write; the outer request commits the entire batch.
  for (const id of ids)
    if (
      !(
        await query(
          "SELECT id FROM vinculos_aluno_personal WHERE personal_id=$1 AND aluno_id=$2 AND status='active'",
          [personalId, id]
        )
      ).rows.length
    )
      fail("Não autorizado: aluno sem vínculo active.", 403);
  const rows = [];
  for (const id of ids) {
    const existing = await query(
      "SELECT id FROM atribuicoes_treino WHERE treino_id=$1 AND aluno_id=$2 AND personal_id=$3",
      [Number(treino_id), id, personalId]
    );
    const result = existing.rows.length
      ? await query(
          "UPDATE atribuicoes_treino SET dias_semana=$1,ativo=TRUE,atribuido_em=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *",
          [days, existing.rows[0].id]
        )
      : await query(
          "INSERT INTO atribuicoes_treino(treino_id,aluno_id,personal_id,dias_semana,ativo) VALUES($1,$2,$3,$4,TRUE) RETURNING *",
          [Number(treino_id), id, personalId, days]
        );
    rows.push(result.rows[0]);
  }
  await logAudit({
    usuarioId: personalId,
    operacao: "PRESCRICAO_TREINO",
    detalhes: { treinoId: Number(treino_id), alunoIds: ids, dias: days },
    ip,
  });
  return rows;
}
