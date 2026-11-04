import { ageFromBirth } from "../utils/day.js";
import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  validateWeight,
  normalizeAndValidateHeight,
} from "../utils/validators.js";
import {
  calcularMetasNutricionais,
  DISCLAIMER_MEDICO,
} from "../services/calculoMetabolico.js";
import { logAudit } from "../services/auditService.js";

const router = Router();

// PATCH /api/usuarios/preferencias
router.patch("/preferencias", requireAuth, async (req, res) => {
  try {
    const { tema, notificacoes } = req.body;
    const updates = [];
    const values = [];
    let counter = 1;

    if (tema !== undefined) {
      if (!["dark", "light"].includes(tema)) {
        return res
          .status(400)
          .json({ error: "Tema deve ser 'dark' ou 'light'." });
      }
      updates.push(`tema = $${counter++}`);
      values.push(tema);
    }

    if (notificacoes !== undefined) {
      updates.push(`notificacoes = $${counter++}`);
      values.push(Boolean(notificacoes));
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ error: "Nenhum campo de preferência informado." });
    }

    updates.push(`atualizado_em = CURRENT_TIMESTAMP`);
    values.push(req.user.id);

    const sql = `UPDATE usuarios SET ${updates.join(", ")} WHERE id = $${counter} RETURNING id, nome, email, tipo, tema, notificacoes`;
    const result = await query(sql, values);

    // RN09: Trilha de auditoria
    await logAudit({
      usuarioId: req.user.id,
      operacao: "ATUALIZACAO_PREFERENCIAS",
      detalhes: { tema, notificacoes },
      ip: req.ip,
    });

    return res.json({
      message: "Preferências atualizadas com sucesso.",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao atualizar preferências:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao atualizar preferências." });
  }
});

// PATCH /api/usuarios/perfil
router.patch("/perfil", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    for (const field of [
      "idade",
      "meta_treinos_semana",
      "meta_agua_ml",
      "meta_calorias_kcal",
      "meta_proteinas_g",
      "meta_carboidratos_g",
      "meta_gorduras_g",
    ]) {
      const value = req.body[field];
      if (
        value !== undefined &&
        (value === null ||
          value === "" ||
          !Number.isFinite(Number(value)) ||
          Number(value) <= 0 ||
          (field === "idade" && Number(value) > 120) ||
          (field === "meta_treinos_semana" && Number(value) > 7))
      ) {
        return res.status(400).json({ error: `Valor inválido para ${field}.` });
      }
    }

    if (req.user.tipo === "student") {
      const {
        data_nascimento,
        sexo_metabolico,
        fator_atividade,
        peso_kg,
        altura_cm,
        idade,
        meta_treinos_semana,
        meta_agua_ml,
        meta_calorias_kcal,
        meta_proteinas_g,
        meta_carboidratos_g,
        meta_gorduras_g,
        objetivo,
      } = req.body;

      // RN17: Validação de Peso (20 a 400 kg)
      if (
        peso_kg !== undefined &&
        peso_kg !== null &&
        !validateWeight(peso_kg)
      ) {
        return res.status(400).json({
          error:
            "Peso fora dos limites permitidos: deve estar entre 20 e 400 kg (RN17).",
        });
      }

      // RN17: Validação e normalização de Altura (100 a 250 cm / 1.0 a 2.5 m)
      let normalizedHeight = undefined;
      if (altura_cm !== undefined && altura_cm !== null) {
        const heightCheck = normalizeAndValidateHeight(altura_cm);
        if (!heightCheck.valid) {
          return res.status(400).json({
            error:
              "Altura fora dos limites permitidos: deve estar entre 1 e 2,5 m (ou 100 e 250 cm) (RN17).",
          });
        }
        normalizedHeight = heightCheck.heightCm;
      }

      // Consulta perfil atual para combinar dados para o cálculo metabólico RN06
      const currentProfileRes = await query(
        `SELECT data_nascimento, sexo_metabolico, fator_atividade, peso_kg, altura_cm, idade, objetivo, meta_calorias_kcal, meta_proteinas_g, meta_carboidratos_g, meta_gorduras_g, meta_agua_ml
         FROM perfis_alunos WHERE usuario_id = $1`,
        [userId]
      );
      const curr = currentProfileRes.rows[0] || {};
      const birth =
        data_nascimento !== undefined ? data_nascimento : curr.data_nascimento;
      const sex =
        sexo_metabolico !== undefined ? sexo_metabolico : curr.sexo_metabolico;
      const factor = Number(fator_atividade ?? curr.fator_atividade ?? 1.55);
      if (
        (data_nascimento !== undefined && ageFromBirth(birth) === null) ||
        (sexo_metabolico !== undefined &&
          !["masculino", "feminino"].includes(sex)) ||
        ![1.2, 1.375, 1.45, 1.55, 1.725, 1.9].includes(factor) ||
        peso_kg === null ||
        altura_cm === null
      )
        return res
          .status(400)
          .json({ error: "Dados físicos ou metabólicos inválidos." });
      const finalPeso = peso_kg !== undefined ? Number(peso_kg) : curr.peso_kg;
      const finalAltura =
        normalizedHeight !== undefined ? normalizedHeight : curr.altura_cm;
      const finalIdade = birth
        ? ageFromBirth(birth)
        : idade !== undefined
          ? Number(idade)
          : curr.idade;
      const finalObj = objetivo !== undefined ? objetivo : curr.objetivo;

      let finalCalorias =
        meta_calorias_kcal !== undefined
          ? Number(meta_calorias_kcal)
          : curr.meta_calorias_kcal;
      let finalProteinas =
        meta_proteinas_g !== undefined
          ? Number(meta_proteinas_g)
          : curr.meta_proteinas_g;
      let finalCarboidratos =
        meta_carboidratos_g !== undefined
          ? Number(meta_carboidratos_g)
          : curr.meta_carboidratos_g;
      let finalGorduras =
        meta_gorduras_g !== undefined
          ? Number(meta_gorduras_g)
          : curr.meta_gorduras_g;
      let finalAgua = meta_agua_ml !== undefined ? Number(meta_agua_ml) : null;

      // RN06: Se biometria ou objetivo foi alterado e calorias não foram explicitadas, recalcula automaticamente
      if (
        peso_kg !== undefined ||
        altura_cm !== undefined ||
        idade !== undefined ||
        objetivo !== undefined ||
        data_nascimento !== undefined ||
        sexo_metabolico !== undefined ||
        fator_atividade !== undefined
      ) {
        const calculadas = calcularMetasNutricionais({
          data_nascimento: birth,
          sexo_metabolico: sex,
          fator_atividade: factor,
          peso_kg: finalPeso,
          altura_cm: finalAltura,
          idade: finalIdade,
          objetivo: finalObj,
        });
        finalCalorias = calculadas.meta_calorias_kcal;
        finalProteinas = calculadas.meta_proteinas_g;
        finalCarboidratos = calculadas.meta_carboidratos_g;
        finalGorduras = calculadas.meta_gorduras_g;
        if (
          meta_agua_ml === undefined ||
          (peso_kg !== undefined && Number(finalPeso) !== Number(curr.peso_kg))
        ) {
          finalAgua = calculadas.meta_agua_ml;
        }
      }

      const result = await query(
        `UPDATE perfis_alunos
         SET peso_kg = COALESCE($1, peso_kg),
             altura_cm = COALESCE($2, altura_cm),
             idade = COALESCE($3, idade),
             meta_treinos_semana = COALESCE($4, meta_treinos_semana),
             meta_agua_ml = COALESCE($5, meta_agua_ml),
             meta_calorias_kcal = $6,
             meta_proteinas_g = $7,
             meta_carboidratos_g = $8,
             meta_gorduras_g = $9,
             objetivo = COALESCE($10, objetivo),
             atualizado_em = CURRENT_TIMESTAMP
         WHERE usuario_id = $11
         RETURNING *`,
        [
          finalPeso != null ? Number(finalPeso) : null,
          finalAltura != null ? Number(finalAltura) : null,
          finalIdade != null ? Number(finalIdade) : null,
          meta_treinos_semana !== undefined
            ? Number(meta_treinos_semana)
            : null,
          finalAgua !== null ? Number(finalAgua) : null,
          finalCalorias !== null ? Number(finalCalorias) : null,
          finalProteinas !== null ? Number(finalProteinas) : null,
          finalCarboidratos !== null ? Number(finalCarboidratos) : null,
          finalGorduras !== null ? Number(finalGorduras) : null,
          finalObj || null,
          userId,
        ]
      );

      await query(
        "UPDATE perfis_alunos SET data_nascimento=$1,sexo_metabolico=$2,fator_atividade=$3 WHERE usuario_id=$4",
        [birth || null, sex || null, factor, userId]
      );
      Object.assign(result.rows[0], {
        data_nascimento: birth,
        sexo_metabolico: sex,
        fator_atividade: factor,
        idade: finalIdade,
      });
      await query(
        `INSERT INTO historico_biometria (aluno_id, peso_kg, altura_cm, objetivo) VALUES ($1, $2, $3, $4)`,
        [
          userId,
          result.rows[0].peso_kg,
          result.rows[0].altura_cm,
          result.rows[0].objetivo,
        ]
      );
      // RN09: Trilha de auditoria
      await logAudit({
        usuarioId: userId,
        operacao: "ATUALIZACAO_PERFIL_ALUNO",
        detalhes: {
          peso_kg: finalPeso,
          altura_cm: finalAltura,
          objetivo: finalObj,
        },
        ip: req.ip,
      });

      return res.json({
        message: "Perfil de aluno atualizado com sucesso.",
        profile: result.rows[0],
        disclaimer: DISCLAIMER_MEDICO,
      });
    }

    if (req.user.tipo === "personal") {
      const { area_formacao, atuacao_principal } = req.body;

      const result = await query(
        `UPDATE perfis_personais
         SET area_formacao = COALESCE($1, area_formacao),
             atuacao_principal = COALESCE($2, atuacao_principal),
             atualizado_em = CURRENT_TIMESTAMP
         WHERE usuario_id = $3
         RETURNING *`,
        [
          area_formacao ? String(area_formacao).trim() : null,
          atuacao_principal ? String(atuacao_principal).trim() : null,
          userId,
        ]
      );

      // RN09: Trilha de auditoria
      await logAudit({
        usuarioId: userId,
        operacao: "ATUALIZACAO_PERFIL_PERSONAL",
        detalhes: { area_formacao, atuacao_principal },
        ip: req.ip,
      });

      return res.json({
        message: "Perfil profissional atualizado.",
        profile: result.rows[0],
      });
    }

    return res
      .status(400)
      .json({ error: "Perfil não editável para este tipo de conta." });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    return res.status(500).json({ error: "Erro interno ao atualizar perfil." });
  }
});

export default router;
