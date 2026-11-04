import { useState } from "react";
import { api } from "../../lib/api.js";
import { InputField, PrimaryButton } from "./UIComponents.jsx";
export function NutritionAdminPanel() {
  const [q, setQ] = useState(""),
    [foods, setFoods] = useState([]),
    [measures, setMeasures] = useState([]),
    [food, setFood] = useState(""),
    [measure, setMeasure] = useState(""),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState("");
  const search = async () => {
    try {
      const [f, m] = await Promise.all([
        api.buscarAlimentos(q),
        api.buscarMedidasPof(q),
      ]);
      setFoods(f);
      setMeasures(m);
      setFood("");
      setMeasure("");
    } catch (e) {
      setMessage(e.message);
    }
  };
  const link = async () => {
    try {
      const r = await api.vincularMedidaPof({
        taco_id: Number(food),
        pof_id: measure,
        criterio: reason,
      });
      setMessage(r.message);
    } catch (e) {
      setMessage(e.message);
    }
  };
  return (
    <section className="chart-card">
      <h2>Correspondências TACO e POF</h2>
      <p>
        Confirme alimento, variedade e preparo antes de vincular. Os códigos das
        duas bases são independentes.
      </p>
      <InputField
        label="Buscar nas duas bases"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <button onClick={search}>Buscar para revisão</button>
      <label>
        Alimento TACO
        <select
          aria-label="Alimento TACO"
          value={food}
          onChange={e => setFood(e.target.value)}
        >
          <option value="">Selecione</option>
          {foods.map(f => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </label>
      <label>
        Medida POF
        <select
          aria-label="Medida POF"
          value={measure}
          onChange={e => setMeasure(e.target.value)}
        >
          <option value="">Selecione</option>
          {measures.map(m => (
            <option key={m.id} value={m.id}>
              {m.nome_alimento} · {m.preparo} · {m.nome} ({m.gramas} g) ·{" "}
              {m.fonte}
            </option>
          ))}
        </select>
      </label>
      <InputField
        label="Justificativa da equivalência de variedade/preparo"
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
      <PrimaryButton
        onClick={link}
        disabled={!food || !measure || reason.trim().length < 15}
      >
        Confirmar correspondência revisada
      </PrimaryButton>
      <p role="status">{message}</p>
    </section>
  );
}
