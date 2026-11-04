export function csrfProtection(req, res, next) {
  // Métodos seguros idempotentes não necessitam validação de CSRF
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const origin = req.headers["origin"] || req.headers["referer"];
  const host = req.headers["host"];

  // Quando o cabeçalho Origin ou Referer é enviado pelo navegador, valida contra o Host atual
  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return res.status(403).json({
          error: "Requisição rejeitada por proteção de Origem/CSRF.",
        });
      }
    } catch {
      return res.status(403).json({
        error: "Cabeçalho de origem malformado.",
      });
    }
  }

  next();
}

export default csrfProtection;
