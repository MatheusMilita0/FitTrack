import { recommendFor } from "../services/aiWorkflow.js";
import { notifyChat } from "../services/chatEvents.js";
import { assignWorkouts } from "../services/assignmentService.js";
import { readHistory } from "../services/historyService.js";
import { gerarRecomendacaoTreino } from "../services/aiService.js";
import { Router } from "express";
import { validateWorkout } from "../utils/workout.js";
import { query, getClient } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { logAudit } from "../services/auditService.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("personal"));

async function activeFeedback(id, personalId) {
  return (
    await query(
      "SELECT f.* FROM feedbacks_treino f JOIN vinculos_aluno_personal v ON v.aluno_id=f.aluno_id AND v.personal_id=f.personal_id WHERE f.id=$1 AND f.personal_id=$2 AND v.status='active'",
      [id, personalId]
    )
  ).rows[0];
}

// GET /api/personal/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const personalId = req.user.id;

    const statsRes = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN v.status = 'active' THEN 1 ELSE 0 END), 0) AS alunos_ativos,
         COALESCE(SUM(CASE WHEN v.status = 'pending' THEN 1 ELSE 0 END), 0) AS alunos_pendentes
       FROM vinculos_aluno_personal v
       WHERE v.personal_id = $1`,
      [personalId]
    );

    const treinosRes = await query(
      "SELECT COUNT(*) AS total_treinos FROM treinos WHERE criador_id = $1",
      [personalId]
    );

    // Contagem real de feedbacks pendentes de visualização ou resposta
    const feedbacksRes = await query(
      `SELECT COUNT(*) AS pendentes
       FROM feedbacks_treino
       WHERE personal_id = $1 AND (visualizado_pelo_personal = FALSE OR resposta_personal IS NULL)`,
      [personalId]
    );

    return res.json({
      alunos_ativos: Number(statsRes.rows[0]?.alunos_ativos || 0),
      alunos_pendentes: Number(statsRes.rows[0]?.alunos_pendentes || 0),
      total_treinos: Number(treinosRes.rows[0]?.total_treinos || 0),
      feedbacks_pendentes: Number(feedbacksRes.rows[0]?.pendentes || 0),
    });
  } catch (error) {
    console.error("Erro no dashboard do personal:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao carregar métricas do personal." });
  }
});

// GET /api/personal/alunos
router.get("/alunos", async (req, res) => {
  try {
    const personalId = req.user.id;
    const { status } = req.query;

    let filterSql = "WHERE v.personal_id = $1";
    const params = [personalId];

    if (
      status &&
      ["active", "pending", "rejected", "terminated"].includes(status)
    ) {
      filterSql += " AND v.status = $2";
      params.push(status);
    }

    const result = await query(
      `SELECT v.id AS vinculo_id, v.status AS vinculo_status, v.criado_em AS vinculo_criado_em,
              u.id AS aluno_id, u.nome, u.email, u.cpf,
              p.peso_kg, p.altura_cm, p.idade, p.objetivo, p.meta_treinos_semana
       FROM vinculos_aluno_personal v
       JOIN usuarios u ON u.id = v.aluno_id
       LEFT JOIN perfis_alunos p ON p.usuario_id = u.id
       ${filterSql}
       ORDER BY v.status ASC, u.nome ASC`,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar alunos do personal:", error);
    return res.status(500).json({ error: "Erro interno ao listar alunos." });
  }
});

// GET /api/personal/alunos/:id/evolucao (RF10)
router.get("/alunos/:id/evolucao", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const link = await query(
      "SELECT id FROM vinculos_aluno_personal WHERE aluno_id=$1 AND personal_id=$2 AND status='active'",
      [id, req.user.id]
    );
    if (!link.rows.length)
      return res.status(403).json({ error: "Aluno sem vínculo ativo." });
    const data = await readHistory(id, req.query);
    const aluno = (
      await query("SELECT id,nome,email FROM usuarios WHERE id=$1", [id])
    ).rows[0];
    const feedbacks = (
      await query(
        "SELECT * FROM feedbacks_treino WHERE aluno_id=$1 AND personal_id=$2 ORDER BY criado_em DESC",
        [id, req.user.id]
      )
    ).rows;
    return res.json({
      ...data,
      aluno: { ...aluno, ...data.perfil },
      total_treinos_concluidos: data.total_treinos,
      feedbacks,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro ao consultar evolução.",
    });
  }
});

router.post("/alunos/:id/recomendacao-ia", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const v = await query(
      "SELECT id FROM vinculos_aluno_personal WHERE aluno_id=$1 AND personal_id=$2 AND status='active'",
      [id, req.user.id]
    );
    if (!v.rows.length)
      return res.status(403).json({ error: "Aluno sem vínculo ativo." });
    return res.json({
      recomendacao: await recommendFor(
        id,
        req.user.id,
        req.body.restricoes || ""
      ),
    });
  } catch (e) {
    return res.status(e.status || 502).json({
      error: e.status ? e.message : "Falha ao consultar recomendações.",
    });
  }
});

// PATCH /api/personal/vinculos/:id
router.patch("/vinculos/:id", async (req, res) => {
  try {
    const personalId = req.user.id;
    const vinculoId = Number(req.params.id);
    const { status } = req.body;

    if (!["active", "rejected", "terminated"].includes(status)) {
      return res.status(400).json({
        error: "Status inválido. Escolha 'active', 'rejected' ou 'terminated'.",
      });
    }

    // Regra inegociável de isolamento: Personal só altera vínculos dele próprio
    const vinculoAtual = await query(
      "SELECT id, aluno_id FROM vinculos_aluno_personal WHERE id = $1 AND personal_id = $2",
      [vinculoId, personalId]
    );

    if (vinculoAtual.rows.length === 0) {
      return res.status(404).json({
        error:
          "Vínculo não encontrado ou você não tem autorização para modificá-lo.",
      });
    }

    const alunoId = vinculoAtual.rows[0].aluno_id;

    if (status === "active") {
      const active = await query(
        "SELECT id FROM vinculos_aluno_personal WHERE aluno_id = $1 AND status = 'active' AND id != $2",
        [alunoId, vinculoId]
      );
      if (active.rows.length)
        return res
          .status(409)
          .json({ error: "Aluno já possui personal ativo (RN18)." });
    }
    if (status === "terminated" || status === "rejected") {
      await query(
        "UPDATE atribuicoes_treino SET ativo = FALSE WHERE aluno_id = $1 AND personal_id = $2",
        [alunoId, personalId]
      );
    }
    const result = await query(
      `UPDATE vinculos_aluno_personal
       SET status = $1, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $2 AND personal_id = $3
       RETURNING *`,
      [status, vinculoId, personalId]
    );

    // RN09: Trilha de auditoria
    await logAudit({
      usuarioId: personalId,
      operacao: "ALTERAR_STATUS_VINCULO",
      detalhes: { vinculoId, alunoId, status },
      ip: req.ip,
    });

    return res.json({
      message: `Vínculo atualizado para '${status}'.`,
      vinculo: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao atualizar vínculo:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao atualizar vínculo." });
  }
});

// POST /api/personal/treinos
router.post("/treinos", async (req, res) => {
  try {
    const personalId = req.user.id;
    const {
      titulo,
      descricao,
      nivel,
      tempo_estimado_min,
      cor_tema,
      e_modelo,
      exercicios,
    } = req.body;

    if (!titulo || typeof titulo !== "string" || !titulo.trim()) {
      return res
        .status(400)
        .json({ error: "O título do treino é obrigatório." });
    }

    if (exercicios !== undefined && exercicios !== null) {
      if (!Array.isArray(exercicios)) {
        return res
          .status(400)
          .json({ error: "exercicios deve ser uma lista de exercícios." });
      }
      for (let i = 0; i < exercicios.length; i++) {
        const ex = exercicios[i];
        if (!ex || typeof ex !== "object") {
          return res.status(400).json({
            error: "Cada item em exercicios deve ser um objeto válido.",
          });
        }
      }
    }

    if (!validateWorkout(exercicios))
      return res.status(400).json({
        error:
          "Treino exige exercícios com nome, repetições e descanso definidos (RN07).",
      });
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const treinoRes = await client.query(
        `INSERT INTO treinos (criador_id, titulo, descricao, nivel, tempo_estimado_min, cor_tema, e_modelo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          personalId,
          String(titulo).trim(),
          descricao || null,
          nivel || "Intermediário",
          Number(tempo_estimado_min) || 45,
          cor_tema || "coral",
          Boolean(e_modelo),
        ]
      );

      const novoTreino = treinoRes.rows[0];
      const treinoId = novoTreino.id;
      const exerciciosInseridos = [];

      if (Array.isArray(exercicios) && exercicios.length > 0) {
        for (let i = 0; i < exercicios.length; i++) {
          const ex = exercicios[i];
          const exRes = await client.query(
            `INSERT INTO treino_exercicios (
               treino_id, ordem, exercise_id, nome, grupo_muscular,
               series_padrao, reps_padrao, descanso_padrao, carga_padrao, gif_url, notas
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
              treinoId,
              i + 1,
              String(ex.exercise_id || `ex-${i + 1}`),
              String(ex.nome || "Exercício"),
              String(ex.grupo_muscular || "Geral"),
              String(ex.series_padrao || "3 × 12 reps"),
              String(ex.reps_padrao || "12"),
              String(ex.descanso_padrao || "75s"),
              String(ex.carga_padrao || "0"),
              String(ex.gif_url || ""),
              ex.notas || null,
            ]
          );
          exerciciosInseridos.push(exRes.rows[0]);
        }
      }

      await client.query("COMMIT");

      novoTreino.exercicios = exerciciosInseridos;

      // RN09: Trilha de auditoria
      await logAudit({
        usuarioId: personalId,
        operacao: "CRIAR_TREINO",
        detalhes: {
          treinoId,
          titulo,
          totalExercicios: exerciciosInseridos.length,
        },
        ip: req.ip,
      });

      return res.status(201).json({
        message: "Treino criado com sucesso.",
        treino: novoTreino,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Erro ao criar treino:", error);
      return res.status(500).json({ error: "Erro interno ao criar treino." });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Erro no processamento do treino:", error);
    return res.status(500).json({ error: "Erro interno ao criar treino." });
  }
});

// PUT /api/personal/treinos/:id (RF08 - Editar treino do personal)
router.put("/treinos/:id", async (req, res) => {
  try {
    const personalId = req.user.id;
    const treinoId = Number(req.params.id);
    const {
      titulo,
      descricao,
      nivel,
      tempo_estimado_min,
      cor_tema,
      e_modelo,
      exercicios,
    } = req.body;

    // Isolamento: Treino deve pertencer ao personal logado
    const checkTreino = await query(
      "SELECT id FROM treinos WHERE id = $1 AND criador_id = $2",
      [treinoId, personalId]
    );

    if (checkTreino.rows.length === 0) {
      return res.status(404).json({
        error: "Treino não encontrado ou você não tem permissão para editá-lo.",
      });
    }

    if (!titulo || typeof titulo !== "string" || !titulo.trim()) {
      return res
        .status(400)
        .json({ error: "O título do treino é obrigatório." });
    }

    if (!validateWorkout(exercicios))
      return res.status(400).json({
        error:
          "Treino exige exercícios com nome, repetições e descanso definidos (RN07).",
      });
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const updateTreino = await client.query(
        `UPDATE treinos
         SET titulo = $1,
             descricao = $2,
             nivel = $3,
             tempo_estimado_min = $4,
             cor_tema = $5,
             e_modelo = $6,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = $7 AND criador_id = $8
         RETURNING *`,
        [
          String(titulo).trim(),
          descricao || null,
          nivel || "Intermediário",
          Number(tempo_estimado_min) || 45,
          cor_tema || "coral",
          Boolean(e_modelo),
          treinoId,
          personalId,
        ]
      );

      // Se nova lista de exercícios fornecida, substitui atomicamente
      let exerciciosFinais = [];
      if (Array.isArray(exercicios)) {
        await client.query(
          "DELETE FROM treino_exercicios WHERE treino_id = $1",
          [treinoId]
        );

        for (let i = 0; i < exercicios.length; i++) {
          const ex = exercicios[i];
          const exRes = await client.query(
            `INSERT INTO treino_exercicios (
               treino_id, ordem, exercise_id, nome, grupo_muscular,
               series_padrao, reps_padrao, descanso_padrao, carga_padrao, gif_url, notas
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
              treinoId,
              i + 1,
              String(ex.exercise_id || `ex-${i + 1}`),
              String(ex.nome || "Exercício"),
              String(ex.grupo_muscular || "Geral"),
              String(ex.series_padrao || "3 × 12 reps"),
              String(ex.reps_padrao || "12"),
              String(ex.descanso_padrao || "75s"),
              String(ex.carga_padrao || "0"),
              String(ex.gif_url || ""),
              ex.notas || null,
            ]
          );
          exerciciosFinais.push(exRes.rows[0]);
        }
      } else {
        const exQuery = await client.query(
          "SELECT * FROM treino_exercicios WHERE treino_id = $1 ORDER BY ordem ASC",
          [treinoId]
        );
        exerciciosFinais = exQuery.rows;
      }

      await client.query("COMMIT");

      const treinoAtualizado = updateTreino.rows[0];
      treinoAtualizado.exercicios = exerciciosFinais;

      await logAudit({
        usuarioId: personalId,
        operacao: "EDITAR_TREINO",
        detalhes: { treinoId, titulo },
        ip: req.ip,
      });

      return res.json({
        message: "Treino atualizado com sucesso.",
        treino: treinoAtualizado,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Erro na transação de atualização de treino:", error);
      return res
        .status(500)
        .json({ error: "Erro interno ao atualizar treino." });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Erro ao editar treino:", error);
    return res.status(500).json({ error: "Erro interno ao editar treino." });
  }
});

// DELETE /api/personal/treinos/:id (RF08 - Excluir treino do personal)
router.delete("/treinos/:id", async (req, res) => {
  try {
    const personalId = req.user.id;
    const treinoId = Number(req.params.id);

    const check = await query(
      "SELECT id, titulo FROM treinos WHERE id = $1 AND criador_id = $2",
      [treinoId, personalId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        error:
          "Treino não encontrado ou você não tem permissão para excluí-lo.",
      });
    }

    const history = await query(
      "SELECT id FROM execucoes_treino WHERE treino_id = $1 LIMIT 1",
      [treinoId]
    );
    if (history.rows.length)
      return res
        .status(409)
        .json({ error: "Treino com histórico não pode ser excluído." });
    await query("DELETE FROM treinos WHERE id = $1 AND criador_id = $2", [
      treinoId,
      personalId,
    ]);

    await logAudit({
      usuarioId: personalId,
      operacao: "EXCLUIR_TREINO",
      detalhes: { treinoId, titulo: check.rows[0].titulo },
      ip: req.ip,
    });

    return res.json({ message: "Treino excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir treino:", error);
    return res.status(500).json({ error: "Erro interno ao excluir treino." });
  }
});

// GET /api/personal/treinos
router.get("/treinos", async (req, res) => {
  try {
    const personalId = req.user.id;

    const result = await query(
      `SELECT t.* FROM treinos t WHERE t.criador_id = $1 OR t.e_modelo = TRUE ORDER BY t.criado_em DESC`,
      [personalId]
    );
    const counts = await query(
      "SELECT treino_id, COUNT(*) AS total FROM treino_exercicios GROUP BY treino_id"
    );
    const countMap = new Map(
      counts.rows.map(row => [Number(row.treino_id), Number(row.total)])
    );
    result.rows.forEach(row => {
      row.total_exercicios = countMap.get(Number(row.id)) || 0;
    });

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar treinos do personal:", error);
    return res.status(500).json({ error: "Erro interno ao listar treinos." });
  }
});

router.get("/treinos/:id", async (req, res) => {
  try {
    const t = await query(
      "SELECT * FROM treinos WHERE id=$1 AND criador_id=$2",
      [Number(req.params.id), req.user.id]
    );
    if (!t.rows.length)
      return res.status(404).json({ error: "Treino não encontrado." });
    const ex = await query(
      "SELECT * FROM treino_exercicios WHERE treino_id=$1 ORDER BY ordem",
      [Number(req.params.id)]
    );
    return res.json({ ...t.rows[0], exercicios: ex.rows });
  } catch {
    return res.status(500).json({ error: "Falha ao carregar ficha." });
  }
});

router.post("/treinos/atribuir", async (req, res) => {
  try {
    const rows = await assignWorkouts(
      req.user.id,
      { ...req.body, aluno_ids: req.body.aluno_ids || [req.body.aluno_id] },
      req.ip
    );
    return res.status(201).json({
      message: "Treino atribuído.",
      atribuicao: rows[0],
      atribuicoes: rows,
    });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ error: e.status ? e.message : "Erro ao atribuir treino." });
  }
});

// GET /api/personal/feedbacks (RF04, RF07, RF10)
router.get("/feedbacks", async (req, res) => {
  try {
    const personalId = req.user.id;

    // Busca feedbacks estruturados da tabela feedbacks_treino
    const feedbacksRes = await query(
      `SELECT f.*, u.nome AS aluno_nome, u.email AS aluno_email,
              t.titulo AS treino_titulo, e.duracao_segundos, e.concluido_em AS treino_concluido_em
       FROM feedbacks_treino f
       JOIN usuarios u ON u.id = f.aluno_id
       JOIN vinculos_aluno_personal v ON v.aluno_id=f.aluno_id AND v.personal_id=f.personal_id AND v.status='active'
       LEFT JOIN execucoes_treino e ON e.id = f.execucao_id
       LEFT JOIN treinos t ON t.id = COALESCE(e.treino_id, f.treino_id)
       WHERE f.personal_id = $1
       ORDER BY f.criado_em DESC`,
      [personalId]
    );

    return res.json(feedbacksRes.rows);
  } catch (error) {
    console.error("Erro ao buscar feedbacks do personal:", error);
    return res.status(500).json({ error: "Erro interno ao buscar feedbacks." });
  }
});

// PATCH /api/personal/feedbacks/:id/visualizar (RN14)
router.patch("/feedbacks/:id/visualizar", async (req, res) => {
  try {
    const personalId = req.user.id;
    const feedbackId = Number(req.params.id);

    if (!(await activeFeedback(feedbackId, personalId)))
      return res
        .status(404)
        .json({ error: "Feedback não encontrado para acompanhamento ativo." });

    const result = await query(
      `UPDATE feedbacks_treino
       SET visualizado_pelo_personal = TRUE
       WHERE id = $1 AND personal_id = $2
       RETURNING *`,
      [feedbackId, personalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Feedback não encontrado." });
    }

    return res.json({
      message: "Feedback marcado como visualizado.",
      feedback: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao visualizar feedback:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao atualizar visualização do feedback." });
  }
});

// PATCH /api/personal/feedbacks/:id/responder (RF04, RF07)
router.patch("/feedbacks/:id/responder", async (req, res) => {
  try {
    const personalId = req.user.id;
    const feedbackId = Number(req.params.id);
    const { resposta_personal } = req.body;

    if (
      !resposta_personal ||
      typeof resposta_personal !== "string" ||
      !resposta_personal.trim() ||
      resposta_personal.length > 4000
    ) {
      return res
        .status(400)
        .json({ error: "O texto da resposta do personal é obrigatório." });
    }

    const feedback = await activeFeedback(feedbackId, personalId);
    if (!feedback)
      return res
        .status(404)
        .json({ error: "Feedback não encontrado para acompanhamento ativo." });

    const result = await query(
      `UPDATE feedbacks_treino
       SET resposta_personal = $1,
           visualizado_pelo_personal = TRUE,
           respondido_em = CURRENT_TIMESTAMP
       WHERE id = $2 AND personal_id = $3
       RETURNING *`,
      [String(resposta_personal).trim(), feedbackId, personalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Feedback não encontrado." });
    }

    await logAudit({
      usuarioId: personalId,
      operacao: "RESPONDER_FEEDBACK",
      detalhes: { feedbackId },
      ip: req.ip,
    });
    await query(
      "INSERT INTO mensagens_chat(remetente_id,destinatario_id,texto) VALUES($1,$2,$3)",
      [
        personalId,
        feedback.aluno_id,
        `Orientação do feedback #${feedbackId}: ${resposta_personal.trim()}`,
      ]
    );
    res.once("finish", () => {
      if (res.statusCode === 200) notifyChat(personalId, feedback.aluno_id);
    });

    return res.json({
      message: "Orientação técnica enviada ao aluno com sucesso.",
      feedback: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao responder feedback:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao responder feedback." });
  }
});

export default router;
