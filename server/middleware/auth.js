import { query } from "../db.js";

export async function authenticate(req, res, next) {
  try {
    let token = null;

    if (req.cookies && req.cookies.fittrack_session) {
      token = req.cookies.fittrack_session;
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token) {
      req.user = null;
      req.sessionToken = null;
      return next();
    }

    const result = await query(
      `SELECT s.token, s.expira_em, 
              u.id, u.nome, u.cpf, u.email, u.tipo, u.status, u.tema, u.notificacoes
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      req.user = null;
      req.sessionToken = null;
      return next();
    }

    const session = result.rows[0];
    const now = new Date();
    const expiraEm = new Date(session.expira_em);

    if (expiraEm <= now) {
      // Sessão expirada: remove do banco
      await query("DELETE FROM sessoes WHERE token = $1", [token]).catch(
        () => {}
      );
      res.clearCookie("fittrack_session", { path: "/" });
      req.user = null;
      req.sessionToken = null;
      return next();
    }

    req.user = {
      id: Number(session.id),
      nome: session.nome,
      cpf: session.cpf,
      email: session.email,
      tipo: session.tipo,
      status: session.status,
      tema: session.tema,
      notificacoes: session.notificacoes,
    };
    req.sessionToken = token;

    next();
  } catch (error) {
    console.error("Erro na autenticação de sessão:", error);
    req.user = null;
    req.sessionToken = null;
    next();
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Autenticação requerida para acessar este recurso.",
    });
  }

  if (req.user.status === "Bloqueado") {
    return res.status(403).json({
      error: "Conta de usuário suspensa ou bloqueada pelo administrador.",
    });
  }

  next();
}
