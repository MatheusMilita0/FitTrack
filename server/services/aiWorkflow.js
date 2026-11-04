import { query } from "../db.js";
import { gerarRecomendacaoTreino } from "./aiService.js";
import { calcularMetasNutricionais } from "./calculoMetabolico.js";
import { ageFromBirth } from "../utils/day.js";
import { logAudit } from "./auditService.js";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export async function recommendFor(alunoId, creatorId, restricoes = "") {
  if (typeof restricoes !== "string" || restricoes.length > 2000)
    fail("Descreva as restrições em até 2000 caracteres.");
  const aluno = (
    await query("SELECT * FROM perfis_alunos WHERE usuario_id=$1", [alunoId])
  ).rows[0];
  if (!aluno || calcularMetasNutricionais(aluno).metas_pendentes)
    fail(
      "Complete nascimento, peso, altura e equação metabólica no perfil antes de solicitar uma sugestão.",
      422
    );
  const historico = (
    await query(
      "SELECT series_executadas,concluido_em,duracao_segundos FROM execucoes_treino WHERE aluno_id=$1 ORDER BY concluido_em DESC LIMIT 30",
      [alunoId]
    )
  ).rows;
  if (!historico.length)
    fail(
      "Conclua ao menos um treino para formar o histórico necessário à sugestão.",
      409
    );
  const biometria = (
    await query(
      "SELECT peso_kg,altura_cm,objetivo,registrado_em FROM historico_biometria WHERE aluno_id=$1 ORDER BY registrado_em DESC LIMIT 30",
      [alunoId]
    )
  ).rows;
  const treino = await gerarRecomendacaoTreino({
    aluno: { ...aluno, idade: ageFromBirth(aluno.data_nascimento) },
    historico: { execucoes: historico, biometria },
    restricoes,
  });
  const result = await query(
    "INSERT INTO sugestoes_ia(aluno_id,criador_id,treino,origem) VALUES($1,$2,$3,$4) RETURNING id",
    [alunoId, creatorId, JSON.stringify(treino), treino.mode]
  );
  await logAudit({
    usuarioId: creatorId,
    operacao: "RECOMENDACAO_IA",
    detalhes: { alunoId, sugestaoId: result.rows[0].id, origem: treino.mode },
  });
  return { ...treino, id: result.rows[0].id };
}
export async function saveSuggestion(alunoId, id, confirmDemo) {
  const s = (
    await query(
      "SELECT * FROM sugestoes_ia WHERE id=$1 AND aluno_id=$2 FOR UPDATE",
      [Number(id), alunoId]
    )
  ).rows[0];
  if (!s) fail("Sugestão não encontrada.", 404);
  if (s.origem === "mock" && confirmDemo !== true)
    fail("Confirme que deseja salvar o exemplo demonstrativo.");
  if (s.treino_id) {
    const t = (await query("SELECT * FROM treinos WHERE id=$1", [s.treino_id]))
      .rows[0];
    t.exercicios = (
      await query(
        "SELECT * FROM treino_exercicios WHERE treino_id=$1 ORDER BY ordem",
        [t.id]
      )
    ).rows;
    return t;
  }
  const t = typeof s.treino === "string" ? JSON.parse(s.treino) : s.treino;
  const train = (
    await query(
      "INSERT INTO treinos(criador_id,titulo,descricao,nivel,tempo_estimado_min,e_modelo) VALUES($1,$2,$3,$4,$5,FALSE) RETURNING *",
      [
        alunoId,
        t.titulo,
        `${s.origem === "mock" ? "DEMONSTRAÇÃO — " : ""}${t.descricao}\n${t.disclaimer}`,
        t.nivel,
        t.tempo_estimado_min,
      ]
    )
  ).rows[0];
  train.exercicios = [];
  for (const [i, e] of t.exercicios.entries())
    train.exercicios.push(
      (
        await query(
          "INSERT INTO treino_exercicios(treino_id,ordem,exercise_id,nome,grupo_muscular,series_padrao,reps_padrao,descanso_padrao,notas) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            train.id,
            i + 1,
            `ia-${id}-${i}`,
            e.nome,
            e.grupo_muscular,
            String(e.series),
            e.repeticoes,
            e.descanso,
            e.observacoes,
          ]
        )
      ).rows[0]
    );
  await query(
    "INSERT INTO atribuicoes_treino(treino_id,aluno_id,dias_semana,ativo) VALUES($1,$2,$3,TRUE)",
    [train.id, alunoId, ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]]
  );
  await query("UPDATE sugestoes_ia SET treino_id=$1 WHERE id=$2", [
    train.id,
    s.id,
  ]);
  await logAudit({
    usuarioId: alunoId,
    operacao: "SALVAR_SUGESTAO_IA",
    detalhes: { sugestaoId: s.id, treinoId: train.id, origem: s.origem },
  });
  return train;
}
export async function shareSuggestion(alunoId, id) {
  const s = (
    await query(
      "SELECT * FROM sugestoes_ia WHERE id=$1 AND aluno_id=$2 FOR UPDATE",
      [Number(id), alunoId]
    )
  ).rows[0];
  if (!s) fail("Sugestão não encontrada.", 404);
  const v = (
    await query(
      "SELECT personal_id FROM vinculos_aluno_personal WHERE aluno_id=$1 AND status='active'",
      [alunoId]
    )
  ).rows[0];
  if (!v) fail("Você precisa de vínculo ativo para enviar a sugestão.", 403);
  const t = typeof s.treino === "string" ? JSON.parse(s.treino) : s.treino;
  const texto =
    `Sugestão ${s.origem === "mock" ? "DEMONSTRATIVA (sem Gemini)" : "Gemini"} para revisão: ${t.titulo}\n${t.exercicios.map(e => `${e.nome}: ${e.series} × ${e.repeticoes}; descanso ${e.descanso}`).join("\n")}\n${t.disclaimer}`.slice(
      0,
      5000
    );
  await query(
    "INSERT INTO mensagens_chat(remetente_id,destinatario_id,texto) VALUES($1,$2,$3)",
    [alunoId, v.personal_id, texto]
  );
  await query("UPDATE sugestoes_ia SET enviado_personal_id=$1 WHERE id=$2", [
    v.personal_id,
    s.id,
  ]);
  return {
    message: "Sugestão enviada no chat para revisão do personal.",
    personal_id: v.personal_id,
  };
}
