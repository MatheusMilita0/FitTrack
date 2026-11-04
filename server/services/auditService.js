import { query } from "../db.js";

/**
 * Registra uma operação sensível na trilha de auditoria (RN09).
 *
 * @param {Object} params
 * @param {number|null} params.usuarioId - ID do usuário responsável pela ação
 * @param {string} params.operacao - Nome da ação (ex: 'STATUS_USUARIO_ALTERADO', 'CREF_VALIDADO', etc.)
 * @param {Object} params.detalhes - Metadados adicionais em formato JSON
 * @param {string|null} params.ip - IP do cliente ou identificador de origem
 */
export async function logAudit({
  usuarioId = null,
  operacao,
  detalhes = {},
  ip = null,
}) {
  await query(
    `INSERT INTO auditoria_operacoes (usuario_id, operacao, detalhes, ip)
       VALUES ($1, $2, $3, $4)`,
    [usuarioId, operacao, JSON.stringify(detalhes), ip]
  );
}

export default {
  logAudit,
};
