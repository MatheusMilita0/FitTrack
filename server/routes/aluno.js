import { profileView } from "../services/profileView.js";
import { notifyChat } from "../services/chatEvents.js";
import {
  recommendFor,
  saveSuggestion,
  shareSuggestion,
} from "../services/aiWorkflow.js";
import { readHistory } from "../services/historyService.js";
import { Router } from "express";
import {
  calculatePortions,
  saveDailyMeal,
} from "../services/nutritionService.js";
import { serverDay } from "../utils/day.js";
import { query, getClient } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { gerarRecomendacaoTreino } from "../services/aiService.js";
import { logAudit } from "../services/auditService.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("student"));

// GET /api/aluno/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const alunoId = req.user.id;
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    const hojeStr = `${ano}-${mes}-${dia}`;

    // 1. Perfil do aluno com metas
    const perfilRes = await query(
      "SELECT * FROM perfis_alunos WHERE usuario_id = $1",
      [alunoId]
    );
    const perfil = profileView(perfilRes.rows[0] || {});

    // 2. Registro de nutrição de hoje
    const nutricaoRes = await query(
      "SELECT * FROM registros_nutricao WHERE aluno_id = $1 AND data = $2",
      [alunoId, hojeStr]
    );
    const nutricaoHoje = nutricaoRes.rows[0] || {
      agua_ml: 0,
      calorias_consumidas: 0,
      proteinas_g: 0,
      carboidratos_g: 0,
      gorduras_g: 0,
      refeicoes: [],
    };

    // 3. Treino atribuído ativo
    const diasSiglas = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
    const diaHoje = diasSiglas[hoje.getDay()];

    const treinoRes = await query(
      `SELECT t.id, t.titulo, t.descricao, t.nivel, t.tempo_estimado_min, t.cor_tema,
              a.id AS atribuicao_id, a.dias_semana
       FROM atribuicoes_treino a
       JOIN treinos t ON t.id = a.treino_id
       WHERE a.aluno_id = $1 AND a.ativo = TRUE
       ORDER BY a.atribuido_em DESC`,
      [alunoId]
    );

    let treinoDoDia = null;
    if (treinoRes.rows.length > 0) {
      // Localiza atribuição que corresponda estritamente ao dia de hoje
      const match = treinoRes.rows.find(t => {
        let dias = t.dias_semana;
        if (typeof dias === "string") {
          try {
            dias = JSON.parse(dias);
          } catch {
            dias = dias.split(",").map(s => s.trim());
          }
        }
        if (!Array.isArray(dias)) {
          dias = String(dias || "")
            .split(",")
            .map(s => s.trim());
        }
        return dias.includes(diaHoje);
      });

      if (match) {
        treinoDoDia = match;
        // Busca exercícios do treino
        const exerciciosRes = await query(
          `SELECT id, ordem, exercise_id, nome, grupo_muscular, series_padrao,
                  reps_padrao, descanso_padrao, carga_padrao, gif_url, notas
           FROM treino_exercicios
           WHERE treino_id = $1
           ORDER BY ordem ASC`,
          [treinoDoDia.id]
        );
        treinoDoDia.exercicios = exerciciosRes.rows;
      }
    }

    // 4. Personal trainer vinculado ativo
    const personalRes = await query(
      `SELECT u.id, u.nome, u.email, p.cref, p.area_formacao, p.atuacao_principal, v.status AS vinculo_status
       FROM vinculos_aluno_personal v
       JOIN usuarios u ON u.id = v.personal_id
       LEFT JOIN perfis_personais p ON p.usuario_id = u.id
       WHERE v.aluno_id = $1 AND v.status = 'active'
       LIMIT 1`,
      [alunoId]
    );
    const personalVinculado = personalRes.rows[0] || null;

    // 5. Total de treinos realizados (frequência)
    const frequenciaRes = await query(
      `SELECT COUNT(*) AS total_concluidos,
              COALESCE(SUM(CASE WHEN concluido_em >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0) AS concluidos_semana
       FROM execucoes_treino
       WHERE aluno_id = $1`,
      [alunoId]
    );

    return res.json({
      perfil,
      nutricao_hoje: nutricaoHoje,
      treino_do_dia: treinoDoDia,
      personal_vinculado: personalVinculado,
      frequencia: {
        total_concluidos: Number(frequenciaRes.rows[0]?.total_concluidos || 0),
        concluidos_semana: Number(
          frequenciaRes.rows[0]?.concluidos_semana || 0
        ),
        meta_semana: perfil.meta_treinos_semana || 4,
      },
    });
  } catch (error) {
    console.error("Erro no dashboard do aluno:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao carregar dashboard do aluno." });
  }
});

// POST /api/aluno/hidratacao
router.post("/hidratacao", async (req, res) => {
  try {
    const alunoId = req.user.id;
    const { incremento_ml } = req.body;
    const hojeStr = serverDay();

    const quantidade = Number(incremento_ml);
    if (
      !Number.isInteger(quantidade) ||
      quantidade <= 0 ||
      quantidade > 10000
    ) {
      return res.status(400).json({
        error: "incremento_ml deve ser um inteiro entre 1 e 10.000 ml.",
      });
    }

    const result = await query(
      `INSERT INTO registros_nutricao (aluno_id, data, agua_ml)
       VALUES ($1, $2, $3)
       ON CONFLICT (aluno_id, data)
       DO UPDATE SET agua_ml = registros_nutricao.agua_ml + EXCLUDED.agua_ml
       RETURNING *`,
      [alunoId, hojeStr, Math.round(quantidade)]
    );

    await logAudit({
      usuarioId: alunoId,
      operacao: "REGISTRO_NUTRICAO",
      detalhes: { data: hojeStr },
    });
    const nutricao = result.rows[0];
    if (typeof nutricao.refeicoes === "string") {
      try {
        nutricao.refeicoes = JSON.parse(nutricao.refeicoes);
      } catch {
        nutricao.refeicoes = [];
      }
    }

    return res.json({
      message: "Hidratação registrada com sucesso.",
      nutricao,
    });
  } catch (error) {
    console.error("Erro ao registrar hidratação:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao registrar hidratação." });
  }
});

// POST /api/aluno/refeicoes
router.post("/refeicoes", async (req, res) => {
  try {
    const alunoId = req.user.id;
    const hojeStr = serverDay();
    const { titulo, itens, kcal, proteinas, carboidratos, gorduras } = req.body;
    if (req.body.alimentos !== undefined) {
      if (typeof titulo !== "string" || !titulo.trim() || titulo.length > 150)
        return res.status(400).json({ error: "Informe o título da refeição." });
      const portion = await calculatePortions(req.body.alimentos);
      const meal = {
        titulo: titulo.trim(),
        origem: "TACO",
        itens: portion.alimentos
          .map(a => `${a.quantidade} ${a.medida} de ${a.nome} (${a.gramas} g)`)
          .join("; "),
        alimentos: portion.alimentos,
        nutrientes: {
          valores: portion.valores,
          conhecidos: portion.conhecidos,
          ausentes: portion.ausentes,
        },
        kcal: portion.conhecidos.energia_kcal || 0,
        proteinas: portion.conhecidos.proteina_g || 0,
        carboidratos: portion.conhecidos.carboidrato_g || 0,
        gorduras: portion.conhecidos.lipideos_g || 0,
      };
      const nutricao = await saveDailyMeal(alunoId, meal, req.ip);
      return res
        .status(201)
        .json({ message: "Refeição calculada e registrada.", nutricao });
    }

    if (
      !titulo ||
      typeof titulo !== "string" ||
      !titulo.trim() ||
      kcal === undefined ||
      kcal === null
    ) {
      return res.status(400).json({
        error: "Campos obrigatórios: titulo e kcal.",
      });
    }

    const kcalNum = Number(kcal);
    if (!Number.isFinite(kcalNum) || kcalNum < 0) {
      return res.status(400).json({
        error: "kcal deve ser um número finito e não negativo.",
      });
    }

    const protNum =
      proteinas !== undefined && proteinas !== null ? Number(proteinas) : 0;
    const carbNum =
      carboidratos !== undefined && carboidratos !== null
        ? Number(carboidratos)
        : 0;
    const gordNum =
      gorduras !== undefined && gorduras !== null ? Number(gorduras) : 0;

    if (
      !Number.isFinite(protNum) ||
      protNum < 0 ||
      !Number.isFinite(carbNum) ||
      carbNum < 0 ||
      !Number.isFinite(gordNum) ||
      gordNum < 0
    ) {
      return res.status(400).json({
        error:
          "Valores nutricionais devem ser números finitos e não negativos.",
      });
    }

    const novaRefeicao = {
      id: Date.now(),
      titulo: titulo.trim(),
      itens: String(itens || "").trim(),
      kcal: kcalNum,
      proteinas: protNum,
      carboidratos: carbNum,
      gorduras: gordNum,
      hora: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const nutricao = await saveDailyMeal(
      alunoId,
      { ...novaRefeicao, origem: "manual" },
      req.ip
    );

    return res.status(201).json({
      message: "Refeição adicionada com sucesso.",
      nutricao,
    });
  } catch (error) {
    console.error("Erro ao adicionar refeição:", error);
    return res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : "Erro interno ao adicionar refeição.",
    });
  }
});

// GET /api/aluno/treinos
router.get("/treinos", async (req, res) => {
  try {
    const alunoId = req.user.id;

    // Treinos atribuídos diretamente ao aluno
    const atribuidosRes = await query(
      `SELECT t.id, t.titulo, t.descricao, t.nivel, t.tempo_estimado_min, t.cor_tema,
              a.id AS atribuicao_id, a.dias_semana, a.ativo, a.atribuido_em,
              u.nome AS personal_nome
       FROM atribuicoes_treino a
       JOIN treinos t ON t.id = a.treino_id
       LEFT JOIN usuarios u ON u.id = a.personal_id
       WHERE a.aluno_id = $1
       ORDER BY a.ativo DESC, a.atribuido_em DESC`,
      [alunoId]
    );

    // Modelos gerais da biblioteca
    const modelosRes = await query(
      `SELECT id, titulo, descricao, nivel, tempo_estimado_min, cor_tema, e_modelo, criado_em
       FROM treinos
       WHERE e_modelo = TRUE
       ORDER BY titulo ASC`
    );

    // Para cada treino atribuído, carrega exercícios
    for (const treino of atribuidosRes.rows) {
      const exRes = await query(
        `SELECT id, ordem, exercise_id, nome, grupo_muscular, series_padrao, reps_padrao, descanso_padrao, carga_padrao, gif_url, notas
         FROM treino_exercicios
         WHERE treino_id = $1
         ORDER BY ordem ASC`,
        [treino.id]
      );
      treino.exercicios = exRes.rows;
    }

    // Para cada modelo da biblioteca, carrega exercícios com o mesmo contrato
    for (const modelo of modelosRes.rows) {
      const exRes = await query(
        `SELECT id, ordem, exercise_id, nome, grupo_muscular, series_padrao, reps_padrao, descanso_padrao, carga_padrao, gif_url, notas
         FROM treino_exercicios
         WHERE treino_id = $1
         ORDER BY ordem ASC`,
        [modelo.id]
      );
      modelo.exercicios = exRes.rows;
    }

    return res.json({
      atribuidos: atribuidosRes.rows,
      modelos_biblioteca: modelosRes.rows,
    });
  } catch (error) {
    console.error("Erro ao listar treinos do aluno:", error);
    return res.status(500).json({ error: "Erro interno ao listar treinos." });
  }
});

// POST /api/aluno/treinos/execucao
router.post("/treinos/execucao", async (req, res) => {
  try {
    const alunoId = req.user.id;
    const { treino_id, duracao_segundos, series_executadas } = req.body;

    if (!treino_id) {
      return res.status(400).json({ error: "treino_id é obrigatório." });
    }

    const treinoIdNum = Number(treino_id);
    if (isNaN(treinoIdNum)) {
      return res.status(400).json({ error: "treino_id inválido." });
    }

    // Permite apenas treino da biblioteca (e_modelo = TRUE) ou atribuído ativamente ao aluno
    const treinoRes = await query(
      `SELECT t.id, t.e_modelo, a.id AS atribuicao_id
       FROM treinos t
       LEFT JOIN atribuicoes_treino a
         ON a.treino_id = t.id AND a.aluno_id = $2 AND a.ativo = TRUE
       WHERE t.id = $1
       LIMIT 1`,
      [treinoIdNum, alunoId]
    );

    if (treinoRes.rows.length === 0) {
      return res.status(404).json({ error: "Treino não encontrado." });
    }

    const treino = treinoRes.rows[0];
    if (!treino.e_modelo && !treino.atribuicao_id) {
      return res.status(403).json({
        error: "Acesso negado: treino não disponível para este aluno.",
      });
    }

    if (
      !Number.isInteger(Number(duracao_segundos)) ||
      Number(duracao_segundos) < 0 ||
      Number(duracao_segundos) > 86400 ||
      !Array.isArray(series_executadas) ||
      series_executadas.length === 0 ||
      series_executadas.length > 1000 ||
      series_executadas.some(
        s =>
          !s ||
          !["string", "number"].includes(typeof s.carga) ||
          String(s.carga).trim() === "" ||
          !Number.isFinite(Number(s.carga)) ||
          Number(s.carga) < 0 ||
          !["string", "number"].includes(typeof s.reps) ||
          String(s.reps).trim() === "" ||
          !Number.isInteger(Number(s.reps)) ||
          Number(s.reps) < 0
      )
    ) {
      return res
        .status(400)
        .json({ error: "Duração, cargas ou repetições inválidas." });
    }
    const duracao = Number(duracao_segundos) || 0;
    const series = Array.isArray(series_executadas) ? series_executadas : [];

    const result = await query(
      `INSERT INTO execucoes_treino (treino_id, aluno_id, duracao_segundos, series_executadas)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [treinoIdNum, alunoId, duracao, JSON.stringify(series)]
    );

    return res.status(201).json({
      message: "Execução de treino salva com sucesso.",
      execucao: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao registrar execução de treino:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao registrar execução." });
  }
});

router.get("/historico", async (req, res) => {
  try {
    return res.json(await readHistory(req.user.id, req.query));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro ao consultar histórico.",
    });
  }
});

// GET /api/aluno/personais
router.get("/personais", async (req, res) => {
  try {
    const alunoId = req.user.id;

    const result = await query(
      `SELECT u.id, u.nome, u.email, p.cref, p.area_formacao, p.atuacao_principal, p.status_cref,
              v.status AS vinculo_status, v.id AS vinculo_id
       FROM usuarios u
       JOIN perfis_personais p ON p.usuario_id = u.id
       LEFT JOIN vinculos_aluno_personal v ON v.personal_id = u.id AND v.aluno_id = $1
       WHERE u.tipo = 'personal' AND u.status = 'Ativo' AND p.status_cref = 'Validado'
       ORDER BY u.nome ASC`,
      [alunoId]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar personais disponíveis:", error);
    return res.status(500).json({ error: "Erro interno ao listar personais." });
  }
});

// POST /api/aluno/vincular-personal (RN18)
router.post("/vincular-personal", async (req, res) => {
  try {
    const alunoId = req.user.id;
    const { personal_id } = req.body;

    if (!personal_id) {
      return res.status(400).json({ error: "personal_id é obrigatório." });
    }

    // Verifica se personal existe e é do tipo personal
    const personalCheck = await query(
      "SELECT id FROM usuarios WHERE id = $1 AND tipo = 'personal'",
      [Number(personal_id)]
    );
    if (personalCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Personal trainer não encontrado." });
    }

    const active = await query(
      "SELECT id FROM vinculos_aluno_personal WHERE aluno_id = $1 AND status = 'active'",
      [alunoId]
    );
    if (active.rows.length)
      return res.status(409).json({
        error:
          "Encerre o vínculo atual antes de solicitar outro personal (RN18).",
      });
    const approved = await query(
      `SELECT u.id FROM usuarios u JOIN perfis_personais p ON p.usuario_id=u.id WHERE u.id=$1 AND u.status='Ativo' AND p.status_cref='Validado'`,
      [Number(personal_id)]
    );
    if (!approved.rows.length)
      return res
        .status(403)
        .json({ error: "Personal indisponível ou CREF pendente." });
    const result = await query(
      `INSERT INTO vinculos_aluno_personal (aluno_id, personal_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (aluno_id, personal_id)
       DO UPDATE SET status = 'pending', atualizado_em = CURRENT_TIMESTAMP
       RETURNING *`,
      [alunoId, Number(personal_id)]
    );

    await logAudit({
      usuarioId: alunoId,
      operacao: "SOLICITAR_VINCULO_PERSONAL",
      detalhes: { personalId: Number(personal_id) },
      ip: req.ip,
    });

    return res.status(201).json({
      message: "Solicitação de acompanhamento enviada ao personal trainer.",
      vinculo: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao solicitar vínculo com personal:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao solicitar vínculo." });
  }
});

router.delete("/vinculo", async (req, res) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE vinculos_aluno_personal SET status='terminated', atualizado_em=CURRENT_TIMESTAMP WHERE aluno_id=$1 AND status IN ('active','pending')",
      [req.user.id]
    );
    await client.query(
      "UPDATE atribuicoes_treino SET ativo=FALSE WHERE aluno_id=$1 AND personal_id IS NOT NULL",
      [req.user.id]
    );
    await client.query("COMMIT");
    await logAudit({
      usuarioId: req.user.id,
      operacao: "ENCERRAR_VINCULO_ALUNO",
    });
    return res.json({ message: "Vínculo encerrado." });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Falha ao encerrar vínculo." });
  } finally {
    client.release();
  }
});

router.post("/recomendacao-ia", async (req, res) => {
  try {
    return res.json({
      recomendacao: await recommendFor(
        req.user.id,
        req.user.id,
        req.body.restricoes || ""
      ),
    });
  } catch (e) {
    return res
      .status(e.status || 502)
      .json({ error: e.status ? e.message : "Falha ao consultar a IA." });
  }
});
router.post("/sugestoes-ia/:id/salvar", async (req, res) => {
  try {
    return res.json({
      treino: await saveSuggestion(
        req.user.id,
        req.params.id,
        req.body.confirmar_demonstracao
      ),
    });
  } catch (e) {
    return res.status(e.status || 500).json({
      error: e.status ? e.message : "Não foi possível salvar a sugestão.",
    });
  }
});
router.post("/sugestoes-ia/:id/enviar", async (req, res) => {
  try {
    const result = await shareSuggestion(req.user.id, req.params.id);
    res.once("finish", () => {
      if (res.statusCode === 200) notifyChat(req.user.id, result.personal_id);
    });
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({
      error: e.status ? e.message : "Não foi possível enviar a sugestão.",
    });
  }
});

export default router;
