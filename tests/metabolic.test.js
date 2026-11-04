import { describe, it, expect } from "vitest";
import {
  calcularMetasNutricionais,
  DISCLAIMER_MEDICO,
  FATORES_OBJETIVO,
} from "../server/services/calculoMetabolico.js";

describe("Serviço de Cálculo Metabólico e Macronutrientes (RN06, RF06)", () => {
  it("deve calcular calorias e macronutrientes com unidades explícitas para hipertrofia", () => {
    const res = calcularMetasNutricionais({
      sexo_metabolico: "masculino",
      fator_atividade: 1.45,
      peso_kg: 80,
      altura_cm: 180,
      idade: 25,
      objetivo: "Hipertrofia",
    });

    // TMB = 800 + 1125 - 125 + 5 = 1805 kcal.
    // TDEE arredondado = 2617; hipertrofia (+350) = 2967 kcal.
    expect(res.meta_calorias_kcal).toBeGreaterThanOrEqual(2950);
    expect(res.meta_calorias_kcal).toBeLessThanOrEqual(3000);

    // Proteína: 80 * 2.0 = 160g
    expect(res.meta_proteinas_g).toBe(160);

    // Água: 80 * 35 = 2800 ml
    expect(res.meta_agua_ml).toBe(2800);

    // Disclaimer deve estar presente
    expect(res.disclaimer).toBe(DISCLAIMER_MEDICO);
  });

  it("deve reduzir calorias adequadamente para objetivo de emagrecimento", () => {
    const hip = calcularMetasNutricionais({
      sexo_metabolico: "masculino",
      fator_atividade: 1.45,
      peso_kg: 80,
      altura_cm: 180,
      idade: 25,
      objetivo: "Hipertrofia",
    });

    const emag = calcularMetasNutricionais({
      sexo_metabolico: "masculino",
      fator_atividade: 1.45,
      peso_kg: 80,
      altura_cm: 180,
      idade: 25,
      objetivo: "Emagrecimento",
    });

    expect(emag.meta_calorias_kcal).toBeLessThan(hip.meta_calorias_kcal);
    expect(hip.meta_calorias_kcal - emag.meta_calorias_kcal).toBe(800); // 350 - (-450)
  });

  it("deve recalcular valores quando peso e altura mudam", () => {
    const antes = calcularMetasNutricionais({
      sexo_metabolico: "masculino",
      fator_atividade: 1.45,
      peso_kg: 70,
      altura_cm: 170,
      idade: 30,
      objetivo: "Condicionamento",
    });

    const depois = calcularMetasNutricionais({
      sexo_metabolico: "masculino",
      fator_atividade: 1.45,
      peso_kg: 85,
      altura_cm: 170,
      idade: 30,
      objetivo: "Condicionamento",
    });

    expect(depois.meta_calorias_kcal).toBeGreaterThan(antes.meta_calorias_kcal);
    expect(depois.meta_proteinas_g).toBeGreaterThan(antes.meta_proteinas_g);
    expect(depois.meta_agua_ml).toBeGreaterThan(antes.meta_agua_ml);
  });
});
