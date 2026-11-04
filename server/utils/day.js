export function serverDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseLocalDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [y, m, d] = value.split("-").map(Number);
  const result = new Date(y, m - 1, d);
  return result.getFullYear() === y &&
    result.getMonth() === m - 1 &&
    result.getDate() === d
    ? result
    : null;
}
export function ageFromBirth(value, today = new Date()) {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const birth = parseLocalDay(date);
  if (!birth || birth > today) return null;
  const age =
    today.getFullYear() -
    birth.getFullYear() -
    (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
      ? 1
      : 0);
  return age >= 1 && age <= 120 ? age : null;
}
export function historyPeriod(input = {}) {
  const { inicio, fim } = input;
  if (
    (inicio && !parseLocalDay(inicio)) ||
    (fim && !parseLocalDay(fim)) ||
    (inicio && fim && inicio > fim)
  )
    throw Object.assign(new Error("Período inválido."), { status: 400 });
  const end = fim ? parseLocalDay(fim) : null;
  if (end) end.setDate(end.getDate() + 1);
  return { start: inicio ? parseLocalDay(inicio) : null, end };
}
