export function validateWorkout(exercicios) {
  return (
    Array.isArray(exercicios) &&
    exercicios.length > 0 &&
    exercicios.length <= 100 &&
    exercicios.every(
      ex =>
        ex &&
        typeof ex.nome === "string" &&
        ex.nome.trim() &&
        ex.nome.length <= 150 &&
        typeof ex.reps_padrao === "string" &&
        /[1-9]/.test(ex.reps_padrao) &&
        ex.reps_padrao.length <= 20 &&
        typeof ex.descanso_padrao === "string" &&
        /[0-9]/.test(ex.descanso_padrao) &&
        ex.descanso_padrao.length <= 20
    )
  );
}
