import { query, getClient } from "../db.js";
import { validarCrefExterno } from "./crefService.js";

export async function processCrefQueue(now = new Date()) {
  if (!process.env.CREF_SERVICE_URL || process.env.CREF_MODE === "mock")
    return { skipped: true };
  const jobs = await query(
    "SELECT usuario_id FROM validacoes_profissionais WHERE proxima_tentativa <= $1 AND (estado='pendente' OR (estado='processando' AND bloqueado_ate < $1)) ORDER BY proxima_tentativa LIMIT 10",
    [now]
  );
  let processed = 0;
  for (const job of jobs.rows) {
    const lease = new Date(now.getTime() + 60000);
    const claim = await query(
      "UPDATE validacoes_profissionais SET estado='processando',bloqueado_ate=$1 WHERE usuario_id=$2 AND proxima_tentativa <= $3 AND (estado='pendente' OR (estado='processando' AND bloqueado_ate < $3)) RETURNING *",
      [lease, job.usuario_id, now]
    );
    if (!claim.rows.length) continue;
    const person = (
      await query(
        "SELECT u.nome,u.status,p.cref,p.area_formacao,p.status_cref FROM usuarios u JOIN perfis_personais p ON p.usuario_id=u.id WHERE u.id=$1",
        [job.usuario_id]
      )
    ).rows[0];
    if (
      !person ||
      person.status === "Bloqueado" ||
      person.status_cref !== "Pendente"
    ) {
      await query(
        "UPDATE validacoes_profissionais SET estado='concluido' WHERE usuario_id=$1",
        [job.usuario_id]
      );
      continue;
    }
    let result;
    try {
      result = await validarCrefExterno(person);
    } catch {
      result = {
        status: "Indisponivel",
        mock: false,
        detalhe: "Falha temporária na consulta.",
      };
    }
    const attempts = Number(claim.rows[0].tentativas) + 1;
    if (result.mock || !["Validado", "Rejeitado"].includes(result.status)) {
      await query(
        "UPDATE validacoes_profissionais SET estado='pendente',tentativas=$1,proxima_tentativa=$2,ultimo_erro=$3,bloqueado_ate=NULL WHERE usuario_id=$4",
        [
          attempts,
          new Date(
            now.getTime() +
              Math.min(86400000, 60000 * 2 ** Math.min(attempts, 10))
          ),
          result.detalhe || "Consulta pendente.",
          job.usuario_id,
        ]
      );
      continue;
    }
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const current = (
        await client.query(
          "SELECT u.status,p.status_cref FROM usuarios u JOIN perfis_personais p ON p.usuario_id=u.id WHERE u.id=$1 FOR UPDATE",
          [job.usuario_id]
        )
      ).rows[0];
      if (
        current?.status === "Pendente" &&
        current.status_cref === "Pendente"
      ) {
        await client.query(
          "UPDATE perfis_personais SET status_cref=$1,atualizado_em=CURRENT_TIMESTAMP WHERE usuario_id=$2",
          [result.status, job.usuario_id]
        );
        await client.query(
          "UPDATE usuarios SET status=$1,atualizado_em=CURRENT_TIMESTAMP WHERE id=$2",
          [result.status === "Validado" ? "Ativo" : "Pendente", job.usuario_id]
        );
        await client.query(
          "INSERT INTO auditoria_operacoes(usuario_id,operacao,detalhes) VALUES($1,$2,$3)",
          [
            job.usuario_id,
            "VALIDACAO_PROFISSIONAL_AGENDADA",
            JSON.stringify({ status: result.status, tentativa: attempts }),
          ]
        );
      }
      await client.query(
        "UPDATE validacoes_profissionais SET estado='concluido',tentativas=$1,ultimo_erro=$2,bloqueado_ate=NULL WHERE usuario_id=$3",
        [attempts, result.detalhe, job.usuario_id]
      );
      await client.query("COMMIT");
      processed++;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return { processed };
}
export function startCrefQueue() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processCrefQueue();
    } catch (e) {
      console.error("Falha na fila de validação profissional:", e.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 30000);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
