/**
 * Validadores de Regras de Negócio do FitTrack
 * RN01, RN02, RN10, RN11, RN12, RN17
 */

/**
 * RN10: CPF com exatamente 11 dígitos numéricos e validação algorítmica (Módulo 11)
 */
export function validateCpf(cpf) {
  if (!cpf || typeof cpf !== "string") return false;
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return false;

  // Rejeita sequências de dígitos repetidos conhecidas
  if (/^(\d)\1{10}$/.test(clean)) return false;

  // Primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  // Segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

/**
 * RN02: Senha com mínimo de 6 caracteres, pelo menos uma maiúscula e uma minúscula
 */
export function validatePassword(senha) {
  if (!senha || typeof senha !== "string") return false;
  if (senha.length < 6) return false;
  const hasUpper = /[A-Z]/.test(senha);
  const hasLower = /[a-z]/.test(senha);
  return hasUpper && hasLower;
}

/**
 * RN11: Nome contendo apenas letras, acentos e espaços, com até 100 caracteres
 */
export function validateName(nome) {
  if (!nome || typeof nome !== "string") return false;
  const trimmed = nome.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  // Letras latinas, acentuadas e espaços
  return /^[A-Za-zÀ-ÖØ-öø-ÿ ]+$/u.test(trimmed);
}

/**
 * RN12: E-mail em formato válido, sem ponto no início ou no fim do local-part ou domínio
 */
export function validateEmail(email) {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 150) return false;

  // Sem ponto no início ou fim
  if (trimmed.startsWith(".") || trimmed.endsWith(".")) return false;

  // Validação RFC com bloqueio de pontos consecutivos
  const emailRegex =
    /^[a-zA-Z0-9_!#$%&'*+/=?`{|}~^.-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(trimmed)) return false;
  if (trimmed.includes("..")) return false;

  const [localPart, domain] = trimmed.split("@");
  if (!localPart || !domain) return false;
  if (localPart.startsWith(".") || localPart.endsWith(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;

  return true;
}

/**
 * RN17: Peso entre 20 e 400 kg
 */
export function validateWeight(peso) {
  if (peso === undefined || peso === null || peso === "") return true; // opcional se não informado
  const num = Number(peso);
  if (!Number.isFinite(num)) return false;
  return num >= 20 && num <= 400;
}

/**
 * RN17: Altura entre 1 e 2.5 m (ou 100 e 250 cm)
 * Retorna { valid: boolean, heightCm: number | null }
 */
export function normalizeAndValidateHeight(altura) {
  if (altura === undefined || altura === null || altura === "") {
    return { valid: true, heightCm: null };
  }
  const num = Number(altura);
  if (!Number.isFinite(num) || num <= 0) {
    return { valid: false, heightCm: null };
  }

  // Se informado em metros (entre 1.0 e 2.5)
  if (num >= 1.0 && num <= 2.5) {
    return { valid: true, heightCm: Math.round(num * 100) };
  }

  // Se informado em centímetros (entre 100 e 250)
  if (num >= 100 && num <= 250) {
    return { valid: true, heightCm: Math.round(num) };
  }

  return { valid: false, heightCm: null };
}

/**
 * RN01: Valida se a credencial de login é um e-mail válido ou um CPF de 11 dígitos
 */
export function validateLoginIdentifier(identifier) {
  if (!identifier || typeof identifier !== "string") return false;
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return validateEmail(trimmed);
  }
  const cleanCpf = trimmed.replace(/\D/g, "");
  return cleanCpf.length === 11 && validateCpf(cleanCpf);
}
