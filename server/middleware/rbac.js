import { query } from "../db.js";
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Autenticação requerida.",
      });
    }

    if (!allowedRoles.includes(req.user.tipo)) {
      return res.status(403).json({
        error: `Acesso negado: perfil '${req.user.tipo}' não tem permissão para esta rota.`,
      });
    }

    if (req.user.status !== "Ativo") {
      return res.status(403).json({
        error: "Acesso negado: cadastro pendente de aprovação ou inativo.",
      });
    }

    if (req.user.tipo === "personal") {
      try {
        const profile = await query(
          "SELECT status_cref FROM perfis_personais WHERE usuario_id=$1",
          [req.user.id]
        );
        if (profile.rows[0]?.status_cref !== "Validado")
          return res.status(403).json({ error: "CREF pendente de validação." });
      } catch {
        return res
          .status(503)
          .json({ error: "Não foi possível verificar o CREF." });
      }
    }
    next();
  };
}

export default requireRole;
