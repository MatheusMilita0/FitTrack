import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import {
  Sheet,
  InputField,
  PrimaryButton,
  SecondaryButton,
} from "./UIComponents.jsx";
const fmt = v =>
  v === null || v === undefined
    ? "Não informado"
    : Number(v) > 0 && Number(v) < 0.001
      ? "<0,001"
      : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const nutrientLabel = k =>
  ({
    energia_kcal: "Energia (kcal)",
    energia_kj: "Energia (kJ)",
    proteina_g: "Proteínas (g)",
    carboidrato_g: "Carboidratos (g)",
    lipideos_g: "Lipídios (g)",
    fibra_g: "Fibras (g)",
    RE_mcg: "Vitamina A RE (µg)",
    RAE_mcg: "Vitamina A RAE (µg)",
  })[k] || k.replaceAll("_", " ");
export function NutritionFoodSheet({ close, notify, onAdded, manual }) {
  const [manualMode, setManualMode] = useState(false),
    [title, setTitle] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(0),
    [foods, setFoods] = useState([]),
    [selected, setSelected] = useState(null),
    [unit, setUnit] = useState("g"),
    [quantity, setQuantity] = useState("100"),
    [basket, setBasket] = useState([]),
    [preview, setPreview] = useState(null),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .buscarAlimentos(q, page * 24)
        .then(r => {
          if (live) setFoods(r);
        })
        .catch(e => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, page]);
  useEffect(() => {
    let live = true;
    if (!basket.length) {
      setPreview(null);
      return;
    }
    api
      .calcularRefeicao(
        basket.map(({ alimento_id, medida_id, quantidade }) => ({
          alimento_id,
          medida_id,
          quantidade,
        }))
      )
      .then(r => {
        if (live) setPreview(r);
      })
      .catch(e => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [basket]);
  const select = async id => {
    setError("");
    try {
      setSelected(await api.getAlimento(id));
      setUnit("g");
      setQuantity("100");
    } catch (e) {
      setError(e.message);
    }
  };
  const add = async () => {
    setError("");
    try {
      const entry = {
        alimento_id: selected.id,
        medida_id: unit,
        quantidade: Number(quantity),
      };
      const result = await api.calcularRefeicao([entry]);
      setBasket([...basket, { ...entry, ...result.alimentos[0] }]);
      setSelected(null);
    } catch (e) {
      setError(e.message);
    }
  };
  const save = async e => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.adicionarRefeicao({
        titulo: title,
        alimentos: basket.map(({ alimento_id, medida_id, quantidade }) => ({
          alimento_id,
          medida_id,
          quantidade,
        })),
      });
      notify("Refeição calculada pela TACO e registrada.");
      await onAdded();
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  if (manualMode) return manual;
  return (
    <Sheet
      title="Adicionar refeição pela TACO"
      close={close}
      className="nutrition-food-sheet"
    >
      <p>
        Valores por 100 g de parte comestível. Escolha o alimento e o preparo
        corretos.
      </p>
      <form onSubmit={save} className="stack-form">
        <InputField
          label="Título da refeição"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
        />
        <InputField
          label="Buscar alimento"
          value={q}
          onChange={e => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Ex.: arroz integral cozido"
        />
        {loading && <p role="status">Buscando alimentos…</p>}
        {!loading && !foods.length && (
          <p>
            Nenhum alimento encontrado. A base pode ainda não ter sido
            carregada.
          </p>
        )}
        <div className="food-catalog-results">
          {foods.map(f => (
            <button type="button" key={f.id} onClick={() => select(f.id)}>
              <strong>{f.nome}</strong>
              <span>
                {f.categoria} · {fmt(f.nutrientes_100g.energia_kcal)} kcal/100 g
              </span>
            </button>
          ))}
        </div>
        <div className="filter-row">
          <button
            type="button"
            disabled={!page || loading}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            type="button"
            disabled={foods.length < 24 || loading}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </button>
        </div>
        {selected && (
          <section className="chart-card">
            <h3>{selected.nome}</h3>
            <p>{selected.preparo}</p>
            <div className="field-pair">
              <label>
                Medida
                <select
                  aria-label="Medida consumida"
                  value={unit}
                  onChange={e => {
                    setUnit(e.target.value);
                    setQuantity(e.target.value === "g" ? "100" : "1");
                  }}
                >
                  <option value="g">Gramas</option>
                  {selected.medidas.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nome.toLocaleLowerCase("pt-BR")} — {fmt(m.gramas)} g
                    </option>
                  ))}
                </select>
              </label>
              <InputField
                label="Quantidade consumida"
                type="number"
                step="any"
                min="0.001"
                max="10000"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
            </div>
            {!selected.medidas.length && (
              <p>
                Sem medida caseira vinculada para este alimento. Informe o peso
                em gramas.
              </p>
            )}
            {unit !== "g" && (
              <p>
                Fonte da medida:{" "}
                {selected.medidas.find(m => m.id === unit)?.fonte}
              </p>
            )}
            <SecondaryButton onClick={add}>
              Adicionar alimento à refeição
            </SecondaryButton>
          </section>
        )}
        {basket.map((b, i) => (
          <article className="meal-card" key={i}>
            <div>
              <strong>{b.nome}</strong>
              <p>
                {b.quantidade} {b.medida} · {fmt(b.gramas)} g
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBasket(basket.filter((_, idx) => idx !== i))}
            >
              Remover
            </button>
          </article>
        ))}
        {preview && (
          <section className="chart-card">
            <h3>Total calculado no servidor</h3>
            <p>
              {fmt(preview.valores.energia_kcal)} kcal ·{" "}
              {fmt(preview.valores.proteina_g)} g de proteína ·{" "}
              {fmt(preview.valores.carboidrato_g)} g de carboidratos ·{" "}
              {fmt(preview.valores.lipideos_g)} g de lipídios
            </p>
            {!!preview.ausentes.length && (
              <p>
                Há valores ausentes ou inconsistentes na fonte. Os totais desses
                nutrientes não são tratados como zero.
              </p>
            )}
            <details>
              <summary>Vitaminas, minerais e composição completa</summary>
              {Object.entries(preview.valores).map(([k, v]) => (
                <p key={k}>
                  {nutrientLabel(k)}: {fmt(v)}
                </p>
              ))}
              <p>
                “Traço” na fonte é preservado como qualificador; não é uma
                medição exata.
              </p>
            </details>
          </section>
        )}
        {error && <p role="alert">{error}</p>}
        <PrimaryButton type="submit" disabled={saving || !basket.length}>
          {saving ? "Registrando…" : "Salvar no diário"}
        </PrimaryButton>
      </form>
      <button className="text-link" onClick={() => setManualMode(true)}>
        Inserir valores manualmente
      </button>
    </Sheet>
  );
}
