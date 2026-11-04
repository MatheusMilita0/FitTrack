import { requestVideoUpload } from "../services/storageService.js";
import { notifyChat } from "../services/chatEvents.js";
import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { logAudit } from "../services/auditService.js";

const router = Router();

// POST /api/feedbacks (RF04, RF07)
// Envio de feedback técnico em vídeo/link de execução pelo aluno
router.post("/", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const alunoId = req.user.id;
    const { execucao_id, video_url, nota_execucao, comentario_aluno } =
      req.body;

    if (!video_url || typeof video_url !== "string" || !video_url.trim()) {
      return res.status(400).json({
        error: "O link do vídeo (video_url) é obrigatório para o feedback.",
      });
    }

    const cleanUrl = video_url.trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      /* Validated below. */
    }
    if (
      !parsedUrl ||
      parsedUrl.protocol !== "https:" ||
      !parsedUrl.hostname ||
      parsedUrl.username ||
      parsedUrl.password ||
      cleanUrl.length > 2048
    ) {
      return res.status(400).json({
        error:
          "O link do vídeo deve ser uma URL HTTPS válida, sem credenciais e com até 2048 caracteres.",
      });
    }

    // Verifica se aluno possui personal com vínculo ativo
    const vinculoRes = await query(
      `SELECT personal_id FROM vinculos_aluno_personal
       WHERE aluno_id = $1 AND status = 'active'
       LIMIT 1`,
      [alunoId]
    );

    if (vinculoRes.rows.length === 0) {
      return res.status(403).json({
        error:
          "Acesso negado: você só pode enviar feedback para um personal trainer com vínculo ativo.",
      });
    }

    const personalId = vinculoRes.rows[0].personal_id;

    if (!Number.isInteger(Number(execucao_id)) || Number(execucao_id) <= 0) {
      return res
        .status(400)
        .json({ error: "Selecione uma execução concluída do treino." });
    }
    let execId = null;
    if (execucao_id) {
      const execCheck = await query(
        "SELECT id FROM execucoes_treino WHERE id = $1 AND aluno_id = $2",
        [Number(execucao_id), alunoId]
      );
      if (execCheck.rows.length > 0) {
        execId = Number(execucao_id);
      }
    }

    if (!execId)
      return res.status(403).json({ error: "Execução não pertence ao aluno." });
    const result = await query(
      `INSERT INTO feedbacks_treino (
         execucao_id, aluno_id, personal_id, video_url, nota_execucao, comentario_aluno, visualizado_pelo_personal
       ) VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING *`,
      [
        execId,
        alunoId,
        personalId,
        cleanUrl,
        nota_execucao ? String(nota_execucao).trim() : null,
        comentario_aluno ? String(comentario_aluno).trim() : null,
      ]
    );

    await logAudit({
      usuarioId: alunoId,
      operacao: "ENVIO_FEEDBACK",
      detalhes: { feedbackId: result.rows[0].id, personalId },
      ip: req.ip,
    });
    await query(
      "INSERT INTO mensagens_chat(remetente_id,destinatario_id,texto) VALUES($1,$2,$3)",
      [
        alunoId,
        personalId,
        `Novo feedback de vídeo #${result.rows[0].id}, sessão #${execId}. Consulte a central de feedbacks para registrar a visualização e analisar o vídeo.`,
      ]
    );
    res.once("finish", () => {
      if (res.statusCode === 201) notifyChat(alunoId, personalId);
    });

    return res.status(201).json({
      message: "Feedback de treino enviado com sucesso para o seu personal.",
      feedback: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao enviar feedback:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao registrar feedback." });
  }
});

// GET /api/feedbacks
// Listagem dos feedbacks enviados pelo aluno logado
router.get("/", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const alunoId = req.user.id;

    const result = await query(
      `SELECT f.*, u.nome AS personal_nome, t.titulo AS treino_titulo, e.duracao_segundos
       FROM feedbacks_treino f
       JOIN usuarios u ON u.id = f.personal_id
       LEFT JOIN execucoes_treino e ON e.id = f.execucao_id
       LEFT JOIN treinos t ON t.id = COALESCE(e.treino_id, f.treino_id)
       WHERE f.aluno_id = $1
       ORDER BY f.criado_em DESC`,
      [alunoId]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar feedbacks do aluno:", error);
    return res.status(500).json({ error: "Erro interno ao listar feedbacks." });
  }
});

// DELETE /api/feedbacks/:id (RN14)
// O aluno não pode excluir um feedback após este ter sido visualizado pelo personal trainer
router.delete("/:id", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const alunoId = req.user.id;
    const feedbackId = Number(req.params.id);

    const feedbackCheck = await query(
      "SELECT id, visualizado_pelo_personal FROM feedbacks_treino WHERE id = $1 AND aluno_id = $2",
      [feedbackId, alunoId]
    );

    if (feedbackCheck.rows.length === 0) {
      return res.status(404).json({
        error: "Feedback não encontrado ou não pertence a este aluno.",
      });
    }

    // RN14: Bloqueia exclusão se já visualizado pelo personal
    if (feedbackCheck.rows[0].visualizado_pelo_personal) {
      return res.status(403).json({
        error:
          "O aluno não pode excluir um feedback após este ter sido visualizado pelo personal trainer (RN14).",
      });
    }

    const deleted = await query(
      "DELETE FROM feedbacks_treino WHERE id = $1 AND aluno_id = $2 AND visualizado_pelo_personal = FALSE RETURNING id",
      [feedbackId, alunoId]
    );

    if (!deleted.rows.length)
      return res
        .status(409)
        .json({ error: "Feedback já visualizado; exclusão bloqueada." });
    await logAudit({
      usuarioId: alunoId,
      operacao: "EXCLUSAO_FEEDBACK",
      detalhes: { feedbackId },
      ip: req.ip,
    });

    return res.json({ message: "Feedback excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir feedback:", error);
    return res.status(500).json({ error: "Erro interno ao excluir feedback." });
  }
});

// POST /api/feedbacks/video
// Regra do baseline: retornar 501 Not Implemented explícito para upload binário sem cloud storage integrado
router.post("/video", requireAuth, requireRole("student"), async (req, res) => {
  try {
    return res.json(
      await requestVideoUpload({
        alunoId: req.user.id,
        contentType: req.body.contentType,
        size: req.body.size,
      })
    );
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.message });
  }
});

export default router;
