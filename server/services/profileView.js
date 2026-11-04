import { ageFromBirth } from "../utils/day.js";
import { calcularMetasNutricionais } from "./calculoMetabolico.js";
export function profileView(profile) {
  if (!profile || !("peso_kg" in profile)) return profile;
  const calculated = calcularMetasNutricionais(profile),
    age = ageFromBirth(profile.data_nascimento);
  return {
    ...profile,
    ...(calculated.metas_pendentes || age !== Number(profile.idade)
      ? calculated
      : {}),
    idade: age,
    metas_pendentes: calculated.metas_pendentes,
  };
}
