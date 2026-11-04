import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import {
  ExerciseThumb,
  FullscreenGif,
  PrimaryButton,
} from "./UIComponents.jsx";
const labels = {
  forca: "Força",
  intermediario: "Intermediário",
  avancado: "Avançado",
  maquina: "Máquina",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebracos: "Antebraços",
  pescoco: "Pescoço",
  quadriceps: "Quadríceps",
  trapezio: "Trapézio",
  gluteos: "Glúteos",
  "inferior-das-costas": "Lombar",
  "meio-das-costas": "Meio das costas",
  "levantamento-de-potencia": "Levantamento de potência",
  "atletismo-de-forca": "Atletismo de força",
};
const label = value =>
  labels[value] ||
  value.replaceAll("-", " ").replace(/^./, c => c.toUpperCase());
export function CatalogBrowser({ onSelect, selectedIds = [] }) {
  const [filters, setFilters] = useState({}),
    [q, setQ] = useState(""),
    [group, setGroup] = useState(""),
    [level, setLevel] = useState(""),
    [equipment, setEquipment] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(0),
    [items, setItems] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [detail, setDetail] = useState(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    api
      .getCatalogoFiltros()
      .then(r => {
        if (live) setFilters(r);
      })
      .catch(e => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [retry]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        api
          .getCatalogoExercicios({
            busca: q,
            grupo: group,
            nivel: level,
            equipamento: equipment,
            categoria: category,
            limit: 24,
            offset: page * 24,
          })
          .then(r => {
            if (live) setItems(r);
          })
          .catch(e => {
            if (live) {
              setItems([]);
              setError(e.message);
            }
          })
          .finally(() => {
            if (live) setLoading(false);
          }),
      200
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, group, level, equipment, category, page, retry]);
  const change = setter => e => {
    setter(e.target.value);
    setPage(0);
  };
  return (
    <section
      className="catalog-browser"
      aria-label="Catálogo de exercícios em português"
    >
      <label className="search-field">
        Buscar exercício
        <input
          value={q}
          onChange={change(setQ)}
          placeholder="Nome, músculo ou instrução"
        />
      </label>
      <div className="catalog-filters">
        {[
          ["Grupo muscular", group, setGroup, filters.grupos],
          ["Nível", level, setLevel, filters.niveis],
          ["Equipamento", equipment, setEquipment, filters.equipamentos],
          ["Categoria", category, setCategory, filters.categorias],
        ].map(([title, value, setter, options]) => (
          <label key={title}>
            {title}
            <select aria-label={title} value={value} onChange={change(setter)}>
              <option value="">Todos</option>
              {(options || []).map(v => (
                <option value={v} key={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {loading && <p role="status">Carregando catálogo local…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry(retry + 1)}>Tentar novamente</button>
        </div>
      )}
      {!loading && !error && !items.length && (
        <p>
          {filters.total === 0
            ? "Catálogo ainda não disponível. Solicite a configuração à administração."
            : "Nenhum exercício encontrado para estes filtros."}
        </p>
      )}
      {!loading && !error && (
        <div className="exercise-library-grid">
          {items.map(ex => (
            <article className="library-card" key={ex.id}>
              <div className="library-visual coral">
                <ExerciseThumb
                  image={ex.imageUrl}
                  alt={`Demonstração de ${ex.name}`}
                />
              </div>
              <div className="library-body">
                <h3>{ex.name}</h3>
                <p>
                  {ex.bodyParts.map(label).join(", ")} · {label(ex.nivel)}
                </p>
                <p>{label(ex.equipamento || "sem equipamento informado")}</p>
                <p>
                  {ex.mediaConfigured
                    ? "Fotos demonstrativas"
                    : "Fotos ainda não disponíveis"}
                </p>
                {!ex.instructions.length && (
                  <p>
                    Instruções ausentes na base; revisão profissional
                    necessária.
                  </p>
                )}
                <button onClick={() => setDetail(ex)}>Como executar</button>
                {onSelect && (
                  <PrimaryButton
                    disabled={selectedIds.includes(ex.id)}
                    onClick={() => onSelect(ex)}
                  >
                    {selectedIds.includes(ex.id)
                      ? "Adicionado"
                      : "Adicionar à ficha"}
                  </PrimaryButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="filter-row">
        <button disabled={!page || loading} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>Página {page + 1}</span>
        <button
          disabled={items.length < 24 || loading}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
      </div>
      {detail && (
        <FullscreenGif exercise={detail} close={() => setDetail(null)} />
      )}
    </section>
  );
}
