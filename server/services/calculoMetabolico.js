import { ageFromBirth } from "../utils/day.js";
/**
 * Serviço de Cálculo Metabólico e Macronutrientes (FitTrack)
 * Atende RF06 e RN06 com unidades explícitas e fórmulas documentadas.
 */

export const DISCLAIMER_MEDICO =
  "Estimativa matemática baseada no método Mifflin-St Jeor para fins informativos. Não substitui avaliação médica ou prescrição dietética de um nutricionista.";

export const FATORES_OBJETIVO = {
  Hipertrofia: {
    caloriasDelta: 350, // Superávit para síntese proteica e ganho de massa
    proteinaGPorKg: 2.0, // 2.0g/kg de peso corporal
    gorduraPercentual: 0.25, // 25% das calorias totais
  },
  Emagrecimento: {
    caloriasDelta: -450, // Déficit controlado para perda de gordura
    proteinaGPorKg: 2.0, // Alta proteína para preservação de massa magra
    gorduraPercentual: 0.25, // 25% das calorias totais
  },
  Condicionamento: {
    caloriasDelta: 0, // Manutenção calórica
    proteinaGPorKg: 1.6, // 1.6g/kg
    gorduraPercentual: 0.25, // 25% das calorias
  },
  Força: {
    caloriasDelta: 200, // Leve superávit para suporte de carga
    proteinaGPorKg: 2.0, // 2.0g/kg
    gorduraPercentual: 0.25, // 25% das calorias
  },
};

/**
 * Calcula a Taxa Metabólica Basal (TMB) e Gasto Energético Total (TDEE).
 * Equação de Mifflin-St Jeor conforme o parâmetro informado:
 * TMB = (10 × peso_kg) + (6.25 × altura_cm) - (5 × idade) + constante (+5 ou -161)
 *
 * @param {Object} params
 * @param {number} params.peso_kg - Peso em quilogramas (20 a 400)
 * @param {number} params.altura_cm - Altura em centímetros (100 a 250)
 * @param {number} params.idade - Idade em anos (12 a 120)
 * @param {string} params.objetivo - 'Hipertrofia' | 'Emagrecimento' | 'Condicionamento' | 'Força'
 * @returns {Object} Metas diárias calculadas com unidades explícitas
 */
export function calcularMetasNutricionais({
  peso_kg,
  altura_cm,
  idade,
  data_nascimento,
  sexo_metabolico,
  fator_atividade = 1.55,
  objetivo = "Hipertrofia",
}) {
  const peso = Number(peso_kg);
  const altura = Number(altura_cm);
  const anos = data_nascimento ? ageFromBirth(data_nascimento) : Number(idade);
  const fator = Number(fator_atividade);
  if (!(
    peso >= 20 &&
    peso <= 400 &&
    altura >= 100 &&
    altura <= 250 &&
    anos >= 1 &&
    anos <= 120 &&
    ["masculino", "feminino"].includes(sexo_metabolico) &&
    [1.2, 1.375, 1.45, 1.55, 1.725, 1.9].includes(fator)
  )) {
    return {
      meta_calorias_kcal: null,
      meta_proteinas_g: null,
      meta_carboidratos_g: null,
      meta_gorduras_g: null,
      meta_agua_ml:
        peso >= 20 && peso <= 400
          ? Math.max(Math.round(peso * 35), 2000)
          : null,
      metas_pendentes: true,
      disclaimer: DISCLAIMER_MEDICO,
    };
  }
  const obj = FATORES_OBJETIVO[objetivo] ? objetivo : "Hipertrofia";
  const fatores = FATORES_OBJETIVO[obj];

  // 1. Taxa Metabólica Basal (TMB em kcal/dia)
  const tmb =
    10 * peso +
    6.25 * altura -
    5 * anos +
    (sexo_metabolico === "masculino" ? 5 : -161);

  // 2. Fator de Atividade Física Moderada (Frequência média de academia 3-5x/semana)
  const fatorAtividade = fator;
  const tdee = Math.round(tmb * fatorAtividade);

  // 3. Calorias Totais Diárias ajustadas ao objetivo
  const metaCalorias = Math.max(Math.round(tdee + fatores.caloriasDelta), 1200);

  // 4. Proteínas: peso × proteinaGPorKg (1g = 4 kcal)
  const metaProteinasG = Math.round(peso * fatores.proteinaGPorKg);
  const caloriasProteina = metaProteinasG * 4;

  // 5. Gorduras: percentual das calorias totais (1g = 9 kcal)
  const caloriasGordura = metaCalorias * fatores.gorduraPercentual;
  const metaGordurasG = Math.round(caloriasGordura / 9);

  // 6. Carboidratos: calorias restantes divididas por 4 kcal/g
  const caloriasCarboidrato = Math.max(
    metaCalorias - (caloriasProteina + caloriasGordura),
    0
  );
  const metaCarboidratosG = Math.round(caloriasCarboidrato / 4);

  // 7. Hidratação Diária: 35 ml por kg de peso corporal, mínimo 2000 ml
  const metaAguaMl = Math.max(Math.round(peso * 35), 2000);

  return {
    meta_calorias_kcal: metaCalorias,
    meta_proteinas_g: metaProteinasG,
    meta_carboidratos_g: metaCarboidratosG,
    meta_gorduras_g: metaGordurasG,
    meta_agua_ml: metaAguaMl,
    objetivo: obj,
    metas_pendentes: false,
    disclaimer: DISCLAIMER_MEDICO,
  };
}

export default {
  calcularMetasNutricionais,
  DISCLAIMER_MEDICO,
  FATORES_OBJETIVO,
};
