export function MetabolicFields({ value, onChange }) {
  const set = (field, entry) => onChange({ ...value, [field]: entry });
  return (
    <>
      <label className="field-label">
        Data de nascimento *
        <input
          className="input-field"
          type="date"
          required
          value={String(value.data_nascimento || "").slice(0, 10)}
          onChange={e => set("data_nascimento", e.target.value)}
        />
      </label>
      <label className="field-label">
        Equação para estimar energia *
        <select
          required
          value={value.sexo_metabolico || ""}
          onChange={e => set("sexo_metabolico", e.target.value)}
        >
          <option value="">Selecione</option>
          <option value="masculino">Masculina</option>
          <option value="feminino">Feminina</option>
        </select>
        <small>
          Parâmetro usado no cálculo metabólico; não define identidade de
          gênero.
        </small>
      </label>
      <label className="field-label">
        Nível habitual de atividade
        <select
          value={value.fator_atividade || 1.55}
          onChange={e => set("fator_atividade", Number(e.target.value))}
        >
          <option value="1.2">Sedentário</option>
          <option value="1.375">Leve</option>
          <option value="1.45">Intermediário</option>
          <option value="1.55">Moderado</option>
          <option value="1.725">Intenso</option>
          <option value="1.9">Muito intenso</option>
        </select>
      </label>
    </>
  );
}
