import { profileView } from "../services/profileView.js";
import { ageFromBirth } from "../utils/day.js";
import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { query, getClient } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  validateCpf,
  validatePassword,
  validateName,
  validateEmail,
  validateWeight,
  normalizeAndValidateHeight,
  validateLoginIdentifier,
} from "../utils/validators.js";
import { calcularMetasNutricionais } from "../services/calculoMetabolico.js";
import { isValidCrefFormat } from "../services/crefService.js";
import { sendPasswordResetEmail } from "../services/emailService.js";
import { logAudit } from "../services/auditService.js";

const router = Router();

function setSessionCookie(req, res, token) {
  const isHttps =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    process.env.NODE_ENV === "production";

  res.cookie("fittrack_session", token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  });
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const {
      nome,
      cpf,
      email,
      senha,
      tipo,
      cref,
      area_formacao,
      atuacao_principal,
      peso_kg,
      altura_cm,
      idade,
      data_nascimento,
      sexo_metabolico,
      fator_atividade,
      objetivo,
    } = req.body;

    if (!nome || !cpf || !email || !senha || !tipo) {
      return res.status(400).json({
        error: "Campos obrigatórios ausentes: nome, cpf, email, senha e tipo.",
      });
    }

    if (
      typeof nome !== "string" ||
      typeof senha !== "string" ||
      (idade != null &&
        (!Number.isInteger(Number(idade)) ||
          Number(idade) < 1 ||
          Number(idade) > 120))
    )
      return res.status(400).json({ error: "Dados de cadastro inválidos." });
    if (tipo === "admin") {
      return res.status(403).json({
        error:
          "Cadastro de administrador não permitido via signup. Utilize o bootstrap CLI server-side.",
      });
    }

    if (!["student", "personal"].includes(tipo)) {
      return res.status(400).json({
        error: "Tipo de conta inválido. Escolha 'student' ou 'personal'.",
      });
    }

    // RN02: Senha com mínimo de 6 caracteres, maiúscula e minúscula
    if (!validatePassword(senha)) {
      return res.status(400).json({
        error:
          "A senha deve conter no mínimo 6 caracteres, com pelo menos uma letra maiúscula e uma minúscula (RN02).",
      });
    }

    // RN11: Nome válido
    const isValidName = validateName(nome);

    if (!isValidName) {
      return res.status(400).json({
        error:
          "O nome deve conter apenas letras e espaços, com tamanho entre 2 e 100 caracteres (RN11).",
      });
    }

    // RN12: E-mail em formato válido
    const cleanEmail = String(email).trim().toLowerCase();
    if (!validateEmail(cleanEmail)) {
      return res.status(400).json({
        error:
          "E-mail em formato inválido. Não utilize pontos no início ou final (RN12).",
      });
    }

    // RN10: CPF com validação algorítmica (Módulo 11)
    const cleanCpf = String(cpf).replace(/\D/g, "");
    const isValidCpf = validateCpf(cleanCpf);

    if (!isValidCpf) {
      return res.status(400).json({
        error:
          "CPF inválido. Forneça um CPF válido com 11 dígitos numéricos (RN10).",
      });
    }

    const idadeReal = data_nascimento ? ageFromBirth(data_nascimento) : null;
    if (
      tipo === "student" &&
      (!peso_kg ||
        !altura_cm ||
        idadeReal === null ||
        !["masculino", "feminino"].includes(sexo_metabolico) ||
        (fator_atividade !== undefined &&
          ![1.2, 1.375, 1.45, 1.55, 1.725, 1.9].includes(
            Number(fator_atividade)
          )))
    ) {
      return res
        .status(400)
        .json({
          error:
            "Informe peso, altura, nascimento válido e parâmetro da equação metabólica. Confira também o nível de atividade.",
        });
    }
    // RN17: Validação de Peso e Altura para Aluno
    let normalizedHeight = null;
    if (tipo === "student") {
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

      const heightCheck = normalizeAndValidateHeight(altura_cm);
      if (altura_cm !== undefined && altura_cm !== null && !heightCheck.valid) {
        return res.status(400).json({
          error:
            "Altura fora dos limites permitidos: deve estar entre 1 e 2,5 m (ou 100 e 250 cm) (RN17).",
        });
      }
      normalizedHeight = heightCheck.heightCm;
    }

    if (
      tipo === "personal" &&
      (!cref || !area_formacao || !atuacao_principal)
    ) {
      return res.status(400).json({
        error:
          "Para cadastro de personal trainer, CREF, área de formação e atuação principal são obrigatórios.",
      });
    }

    const cleanCref = cref ? String(cref).trim().toUpperCase() : null;

    // RN05: Validação do CREF via serviço externo para Personal Trainer
    let statusCrefFinal = "Pendente";
    let statusUsuarioFinal = "Ativo";

    if (tipo === "personal") {
      if (!isValidCrefFormat(cleanCref))
        return res
          .status(400)
          .json({ error: "Formato de CREF inválido. Exemplo: 123456-G/SP." });

      // Conforme RF02 e RN05: Personal Trainer é registrado como aguardando homologação
      statusCrefFinal = "Pendente";
      statusUsuarioFinal = "Pendente";
    }

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const client = await getClient();
    let novoUsuario = null;
    let perfilData = null;

    try {
      await client.query("BEGIN");

      // Validação de unicidade de email e CPF
      const existing = await client.query(
        "SELECT id, email, cpf FROM usuarios WHERE LOWER(email) = $1 OR cpf = $2",
        [cleanEmail, cleanCpf]
      );

      if (existing.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Já existe uma conta com este e-mail ou CPF.",
        });
      }

      // Validação prévia de unicidade de CREF para personal
      if (tipo === "personal" && cleanCref) {
        const existingCref = await client.query(
          "SELECT id FROM perfis_personais WHERE cref = $1",
          [cleanCref]
        );
        if (existingCref.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "Já existe uma conta com este CREF.",
          });
        }
      }

      const usuarioResult = await client.query(
        `INSERT INTO usuarios (nome, cpf, email, senha_hash, tipo, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nome, cpf, email, tipo, status, tema, notificacoes, criado_em`,
        [nome.trim(), cleanCpf, cleanEmail, senhaHash, tipo, statusUsuarioFinal]
      );

      novoUsuario = usuarioResult.rows[0];
      const usuarioId = Number(novoUsuario.id);

      if (tipo === "student") {
        // RN06: Cálculo metabólico automático inicial
        const metasIniciais = calcularMetasNutricionais({
          peso_kg: Number(peso_kg),
          altura_cm: normalizedHeight,
          idade: idadeReal,
          data_nascimento,
          sexo_metabolico,
          fator_atividade,
          objetivo: objetivo || "Hipertrofia",
        });

        const perfilResult = await client.query(
          `INSERT INTO perfis_alunos (
             usuario_id, peso_kg, altura_cm, idade, objetivo,
             meta_calorias_kcal, meta_proteinas_g, meta_carboidratos_g, meta_gorduras_g, meta_agua_ml
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            usuarioId,
            peso_kg ? Number(peso_kg) : null,
            normalizedHeight,
            idadeReal,
            objetivo || "Hipertrofia",
            metasIniciais.meta_calorias_kcal,
            metasIniciais.meta_proteinas_g,
            metasIniciais.meta_carboidratos_g,
            metasIniciais.meta_gorduras_g,
            metasIniciais.meta_agua_ml,
          ]
        );
        await client.query(
          "UPDATE perfis_alunos SET data_nascimento=$1, sexo_metabolico=$2, fator_atividade=$3 WHERE usuario_id=$4",
          [
            data_nascimento,
            sexo_metabolico,
            Number(fator_atividade || 1.55),
            usuarioId,
          ]
        );
        perfilData = {
          ...perfilResult.rows[0],
          data_nascimento,
          sexo_metabolico,
          fator_atividade: Number(fator_atividade || 1.55),
        };
        await client.query(
          "INSERT INTO historico_biometria(aluno_id,peso_kg,altura_cm,objetivo) VALUES($1,$2,$3,$4)",
          [usuarioId, Number(peso_kg), normalizedHeight, perfilData.objetivo]
        );
      } else if (tipo === "personal") {
        const perfilResult = await client.query(
          `INSERT INTO perfis_personais (usuario_id, cref, area_formacao, atuacao_principal, status_cref)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            usuarioId,
            cleanCref,
            area_formacao.trim(),
            atuacao_principal.trim(),
            statusCrefFinal,
          ]
        );
        await client.query(
          "INSERT INTO validacoes_profissionais(usuario_id) VALUES($1)",
          [usuarioId]
        );
        perfilData = perfilResult.rows[0];
      }

      // Cria sessão inicial em banco dentro da transação
      await client.query(
        `INSERT INTO sessoes (token, usuario_id, expira_em)
         VALUES ($1, $2, $3)`,
        [sessionToken, usuarioId, expiraEm]
      );

      await client.query("COMMIT");
    } catch (txError) {
      await client.query("ROLLBACK").catch(() => {});
      const errorMsg = String(txError.message || "");
      const errorDetail = String(txError.detail || "");
      const isUniqueViolation =
        txError.code === "23505" ||
        /duplicate key|unique constraint/i.test(errorMsg) ||
        /already exists/i.test(errorDetail);

      if (isUniqueViolation) {
        if (
          /cref/i.test(errorMsg) ||
          /cref/i.test(errorDetail) ||
          (txError.constraint && /cref/i.test(txError.constraint))
        ) {
          return res.status(409).json({
            error: "Já existe uma conta com este CREF.",
          });
        }
        if (
          /cpf/i.test(errorMsg) ||
          /cpf/i.test(errorDetail) ||
          (txError.constraint && /cpf/i.test(txError.constraint))
        ) {
          return res.status(409).json({
            error: "Já existe uma conta com este CPF.",
          });
        }
        if (
          /email/i.test(errorMsg) ||
          /email/i.test(errorDetail) ||
          (txError.constraint && /email/i.test(txError.constraint))
        ) {
          return res.status(409).json({
            error: "Já existe uma conta com este e-mail.",
          });
        }
        return res.status(409).json({
          error: "Já existe uma conta com este e-mail, CPF ou CREF.",
        });
      }

      console.error("Erro na transação de registro:", txError);
      return res
        .status(500)
        .json({ error: "Erro interno no processamento do cadastro." });
    } finally {
      client.release();
    }

    // RN09: Trilha de auditoria no cadastro
    await logAudit({
      usuarioId: Number(novoUsuario.id),
      operacao: "CADASTRO_USUARIO",
      detalhes: { tipo: novoUsuario.tipo, email: novoUsuario.email },
      ip: req.ip,
    });

    // Sessão cookie apenas após commit bem-sucedido
    setSessionCookie(req, res, sessionToken);

    return res.status(201).json({
      message: "Cadastro realizado com sucesso.",
      user: {
        id: Number(novoUsuario.id),
        nome: novoUsuario.nome,
        cpf: novoUsuario.cpf,
        email: novoUsuario.email,
        tipo: novoUsuario.tipo,
        status: novoUsuario.status,
        tema: novoUsuario.tema,
        notificacoes: novoUsuario.notificacoes,
      },
      profile: perfilData,
    });
  } catch (error) {
    console.error("Erro no registro:", error);
    return res
      .status(500)
      .json({ error: "Erro interno no processamento do cadastro." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { identifier, email, cpf, senha } = req.body;
    const supplied = String(identifier || email || cpf || "").trim();
    const loginIdentifier = supplied.includes("@")
      ? supplied
      : supplied.replace(/\D/g, "");

    if (!loginIdentifier || !senha) {
      return res.status(400).json({
        error: "Informe o login (e-mail ou CPF) e a senha.",
      });
    }

    // RN01: Validação do formato sintático da credencial
    const isValidId = validateLoginIdentifier(loginIdentifier);

    if (!isValidId) {
      return res.status(400).json({
        error:
          "Formato de credencial inválido. Informe um e-mail válido ou CPF válido de 11 dígitos (RN01).",
      });
    }

    const result = await query(
      `SELECT id, nome, cpf, email, senha_hash, tipo, status, tema, notificacoes
       FROM usuarios
       WHERE LOWER(email) = LOWER($1) OR REPLACE(REPLACE(cpf, '.', ''), '-', '') = $1`,
      [loginIdentifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Credenciais inválidas.",
      });
    }

    const usuario = result.rows[0];

    const match = await bcrypt.compare(senha, usuario.senha_hash);
    if (!match) {
      return res.status(401).json({
        error: "Credenciais inválidas.",
      });
    }

    if (usuario.status === "Bloqueado") {
      return res.status(403).json({
        error: "Conta de usuário bloqueada pelo administrador.",
      });
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO sessoes (token, usuario_id, expira_em)
       VALUES ($1, $2, $3)`,
      [sessionToken, Number(usuario.id), expiraEm]
    );

    // RN09: Trilha de auditoria no login
    await logAudit({
      usuarioId: Number(usuario.id),
      operacao: "LOGIN_EFETUADO",
      detalhes: { tipo: usuario.tipo },
      ip: req.ip,
    });

    setSessionCookie(req, res, sessionToken);

    let perfil = null;
    if (usuario.tipo === "student") {
      const p = await query(
        "SELECT * FROM perfis_alunos WHERE usuario_id = $1",
        [usuario.id]
      );
      perfil = p.rows[0] || null;
    } else if (usuario.tipo === "personal") {
      const p = await query(
        "SELECT * FROM perfis_personais WHERE usuario_id = $1",
        [usuario.id]
      );
      perfil = p.rows[0] || null;
    }

    return res.json({
      message: "Autenticação realizada com sucesso.",
      user: {
        id: Number(usuario.id),
        nome: usuario.nome,
        cpf: usuario.cpf,
        email: usuario.email,
        tipo: usuario.tipo,
        status: usuario.status,
        tema: usuario.tema,
        notificacoes: usuario.notificacoes,
      },
      profile: profileView(perfil),
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res
      .status(500)
      .json({ error: "Erro interno no processamento do login." });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  try {
    const token =
      (req.cookies && req.cookies.fittrack_session) || req.sessionToken;

    if (token) {
      await query("DELETE FROM sessoes WHERE token = $1", [token]);
    }

    res.clearCookie("fittrack_session", { path: "/" });
    return res.json({ message: "Logout efetuado com sucesso." });
  } catch (error) {
    console.error("Erro no logout:", error);
    return res
      .status(500)
      .json({ error: "Erro interno no processamento do logout." });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const usuarioId = req.user.id;
    let perfil = null;

    if (req.user.tipo === "student") {
      const p = await query(
        "SELECT * FROM perfis_alunos WHERE usuario_id = $1",
        [usuarioId]
      );
      perfil = p.rows[0] || null;
    } else if (req.user.tipo === "personal") {
      const p = await query(
        "SELECT * FROM perfis_personais WHERE usuario_id = $1",
        [usuarioId]
      );
      perfil = p.rows[0] || null;
    }

    return res.json({
      user: req.user,
      profile: profileView(perfil),
    });
  } catch (error) {
    console.error("Erro no /api/auth/me:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao obter usuário autenticado." });
  }
});

// POST /api/auth/recuperar-senha (RN13, UC03)
router.post("/recuperar-senha", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validateEmail(String(email).trim())) {
      return res.status(400).json({
        error: "Informe um endereço de e-mail válido.",
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const userRes = await query(
      "SELECT id, nome, email FROM usuarios WHERE LOWER(email) = $1",
      [cleanEmail]
    );

    // Resposta padrão idêntica para prevenir enumeração de contas
    const genericResponse = {
      message:
        "Se o e-mail informado estiver cadastrado, as instruções para redefinição de senha foram enviadas.",
    };

    if (userRes.rows.length === 0) {
      return res.json(
        process.env.NODE_ENV !== "production" && !process.env.EMAIL_SERVICE_URL
          ? {
              mode: "mock",
              message:
                "Instruções em demonstração: nenhuma mensagem foi enviada. Configure o provedor para receber o link.",
            }
          : genericResponse
      );
    }

    const user = userRes.rows[0];
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiraEm = new Date(Date.now() + 60 * 60 * 1000); // 1 hora de validade

    // Invalida tokens anteriores não usados
    await query(
      "UPDATE tokens_recuperacao_senha SET usado = TRUE WHERE usuario_id = $1 AND usado = FALSE",
      [user.id]
    );

    // Insere novo token seguro
    await query(
      `INSERT INTO tokens_recuperacao_senha (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiraEm]
    );

    // Dispara e-mail de recuperação
    const delivery = await sendPasswordResetEmail({
      to: user.email,
      token: rawToken,
    });

    // Trilha de auditoria
    await logAudit({
      usuarioId: Number(user.id),
      operacao: "SOLICITACAO_RECUPERACAO_SENHA",
      detalhes: { email: user.email },
      ip: req.ip,
    });

    return res.json({
      ...genericResponse,
      ...(delivery.mode === "mock"
        ? {
            mode: "mock",
            message:
              "Instruções em demonstração: nenhuma mensagem foi enviada. Configure o provedor para receber o link.",
          }
        : {}),
    });
  } catch (error) {
    console.error("Erro na solicitação de recuperação de senha:", error);
    return res.status(500).json({
      error: "Erro interno ao processar solicitação de recuperação de senha.",
    });
  }
});

// POST /api/auth/redefinir-senha (RN13, RN02, UC03)
router.post("/redefinir-senha", async (req, res) => {
  try {
    const { token, novaSenha } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({
        error: "Token de recuperação obrigatório.",
      });
    }

    if (!novaSenha || !validatePassword(novaSenha)) {
      return res.status(400).json({
        error:
          "A nova senha deve conter no mínimo 6 caracteres, com pelo menos uma letra maiúscula e uma minúscula (RN02).",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(String(token).trim())
      .digest("hex");

    const tokenRes = await query(
      `SELECT t.id, t.usuario_id, t.expira_em, t.usado, u.email
       FROM tokens_recuperacao_senha t
       JOIN usuarios u ON u.id = t.usuario_id
       WHERE t.token_hash = $1`,
      [tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({
        error: "Token de recuperação inválido ou inexistente.",
      });
    }

    const tokenRecord = tokenRes.rows[0];

    if (tokenRecord.usado) {
      return res.status(400).json({
        error: "Este token de recuperação já foi utilizado.",
      });
    }

    if (new Date(tokenRecord.expira_em) < new Date()) {
      return res.status(400).json({
        error: "Este token de recuperação expirou. Solicite um novo link.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(novaSenha, salt);

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const locked = await client.query(
        "SELECT usado, expira_em FROM tokens_recuperacao_senha WHERE id=$1 FOR UPDATE",
        [tokenRecord.id]
      );
      if (
        !locked.rows[0] ||
        locked.rows[0].usado ||
        new Date(locked.rows[0].expira_em) <= new Date()
      ) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Token expirado ou já utilizado." });
      }
      // Atualiza senha do usuário
      await client.query(
        "UPDATE usuarios SET senha_hash = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
        [senhaHash, tokenRecord.usuario_id]
      );

      // Marca token como consumido (uso único)
      await client.query(
        "UPDATE tokens_recuperacao_senha SET usado = TRUE WHERE id = $1",
        [tokenRecord.id]
      );

      // Invalida todas as sessões ativas do usuário por segurança
      await client.query("DELETE FROM sessoes WHERE usuario_id = $1", [
        tokenRecord.usuario_id,
      ]);

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    // Registra na auditoria
    await logAudit({
      usuarioId: Number(tokenRecord.usuario_id),
      operacao: "REDEFINICAO_SENHA_CONCLUIDA",
      detalhes: { email: tokenRecord.email },
      ip: req.ip,
    });

    return res.json({
      message:
        "Senha redefinida com sucesso. Faça login com suas novas credenciais.",
    });
  } catch (error) {
    console.error("Erro na redefinição de senha:", error);
    return res.status(500).json({
      error: "Erro interno ao processar redefinição de senha.",
    });
  }
});

export default router;
