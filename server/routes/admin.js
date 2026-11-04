import { Router } from "express";
import { validarCrefExterno } from "../services/crefService.js";
import { validateWorkout } from "../utils/workout.js";
import { query, getClient } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { logAudit } from "../services/auditService.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("admin"));

// GET /api/admin/usuarios
router.get("/usuarios", async (req, res) => {
  try {
    const { tipo, status, busca } = req.query;
    let whereClauses = [];
    let params = [];
    let counter = 1;

    if (tipo && ["student", "personal", "admin"].includes(tipo)) {
      whereClauses.push(`u.tipo = $${counter++}`);
      params.push(tipo);
    }

    if (status && ["Ativo", "Bloqueado", "Pendente"].includes(status)) {
      whereClauses.push(`u.status = $${counter++}`);
      params.push(status);
    }

    if (busca) {
      whereClauses.push(
        `(LOWER(u.nome) LIKE $${counter} OR LOWER(u.email) LIKE $${counter} OR u.cpf LIKE $${counter})`
      );
      params.push(`%${busca.toLowerCase()}%`);
      counter++;
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const result = await query(
      `SELECT u.id, u.nome, u.cpf, u.email, u.tipo, u.status, u.tema, u.criado_em,
              p.cref, p.status_cref, p.area_formacao,
              a.objetivo, a.meta_treinos_semana
       FROM usuarios u
       LEFT JOIN perfis_personais p ON p.usuario_id = u.id
       LEFT JOIN perfis_alunos a ON a.usuario_id = u.id
       ${whereSql}
       ORDER BY u.criado_em DESC
       LIMIT 100`,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar usuários (admin):", error);
    return res.status(500).json({ error: "Erro interno ao listar usuários." });
  }
});

// PATCH /api/admin/usuarios/:id/status
router.patch("/usuarios/:id/status", async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const { status } = req.body;

    if (!["Ativo", "Bloqueado", "Pendente"].includes(status)) {
      return res.status(400).json({
        error: "Status inválido. Escolha 'Ativo', 'Bloqueado' ou 'Pendente'.",
      });
    }

    // Impede que o próprio admin logado se auto-bloqueie
    if (targetUserId === req.user.id && status === "Bloqueado") {
      return res.status(400).json({
        error:
          "Operação inválida: um administrador não pode bloquear a si próprio.",
      });
    }

    // Verifica usuário e status do CREF para garantir as invariantes de autorização
    const userCheck = await query(
      `SELECT u.id, u.tipo, u.status, p.status_cref
       FROM usuarios u
       LEFT JOIN perfis_personais p ON p.usuario_id = u.id
       WHERE u.id = $1`,
      [targetUserId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const targetUser = userCheck.rows[0];

    // Invariante: personal só status Ativo com CREF Validado
    if (
      status === "Ativo" &&
      targetUser.tipo === "personal" &&
      targetUser.status_cref !== "Validado"
    ) {
      return res.status(400).json({
        error: "Personal trainer só pode ter status Ativo com CREF validado.",
      });
    }

    const result = await query(
      `UPDATE usuarios
       SET status = $1, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, nome, email, tipo, status`,
      [status, targetUserId]
    );

    // Mudanças para Pendente ou Bloqueado invalidam sessões ativas imediatamente
    if (status === "Bloqueado" || status === "Pendente") {
      await query("DELETE FROM sessoes WHERE usuario_id = $1", [targetUserId]);
    }

    // RN09: Trilha de auditoria
    await logAudit({
      usuarioId: req.user.id,
      operacao: "ADMIN_ALTERAR_STATUS_USUARIO",
      detalhes: { targetUserId, novoStatus: status },
      ip: req.ip,
    });

    return res.json({
      message: `Status do usuário atualizado para '${status}'.`,
      usuario: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao alterar status de usuário:", error);
    return res.status(500).json({ error: "Erro interno ao atualizar status." });
  }
});

// PATCH /api/admin/personais/:id/validar-cref
router.patch("/personais/:id/validar-cref", async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const { status_cref } = req.body;

    if (!["Validado", "Rejeitado", "Pendente"].includes(status_cref)) {
      return res.status(400).json({
        error:
          "status_cref inválido. Escolha 'Validado', 'Rejeitado' ou 'Pendente'.",
      });
    }

    if (status_cref === "Validado") {
      const data = await query(
        "SELECT p.cref, p.area_formacao, u.nome FROM perfis_personais p JOIN usuarios u ON u.id=p.usuario_id WHERE p.usuario_id=$1",
        [targetUserId]
      );
      if (!data.rows.length)
        return res
          .status(404)
          .json({ error: "Perfil de personal não encontrado." });
      const check = await validarCrefExterno(data.rows[0]);
      if (check.mock || check.status !== "Validado")
        return res.status(503).json({
          error:
            "CREF não confirmado pelo serviço externo. Cadastro permanece pendente.",
          validacao: check,
        });
    }
    const result = await query(
      `UPDATE perfis_personais
       SET status_cref = $1, atualizado_em = CURRENT_TIMESTAMP
       WHERE usuario_id = $2
       RETURNING *`,
      [status_cref, targetUserId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Perfil de personal não encontrado." });
    }

    // Se validado, ativa somente quando a conta não estiver Bloqueada pelo admin
    if (status_cref === "Validado") {
      await query(
        `UPDATE usuarios
         SET status = 'Ativo', atualizado_em = CURRENT_TIMESTAMP
         WHERE id = $1 AND status != 'Bloqueado'`,
        [targetUserId]
      );
    } else if (status_cref === "Rejeitado" || status_cref === "Pendente") {
      // Mudanças para Pendente/Rejeitado tiram Ativo e invalidam sessões
      await query(
        `UPDATE usuarios
         SET status = 'Pendente', atualizado_em = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'Ativo'`,
        [targetUserId]
      );
      await query("DELETE FROM sessoes WHERE usuario_id = $1", [targetUserId]);
    }

    // RN09: Trilha de auditoria
    await logAudit({
      usuarioId: req.user.id,
      operacao: "ADMIN_VALIDAR_CREF",
      detalhes: { targetUserId, novoStatusCref: status_cref },
      ip: req.ip,
    });

    if (status_cref === "Pendente") {
      await query(
        "INSERT INTO validacoes_profissionais(usuario_id) VALUES($1) ON CONFLICT(usuario_id) DO UPDATE SET estado='pendente',tentativas=0,proxima_tentativa=CURRENT_TIMESTAMP,bloqueado_ate=NULL,ultimo_erro=NULL",
        [targetUserId]
      );
    } else {
      await query(
        "UPDATE validacoes_profissionais SET estado='concluido',bloqueado_ate=NULL WHERE usuario_id=$1",
        [targetUserId]
      );
    }

    return res.json({
      message: `CREF do personal atualizado para '${status_cref}'.`,
      perfil: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao validar CREF de personal:", error);
    return res.status(500).json({ error: "Erro interno ao validar CREF." });
  }
});

// GET /api/admin/estatisticas
router.get("/estatisticas", async (req, res) => {
  try {
    const [
      usuariosRes,
      sessoesRes,
      treinosRes,
      execucoesRes,
      personaisPendentesRes,
    ] = await Promise.all([
      query(
        `SELECT
             COUNT(*) AS total_usuarios,
             COALESCE(SUM(CASE WHEN tipo = 'student' THEN 1 ELSE 0 END), 0) AS total_alunos,
             COALESCE(SUM(CASE WHEN tipo = 'personal' THEN 1 ELSE 0 END), 0) AS total_personais,
             COALESCE(SUM(CASE WHEN tipo = 'admin' THEN 1 ELSE 0 END), 0) AS total_admins,
             COALESCE(SUM(CASE WHEN status = 'Bloqueado' THEN 1 ELSE 0 END), 0) AS total_bloqueados
           FROM usuarios`
      ),
      query(
        "SELECT COUNT(*) AS total_sessoes_ativas FROM sessoes WHERE expira_em > NOW()"
      ),
      query("SELECT COUNT(*) AS total_treinos FROM treinos"),
      query("SELECT COUNT(*) AS total_execucoes FROM execucoes_treino"),
      query(
        "SELECT COUNT(*) AS pendentes FROM perfis_personais WHERE status_cref = 'Pendente'"
      ),
    ]);

    return res.json({
      usuarios: {
        total: Number(usuariosRes.rows[0]?.total_usuarios || 0),
        alunos: Number(usuariosRes.rows[0]?.total_alunos || 0),
        personais: Number(usuariosRes.rows[0]?.total_personais || 0),
        admins: Number(usuariosRes.rows[0]?.total_admins || 0),
        bloqueados: Number(usuariosRes.rows[0]?.total_bloqueados || 0),
      },
      sessoes_ativas: Number(sessoesRes.rows[0]?.total_sessoes_ativas || 0),
      total_treinos_cadastrados: Number(treinosRes.rows[0]?.total_treinos || 0),
      total_treinos_concluidos: Number(
        execucoesRes.rows[0]?.total_execucoes || 0
      ),
      personais_pendentes_validacao: Number(
        personaisPendentesRes.rows[0]?.pendentes || 0
      ),
    });
  } catch (error) {
    console.error("Erro nas estatísticas (admin):", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao obter estatísticas da plataforma." });
  }
});

// GET /api/admin/auditoria (RN09)
router.get("/auditoria", async (req, res) => {
  try {
    const { operacao, usuario_id, limite = 100 } = req.query;
    let whereClauses = [];
    let params = [];
    let counter = 1;

    if (operacao) {
      whereClauses.push(`a.operacao = $${counter++}`);
      params.push(operacao);
    }
    if (usuario_id) {
      whereClauses.push(`a.usuario_id = $${counter++}`);
      params.push(Number(usuario_id));
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    params.push(Math.min(Number(limite) || 100, 500));

    const result = await query(
      `SELECT a.*, u.nome AS usuario_nome, u.email AS usuario_email, u.tipo AS usuario_tipo
       FROM auditoria_operacoes a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       ${whereSql}
       ORDER BY a.criado_em DESC
       LIMIT $${counter}`,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar trilha de auditoria:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao consultar auditoria." });
  }
});

// GET /api/admin/treinos-modelo (RF08, RF09)
router.get("/treinos-modelo", async (_req, res) => {
  try {
    const result = await query(
      `SELECT t.* FROM treinos t WHERE t.e_modelo = TRUE ORDER BY t.criado_em DESC`,
      []
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
    console.error("Erro ao listar treinos modelo:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao listar treinos modelo." });
  }
});

// POST /api/admin/treinos-modelo (RF08, RF09)
router.post("/treinos-modelo", async (req, res) => {
  try {
    const adminId = req.user.id;
    const {
      titulo,
      descricao,
      nivel,
      tempo_estimado_min,
      cor_tema,
      exercicios,
    } = req.body;

    if (!titulo || typeof titulo !== "string" || !titulo.trim()) {
      return res
        .status(400)
        .json({ error: "O título do treino modelo é obrigatório." });
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
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         RETURNING *`,
        [
          adminId,
          String(titulo).trim(),
          descricao || null,
          nivel || "Iniciante",
          Number(tempo_estimado_min) || 45,
          cor_tema || "coral",
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
              String(ex.descanso_padrao || "60s"),
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

      await logAudit({
        usuarioId: adminId,
        operacao: "ADMIN_CRIAR_TREINO_MODELO",
        detalhes: { treinoId, titulo },
        ip: req.ip,
      });

      return res.status(201).json({
        message: "Treino modelo cadastrado na biblioteca global.",
        treino: novoTreino,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Erro ao criar treino modelo:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao cadastrar modelo de treino." });
  }
});

// DELETE /api/admin/treinos-modelo/:id
router.delete("/treinos-modelo/:id", async (req, res) => {
  try {
    const treinoId = Number(req.params.id);
    const check = await query(
      "SELECT id, titulo FROM treinos WHERE id = $1 AND e_modelo = TRUE",
      [treinoId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Treino modelo não encontrado." });
    }

    const history = await query(
      "SELECT id FROM execucoes_treino WHERE treino_id = $1 LIMIT 1",
      [treinoId]
    );
    if (history.rows.length)
      return res
        .status(409)
        .json({ error: "Treino com histórico não pode ser excluído." });
    await query("DELETE FROM treinos WHERE id = $1", [treinoId]);

    await logAudit({
      usuarioId: req.user.id,
      operacao: "ADMIN_EXCLUIR_TREINO_MODELO",
      detalhes: { treinoId, titulo: check.rows[0].titulo },
      ip: req.ip,
    });

    return res.json({ message: "Treino modelo excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir treino modelo:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao excluir treino modelo." });
  }
});

export default router;
