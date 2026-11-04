/**
 * Serviço de Integração Externa para Validação Profissional de CREF (FitTrack)
 * Atende RN05 e UC04 com timeouts, retry com limite e adaptador mock transparente.
 */

export function isValidCrefFormat(cref) {
  if (!cref || typeof cref !== "string") return false;
  const clean = cref.trim().toUpperCase();
  // Formato padrão nacional do CREF: 123456-G/SP ou similar
  const crefRegex = /^\d{4,7}-[A-Z]\/[A-Z]{2}$/;
  return crefRegex.test(clean);
}

/**
 * Consulta a entidade ou serviço externo regulador de CREF.
 * Trata os estados: 'Validado', 'Rejeitado', 'Pendente', 'Indisponivel', 'Timeout'.
 *
 * @param {Object} params
 * @param {string} params.cref - Número de registro profissional
 * @param {string} params.area_formacao - Área de graduação
 * @param {string} params.nome - Nome do profissional
 * @returns {Promise<{ status: string, detalhe?: string, mock: boolean }>}
 */
export async function validarCrefExterno({ cref, area_formacao, nome }) {
  const cleanCref = String(cref || "")
    .trim()
    .toUpperCase();

  if (!isValidCrefFormat(cleanCref)) {
    return {
      status: "Rejeitado",
      detalhe:
        "Formato do registro CREF inválido. Exemplo esperado: 123456-G/SP.",
      mock: true,
    };
  }

  const externalUrl = process.env.CREF_SERVICE_URL;

  // Se houver endpoint real configurado e não estivermos forçando mock
  if (externalUrl && process.env.CREF_MODE !== "mock") {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout estrito de 5 segundos

      try {
        console.log(
          `[CREF-API] Consultando serviço configurado (tentativa ${attempt}/${maxRetries})...`
        );
        const response = await fetch(externalUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.CREF_API_KEY
              ? { Authorization: `Bearer ${process.env.CREF_API_KEY}` }
              : {}),
          },
          body: JSON.stringify({ cref: cleanCref, area_formacao, nome }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 404) {
            return {
              status: "Rejeitado",
              detalhe:
                "Registro CREF não localizado na base de profissionais habilitados.",
              mock: false,
            };
          }
          return {
            status: "Indisponivel",
            detalhe: `Não foi possível verificar o registro profissional (HTTP ${response.status}).`,
            mock: false,
          };
        }

        const data = await response.json();
        if (!data || Array.isArray(data) || typeof data.ativo !== "boolean") {
          return {
            status: "Indisponivel",
            detalhe:
              "O serviço retornou uma confirmação profissional em formato inválido.",
            mock: false,
          };
        }
        return {
          status: data.ativo === true ? "Validado" : "Rejeitado",
          detalhe:
            typeof data.situacao === "string"
              ? data.situacao
              : "Registro consultado no serviço configurado.",
          mock: false,
        };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          console.warn(
            "[CREF-API] Timeout de 5s atingido na consulta do CREF."
          );
          if (attempt === maxRetries) {
            return {
              status: "Indisponivel",
              detalhe: "Tempo limite de conexão com o conselho esgotado.",
              mock: false,
            };
          }
        } else if (attempt === maxRetries) {
          return {
            status: "Indisponivel",
            detalhe: "Falha de conectividade com a rede do conselho.",
            mock: false,
          };
        }
      }
    }
  }

  // Adaptador MOCK transparente e testável para ambiente local e testes
  if (cleanCref.includes("REJEIT") || cleanCref.startsWith("000000")) {
    return {
      status: "Rejeitado",
      detalhe:
        "MOCK: Registro suspenso ou cancelado junto ao conselho regional.",
      mock: true,
    };
  }

  if (cleanCref.includes("PEND")) {
    return {
      status: "Pendente",
      detalhe:
        "MOCK: Análise cadastral requer apresentação presencial de diploma.",
      mock: true,
    };
  }

  if (cleanCref.includes("TIMEOUT") || cleanCref.includes("OFFLINE")) {
    return {
      status: "Indisponivel",
      detalhe:
        "MOCK: Conexão com o conselho regional temporariamente indisponível.",
      mock: true,
    };
  }

  return {
    status: "Pendente",
    detalhe:
      "Consulta externa não configurada. Aguardando verificação profissional.",
    mock: true,
  };
}

export default {
  isValidCrefFormat,
  validarCrefExterno,
};
