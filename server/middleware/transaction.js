import { getPool } from "../db.js";
import { transactionContext } from "../transactionContext.js";

// A mutation and its audit share one connection until the response is ready.
// Existing service-level BEGIN/COMMIT calls participate in this outer transaction.
export function transactionalMutation(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  let connection,
    opening,
    failed = false,
    changed = false,
    audited = false,
    finished = false;
  const acquire = () =>
    (opening ||= (async () => {
      const pool = getPool();
      if (!pool) throw new Error("Banco não configurado.");
      connection = await pool.connect();
      await connection.query("BEGIN");
      return connection;
    })());
  const context = {
    async query(sql, params = []) {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql))
        return { rows: [], rowCount: 0 };
      try {
        const result = await (await acquire()).query(sql, params);
        if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
          if (/^\s*INSERT INTO auditoria_operacoes\b/i.test(sql))
            audited = true;
          else changed = true;
        }
        return result;
      } catch (error) {
        failed = true;
        throw error;
      }
    },
    async client() {
      await acquire();
      return { query: context.query, release() {} };
    },
  };
  const finish = async (commit, body) => {
    if (finished) return;
    finished = true;
    if (!opening) return;
    try {
      await opening;
      if (commit && failed)
        throw new Error("Transação não pôde ser concluída.");
      if (commit && changed && !audited) {
        await connection.query(
          "INSERT INTO auditoria_operacoes (usuario_id,operacao,detalhes,ip) VALUES ($1,$2,$3,$4)",
          [
            req.user?.id || body?.user?.id || null,
            `${req.method} ${req.baseUrl}${req.path}`.slice(0, 80),
            JSON.stringify({ status: res.statusCode }),
            req.ip,
          ]
        );
      }
      await connection.query(commit ? "COMMIT" : "ROLLBACK");
    } catch (error) {
      if (connection) await connection.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      connection?.release();
    }
  };
  const json = res.json.bind(res);
  let responding = false;
  res.json = body => {
    if (responding) return res;
    responding = true;
    finish(res.statusCode < 400, body)
      .then(() => json(body))
      .catch(error => {
        console.error(
          "Falha ao confirmar alteração e auditoria:",
          error.message
        );
        res.removeHeader("Set-Cookie");
        res.status(500);
        json({
          error:
            "Não foi possível confirmar a alteração e sua auditoria. Tente novamente.",
        });
      });
    return res;
  };
  res.on("close", () => {
    if (!finished) finish(false).catch(() => {});
  });
  transactionContext.run(context, next);
}
