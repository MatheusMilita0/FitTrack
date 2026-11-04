import { notifyChat, subscribeChat } from "../services/chatEvents.js";
import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/eventos", (req, res) => {
  if (req.user.tipo === "admin" || req.user.status !== "Ativo")
    return res
      .status(403)
      .json({ error: "Canal exclusivo de acompanhamento ativo." });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": conectado\n\n");
  const unsub = subscribeChat(req.user.id, () => {
    if (!res.destroyed && !res.writableEnded) res.write("data: atualizar\n\n");
  });
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const session = (
        await query(
          "SELECT s.token FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=$1 AND s.expira_em>CURRENT_TIMESTAMP AND u.status='Ativo'",
          [req.sessionToken]
        )
      ).rows;
      if (res.destroyed || res.writableEnded) return;
      if (!session.length) res.end();
      else res.write(": ativo\n\n");
    } catch {
      res.end();
    } finally {
      checking = false;
    }
  }, 15000);
  res.on("close", () => {
    clearInterval(timer);
    unsub();
  });
});

// Helper para validar autorização de comunicação entre pares
async function checkChatAuthorization(userId1, userId2, userRole) {
  // O perfil administrador não autoriza acesso às conversas privadas.
  if (userRole === "admin") {
    return false;
  }

  // Verifica se há vínculo ativo entre aluno e personal
  const linkCheck = await query(
    `SELECT id FROM vinculos_aluno_personal
     WHERE ((aluno_id = $1 AND personal_id = $2) OR (aluno_id = $2 AND personal_id = $1))
       AND status = 'active'`,
    [userId1, userId2]
  );

  return linkCheck.rows.length > 0;
}

// GET /api/chat/conversas
router.get("/conversas", async (req, res) => {
  try {
    const userId = req.user.id;
    let contatos = [];

    if (req.user.tipo === "student") {
      const result = await query(
        `SELECT u.id, u.nome, u.email, u.tipo, p.cref, p.atuacao_principal,
                COALESCE(m.nao_lidas, 0) AS nao_lidas
         FROM vinculos_aluno_personal v
         JOIN usuarios u ON u.id = v.personal_id
         LEFT JOIN perfis_personais p ON p.usuario_id = u.id
         LEFT JOIN (
           SELECT remetente_id, COUNT(*) AS nao_lidas
           FROM mensagens_chat
           WHERE destinatario_id = $1 AND lido = FALSE
           GROUP BY remetente_id
         ) m ON m.remetente_id = u.id
         WHERE v.aluno_id = $1 AND v.status = 'active'`,
        [userId]
      );
      contatos = result.rows;
    } else if (req.user.tipo === "personal") {
      const result = await query(
        `SELECT u.id, u.nome, u.email, u.tipo, p.objetivo,
                COALESCE(m.nao_lidas, 0) AS nao_lidas
         FROM vinculos_aluno_personal v
         JOIN usuarios u ON u.id = v.aluno_id
         LEFT JOIN perfis_alunos p ON p.usuario_id = u.id
         LEFT JOIN (
           SELECT remetente_id, COUNT(*) AS nao_lidas
           FROM mensagens_chat
           WHERE destinatario_id = $1 AND lido = FALSE
           GROUP BY remetente_id
         ) m ON m.remetente_id = u.id
         WHERE v.personal_id = $1 AND v.status = 'active'`,
        [userId]
      );
      contatos = result.rows;
    } else if (req.user.tipo === "admin") {
      const result = await query(
        "SELECT id, nome, email, tipo FROM usuarios WHERE id != $1 ORDER BY nome ASC LIMIT 50",
        [userId]
      );
      contatos = result.rows;
    }

    return res.json(contatos);
  } catch (error) {
    console.error("Erro ao listar conversas do chat:", error);
    return res.status(500).json({ error: "Erro interno ao listar contatos." });
  }
});

// GET /api/chat/mensagens?com=:usuarioId
router.get("/mensagens", async (req, res) => {
  try {
    const userId = req.user.id;
    const interlocutorId = Number(req.query.com);

    if (!interlocutorId) {
      return res
        .status(400)
        .json({ error: "Parâmetro ?com=:usuarioId é obrigatório." });
    }

    // Regra inegociável de isolamento: usuário só pode ler mensagens de interlocutor autorizado
    const autorizado = await checkChatAuthorization(
      userId,
      interlocutorId,
      req.user.tipo
    );

    if (!autorizado) {
      return res.status(403).json({
        error:
          "Acesso negado: você não possui vínculo de acompanhamento ativo com este usuário.",
      });
    }

    // Busca histórico ordenado cronologicamente
    const result = await query(
      `SELECT m.id, m.remetente_id, m.destinatario_id, m.tipo, m.texto, m.video_url,
              m.enviado_em, m.lido, u.nome AS remetente_nome
       FROM mensagens_chat m
       JOIN usuarios u ON u.id = m.remetente_id
       WHERE (m.remetente_id = $1 AND m.destinatario_id = $2)
          OR (m.remetente_id = $2 AND m.destinatario_id = $1)
       ORDER BY m.enviado_em DESC
       LIMIT 100`,
      [userId, interlocutorId]
    );

    // Marca as mensagens recebidas como lidas
    await query(
      `UPDATE mensagens_chat
       SET lido = TRUE
       WHERE remetente_id = $1 AND destinatario_id = $2 AND lido = FALSE`,
      [interlocutorId, userId]
    );

    return res.json(result.rows.reverse());
  } catch (error) {
    console.error("Erro ao carregar mensagens do chat:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao carregar mensagens." });
  }
});

// POST /api/chat/mensagens
router.post("/mensagens", async (req, res) => {
  try {
    const userId = req.user.id;
    const { destinatario_id, texto, tipo, video_url } = req.body;

    const destId = Number(destinatario_id);
    if (
      !Number.isInteger(destId) ||
      typeof texto !== "string" ||
      !texto.trim() ||
      texto.length > 5000
    ) {
      return res.status(400).json({
        error: "Campos obrigatórios: destinatario_id e texto.",
      });
    }

    // Regra inegociável de isolamento: envio somente entre pares autorizados
    const autorizado = await checkChatAuthorization(
      userId,
      destId,
      req.user.tipo
    );
    if (!autorizado) {
      return res.status(403).json({
        error:
          "Acesso negado: envio permitido apenas para contatos com vínculo ativo.",
      });
    }

    if (
      (tipo === "video_feedback" || video_url) &&
      (typeof video_url !== "string" || !/^https:\/\/[^\s]+$/i.test(video_url))
    )
      return res
        .status(400)
        .json({ error: "Informe um link HTTPS válido para o vídeo." });
    const tipoMsg = video_url ? "video_feedback" : "texto";
    const videoUrlFinal = video_url || null;

    const result = await query(
      `INSERT INTO mensagens_chat (remetente_id, destinatario_id, tipo, texto, video_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, destId, tipoMsg, String(texto).trim(), videoUrlFinal]
    );

    res.once("finish", () => {
      if (res.statusCode === 201) notifyChat(userId, destId);
    });
    return res.status(201).json({
      message: "Mensagem enviada com sucesso.",
      mensagem: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    return res.status(500).json({ error: "Erro interno ao enviar mensagem." });
  }
});

export default router;
