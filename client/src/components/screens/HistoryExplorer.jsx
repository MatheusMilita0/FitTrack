import { useEffect, useState, useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { api } from "../../lib/api.js";
const day = value => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const label = value => {
  const [y, m, d] = day(value).split("-");
  return `${d}/${m}/${y}`;
};
export function HistoryExplorer({ alunoId, onExecutions }) {
  const generation = useRef(0),
    appliedFilters = useRef({ inicio: "", fim: "" });
  const [period, setPeriod] = useState({ inicio: "", fim: "" }),
    [data, setData] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [exercise, setExercise] = useState("");
  const load = async (more = false, filters = period) => {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const effective = more ? appliedFilters.current : filters;
      const params = {
        ...effective,
        limit: "25",
        offset: String(more ? data.paginacao.offset + data.paginacao.limit : 0),
      };
      const result = await (alunoId
        ? api.getEvolucaoAluno(alunoId, params)
        : api.getAlunoHistorico(params));
      if (ticket !== generation.current) return;
      const next = more
        ? {
            ...result,
            execucoes: [...data.execucoes, ...result.execucoes],
            biometria: [...data.biometria, ...result.biometria],
            nutricao: [...data.nutricao, ...result.nutricao],
          }
        : result;
      appliedFilters.current = effective;
      setData(next);
      onExecutions?.(next.execucoes);
    } catch (e) {
      if (ticket === generation.current) setError(e.message);
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    setData(null);
    setPeriod({ inicio: "", fim: "" });
    load(false, { inicio: "", fim: "" });
    return () => {
      generation.current++;
    };
  }, [alunoId]);
  const sessions = data?.execucoes || [],
    bio = [...(data?.biometria || [])]
      .reverse()
      .filter(b => b.peso_kg != null)
      .map(b => ({ data: day(b.registrado_em), peso: Number(b.peso_kg) }));
  const frequency = {};
  const loads = {};
  for (const e of sessions) {
    const date = day(e.concluido_em);
    frequency[date] = (frequency[date] || 0) + 1;
    for (const s of e.series_executadas || [])
      if (s.nome && s.concluido !== false)
        (loads[s.nome] ||= []).push({
          data: date,
          carga: Number(s.carga) || 0,
          reps: Number(s.reps) || 0,
        });
  }
  const names = Object.keys(loads),
    selected = names.includes(exercise) ? exercise : names[0];
  const chart = (points, key, unit, bar = false) =>
    points.length ? (
      <div style={{ width: "100%", height: 230 }}>
        <ResponsiveContainer>
          {bar ? (
            <BarChart data={points}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" tickFormatter={label} />
              <YAxis />
              <Tooltip labelFormatter={label} />
              <Bar dataKey={key} fill="var(--accent, #ff5b45)" name={unit} />
            </BarChart>
          ) : (
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" tickFormatter={label} />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip labelFormatter={label} />
              <Line
                type="monotone"
                dataKey={key}
                stroke="var(--accent, #ff5b45)"
                name={unit}
                connectNulls={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    ) : (
      <p>Sem registros neste período.</p>
    );
  return (
    <>
      <form
        className="history-filters"
        onSubmit={e => {
          e.preventDefault();
          load(false);
        }}
      >
        <label>
          De
          <input
            type="date"
            value={period.inicio}
            onChange={e => setPeriod({ ...period, inicio: e.target.value })}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={period.fim}
            onChange={e => setPeriod({ ...period, fim: e.target.value })}
          />
        </label>
        <button className="btn btn-secondary" disabled={busy}>
          Filtrar período
        </button>
      </form>
      <p role="alert">{error}</p>
      {error && (
        <button className="btn btn-secondary" onClick={() => load(false)}>
          Tentar novamente
        </button>
      )}
      <section className="chart-card">
        <h2>Evolução do peso (kg)</h2>
        {chart(bio, "peso", "Peso (kg)")}
      </section>
      <section className="chart-card">
        <h2>Frequência de treinos</h2>
        <p>{data?.total_treinos || 0} sessões no período</p>
        {chart(
          Object.entries(frequency)
            .sort()
            .map(([data, sessoes]) => ({ data, sessoes })),
          "sessoes",
          "Sessões",
          true
        )}
      </section>
      <section className="chart-card">
        <h2>Progressão de carga</h2>
        <label>
          Exercício
          <select
            value={selected || ""}
            onChange={e => setExercise(e.target.value)}
          >
            {names.map(n => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        {chart([...(loads[selected] || [])].reverse(), "carga", "Carga (kg)")}
        <p>
          Gráficos baseados nos registros carregados. Use “Carregar mais” para
          incluir registros anteriores.
        </p>
      </section>
      <section className="chart-card">
        <h2>Biometria registrada</h2>
        {(data?.biometria || []).map(b => (
          <p key={b.id}>
            {label(b.registrado_em)}: {b.peso_kg ?? "—"} kg ·{" "}
            {b.altura_cm ?? "—"} cm · {b.objetivo}
          </p>
        ))}
      </section>
      <section className="chart-card">
        <h2>Diário nutricional</h2>
        {(data?.nutricao || []).map(n => (
          <p key={n.id}>
            {label(n.data)}: {n.calorias_consumidas} kcal · {n.agua_ml} ml
          </p>
        ))}
      </section>
      <section className="chart-card">
        <h2>Sessões concluídas</h2>
        {sessions.map(e => (
          <details key={e.id}>
            <summary>
              {label(e.concluido_em)} · {e.treino_titulo} ·{" "}
              {Math.round(e.duracao_segundos / 60)} min
            </summary>
            {(e.series_executadas || []).map((s, i) => (
              <p key={i}>
                {s.nome} · série {s.serie} · {s.carga} kg × {s.reps} ·{" "}
                {s.concluido === false ? "Não concluída" : "Concluída"}
              </p>
            ))}
          </details>
        ))}
      </section>
      {data?.paginacao?.tem_mais && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => load(true)}
        >
          Carregar mais registros
        </button>
      )}
      {busy && <p role="status">Carregando…</p>}
    </>
  );
}
