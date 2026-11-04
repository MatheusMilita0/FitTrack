import { HistoryExplorer } from "./HistoryExplorer.jsx";
import { NutritionFoodSheet } from "./NutritionFoodSheet.jsx";
import { CatalogBrowser } from "./CatalogBrowser.jsx";
("use strict");
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Apple,
  BarChart3,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Droplets,
  Dumbbell,
  Flame,
  MessageCircle,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { StudentFeedbackPanel } from "./FeedbackPanels.jsx";
import {
  Avatar,
  BackButton,
  BottomNav,
  EmptyState,
  ExerciseThumb,
  FullscreenGif,
  Header,
  InputField,
  Macro,
  PrimaryButton,
  SecondaryButton,
  Sheet,
  StatusBadge,
} from "./UIComponents.jsx";

export function StudentDashboard({
  user,
  go,
  openAccount,
  openAI,
  notify,
  onStartWorkout,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [personaisModal, setPersonaisModal] = useState(false);
  const [availablePersonais, setAvailablePersonais] = useState([]);
  const [loadingPersonais, setLoadingPersonais] = useState(false);

  const loadDashboard = async () => {
    try {
      const res = await api.getAlunoDashboard();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message || "Erro ao carregar dados do dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const addWater = async (amount = 250) => {
    try {
      const res = await api.registrarHidratacao(amount);
      if (res && res.nutricao) {
        setData(prev =>
          prev
            ? {
                ...prev,
                nutricao_hoje: {
                  ...prev.nutricao_hoje,
                  agua_ml: res.nutricao.agua_ml,
                },
              }
            : prev
        );
        notify(`+${amount} ml adicionados à hidratação.`);
      }
    } catch (err) {
      notify(
        err.message || "Não foi possível registrar hidratação.",
        "warning"
      );
    }
  };

  const openVincularPersonal = async () => {
    setPersonaisModal(true);
    setLoadingPersonais(true);
    try {
      const list = await api.getPersonaisDisponiveis();
      setAvailablePersonais(list || []);
    } catch (err) {
      notify(err.message || "Erro ao listar personais.", "warning");
    } finally {
      setLoadingPersonais(false);
    }
  };

  const solicitarVinculo = async (personalId, personalNome) => {
    try {
      await api.vincularPersonal(personalId);
      notify(`Solicitação de acompanhamento enviada para ${personalNome}.`);
      setPersonaisModal(false);
      loadDashboard();
    } catch (err) {
      notify(err.message || "Erro ao solicitar vínculo.", "warning");
    }
  };

  if (loading) {
    return (
      <section className="screen dashboard-screen">
        {data?.perfil?.metas_pendentes && (
          <p className="chart-card" role="status">
            Metas pendentes: complete nascimento e os dados metabólicos em
            Perfil. Os registros de consumo continuam disponíveis.
            <button onClick={() => go("profile")}>Completar perfil</button>
          </p>
        )}
        <div className="top-row">
          <div>
            <p className="date-line">CARREGANDO FITTRACK…</p>
            <h1>Olá, {user.nome.split(" ")[0]}</h1>
          </div>
          <button className="avatar-button" onClick={openAccount}>
            <Avatar name={user.nome} active />
          </button>
        </div>
        <div className="exercise-skeleton" style={{ marginTop: "20px" }}>
          <i />
          <span />
          <span />
        </div>
      </section>
    );
  }

  const perfil = data?.perfil || {};
  const nutricao = data?.nutricao_hoje || {
    agua_ml: 0,
    calorias_consumidas: 0,
  };
  const treino = data?.treino_do_dia || null;
  const personal = data?.personal_vinculado || null;

  const metaCalorias = perfil.meta_calorias_kcal || 0;
  const calPercent = Math.min(
    100,
    Math.round(
      (nutricao.calorias_consumidas / (metaCalorias || Infinity)) * 100
    )
  );

  const metaAgua = perfil.meta_agua_ml || 0;
  const waterPercent = Math.min(
    100,
    Math.round((nutricao.agua_ml / (metaAgua || Infinity)) * 100)
  );

  const hojeDataFormatada = new Date()
    .toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
    .toUpperCase();

  return (
    <section className="screen dashboard-screen">
      {data?.perfil?.metas_pendentes && (
        <p className="chart-card" role="status">
          Metas pendentes: complete nascimento e os dados metabólicos em Perfil.
          Os registros de consumo continuam disponíveis.
          <button onClick={() => go("profile")}>Completar perfil</button>
        </p>
      )}
      <div className="top-row">
        <div>
          <p className="date-line">{hojeDataFormatada}</p>
          <h1>Olá, {user.nome.split(" ")[0]}</h1>
        </div>
        <button className="avatar-button" onClick={openAccount}>
          <Avatar name={user.nome} active />
        </button>
      </div>

      <div className="connection-row">
        {personal ? (
          <StatusBadge>Personal: {personal.nome}</StatusBadge>
        ) : (
          <button
            className="text-link"
            onClick={openVincularPersonal}
            style={{ fontSize: "12px" }}
          >
            + Vincular a um Personal Trainer
          </button>
        )}
        <button
          className="round-notice"
          onClick={() => go("chat")}
          aria-label="Abrir chat"
        >
          <MessageCircle size={18} />
        </button>
      </div>

      {error && (
        <div className="inline-banner error" style={{ margin: "12px 0" }}>
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {treino ? (
        <section
          className="today-hero"
          onClick={() => onStartWorkout(treino)}
          style={{ cursor: "pointer" }}
        >
          <div className="hero-pattern" />
          <div className="hero-copy">
            <span className="hero-label">
              <Zap size={14} /> TREINO DE HOJE
            </span>
            <h2>{treino.titulo}</h2>
            <p>
              {treino.descricao || "Ficha prescrita pelo instrutor"}{" "}
              <span>·</span> {treino.tempo_estimado_min || 45} min
            </p>
            <PrimaryButton
              onClick={e => {
                e.stopPropagation();
                onStartWorkout(treino);
              }}
              className="hero-cta"
            >
              Iniciar treino <Play size={17} fill="currentColor" />
            </PrimaryButton>
          </div>
          <ExerciseThumb tint={treino.cor_tema || "coral"} />
        </section>
      ) : (
        <section
          className="today-hero"
          style={{ background: "var(--elevated)" }}
        >
          <div className="hero-copy">
            <span className="hero-label">
              <BookOpen size={14} /> NENHUM TREINO HOJE
            </span>
            <h2>Dia de descanso ou rotina livre</h2>
            <p>
              Você não tem ficha agendada para hoje. Escolha um modelo na
              biblioteca.
            </p>
            <SecondaryButton onClick={() => go("library")} className="hero-cta">
              Ver biblioteca <ChevronRight size={17} />
            </SecondaryButton>
          </div>
          <ExerciseThumb tint="purple" />
        </section>
      )}

      <div className="section-title">
        <div>
          <span className="eyebrow">SEU RITMO</span>
          <h2>Hoje em foco</h2>
        </div>
        <button className="text-link" onClick={() => go("nutrition")}>
          Ver detalhes
        </button>
      </div>

      <div className="metric-grid">
        <article className="metric-card calories">
          <div className="metric-top">
            <span>Calorias</span>
            <Flame size={18} />
          </div>
          <div className="ring-wrap">
            <div
              className="progress-ring"
              style={{ "--progress": `${calPercent}%` }}
            >
              <div>
                <b>
                  {Number(nutricao.calorias_consumidas).toLocaleString(
                    "pt-BR",
                    { maximumFractionDigits: 1 }
                  )}
                </b>
                <span>/ {metaCalorias || "—"} kcal</span>
              </div>
            </div>
          </div>
          <p>
            <strong>{calPercent}%</strong> da meta diária
          </p>
        </article>

        <article className="metric-card water">
          <div className="metric-top">
            <span>Hidratação</span>
            <Droplets size={18} />
          </div>
          <div className="water-amount">
            <b>{(nutricao.agua_ml / 1000).toFixed(2).replace(".", ",")}L</b>
            <span>de {(metaAgua / 1000).toFixed(1).replace(".", ",")}L</span>
          </div>
          <div className="water-progress">
            <i style={{ width: `${waterPercent}%` }} />
          </div>
          <button className="water-add" onClick={() => addWater(250)}>
            <Plus size={15} /> 250 ml
          </button>
        </article>
      </div>

      {personal && (
        <button
          className="text-link"
          onClick={async () => {
            try {
              await api.encerrarVinculo();
              await loadDashboard();
            } catch (e) {
              notify(e.message, "error");
            }
          }}
        >
          Encerrar vínculo com personal
        </button>
      )}
      <button className="ai-banner" onClick={openAI}>
        <div className="spark-circle">
          <Sparkles size={20} />
        </div>
        <div>
          <strong>Sugestão Inteligente de Treino</strong>
          <span>Sugestão com origem identificada: Gemini ou demonstração.</span>
        </div>
        <ChevronRight size={20} />
      </button>

      <div className="section-title quick-title">
        <div>
          <span className="eyebrow">ATÉ VOCÊ</span>
          <h2>Acessos rápidos</h2>
        </div>
      </div>

      <div className="quick-actions">
        <button className="quick-action" onClick={() => go("library")}>
          <span>
            <BookOpen size={19} />
          </span>
          Biblioteca
        </button>
        <button className="quick-action" onClick={() => go("history")}>
          <span>
            <BarChart3 size={19} />
          </span>
          Histórico
        </button>
        <button className="quick-action" onClick={() => go("chat")}>
          <span>
            <MessageCircle size={19} />
          </span>
          Chat
        </button>
      </div>

      <BottomNav role="student" active="dashboard" go={go} />

      {personaisModal && (
        <Sheet
          title="Vincular a um Personal Trainer"
          close={() => setPersonaisModal(false)}
        >
          <p className="sheet-copy">
            Selecione um profissional habilitado com CREF validado para
            prescrever seus treinos:
          </p>
          {loadingPersonais && (
            <div className="api-inline-loading">
              <i /> Buscando personais certificados…
            </div>
          )}
          {!loadingPersonais && availablePersonais.length === 0 && (
            <EmptyState
              icon={<UserCheck size={32} />}
              title="Nenhum personal com CREF ativo"
              copy="Aguarde novos profissionais serem homologados pelos administradores."
            />
          )}
          <div className="assign-list" style={{ marginTop: "12px" }}>
            {availablePersonais.map(p => (
              <button
                key={p.id}
                onClick={() => solicitarVinculo(p.id, p.nome)}
                style={{ textAlign: "left", justifyContent: "space-between" }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <Avatar name={p.nome} />
                  <div>
                    <strong>{p.nome}</strong>
                    <small>
                      {p.cref} · {p.atuacao_principal}
                    </small>
                  </div>
                </div>
                <StatusBadge
                  type={p.vinculo_status === "pending" ? "warning" : "coral"}
                >
                  {p.vinculo_status === "pending" ? "Pendente" : "Solicitar"}
                </StatusBadge>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

const setCount = ex =>
  Math.max(1, Math.min(20, parseInt(ex.series_padrao, 10) || 3));
export function WorkoutScreen({ workout, back, finish, openRest, notify }) {
  const [exercises, setExercises] = useState([]);
  const [loads, setLoads] = useState({});
  const [reps, setReps] = useState({});
  const [done, setDone] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [fullscreenExercise, setFullscreenExercise] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = totalSeconds => {
    const min = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const sec = String(totalSeconds % 60).padStart(2, "0");
    return `${min}:${sec}`;
  };

  useEffect(() => {
    let mounted = true;
    async function loadWorkoutDetails() {
      if (workout && workout.exercicios && workout.exercicios.length > 0) {
        setExercises(workout.exercicios);
        initLoadsAndReps(workout.exercicios);
        setLoading(false);
        return;
      }

      if (mounted) {
        setLoading(false);
        notify("Selecione a ficha na biblioteca para iniciar.", "warning");
      }
    }

    loadWorkoutDetails();
    return () => {
      mounted = false;
    };
  }, [workout]);

  const initLoadsAndReps = items => {
    const initialLoads = {};
    const initialReps = {};
    items.forEach((ex, idx) => {
      for (let s = 1; s <= setCount(ex); s++) {
        const key = `${idx}-${s}`;
        initialLoads[key] = ex.carga_padrao || "0";
        const prescribed = String(ex.reps_padrao || "").match(
          /^\s*(\d+)(?:\s*-\s*\d+)?(?:\s*reps?)?\s*$/i
        );
        initialReps[key] = prescribed ? prescribed[1] : "";
      }
    });
    setLoads(initialLoads);
    setReps(initialReps);
  };

  const toggleSet = key => {
    const isCompleted = done.includes(key);
    if (!isCompleted) {
      openRest(
        parseInt(exercises[Number(key.split("-")[0])]?.descanso_padrao, 10) ||
          60
      );
      setDone([...done, key]);
    } else {
      setDone(done.filter(item => item !== key));
    }
  };

  const saveExecution = async () => {
    if (exercises.length === 0) {
      notify("Nenhum exercício registrado para este treino.", "warning");
      finish();
      return;
    }

    if (!workout?.id || !done.length) {
      notify("Selecione um treino e conclua pelo menos uma série.", "warning");
      return;
    }
    if (
      done.some(
        key =>
          !String(reps[key] ?? "").trim() ||
          !Number.isInteger(Number(reps[key])) ||
          Number(reps[key]) < 0 ||
          !String(loads[key] ?? "").trim() ||
          !Number.isFinite(Number(String(loads[key]).replace(",", "."))) ||
          Number(String(loads[key]).replace(",", ".")) < 0
      )
    ) {
      notify(
        "Informe a carga e a quantidade real de repetições nas séries concluídas.",
        "warning"
      );
      return;
    }
    setSaving(true);
    const seriesExecutadas = [];

    exercises.forEach((ex, idx) => {
      for (let s = 1; s <= setCount(ex); s++) {
        const key = `${idx}-${s}`;
        seriesExecutadas.push({
          exercise_id: ex.exercise_id,
          nome: ex.nome,
          serie: s,
          carga: done.includes(key)
            ? Number(String(loads[key]).replace(",", "."))
            : 0,
          reps: done.includes(key) ? Number(reps[key]) : 0,
          concluido: done.includes(key),
        });
      }
    });

    try {
      await api.salvarExecucaoTreino({
        treino_id: workout?.id,
        duracao_segundos: seconds,
        series_executadas: seriesExecutadas,
      });
      notify("Treino salvo com sucesso no seu histórico!");
      finish();
    } catch (err) {
      notify(err.message || "Erro ao persistir execução do treino.", "error");
    } finally {
      setSaving(false);
    }
  };

  const notifyVideoUnavailable = () => {
    notify(
      "Finalize o treino e grave, selecione ou envie o link do vídeo na tela Evolução.",
      "info"
    );
  };

  return (
    <section className="screen workout-screen">
      <header className="workout-header">
        <BackButton onClick={back} />
        <div className="timer-display">
          <span>EM ANDAMENTO</span>
          <b>{formatTimer(seconds)}</b>
        </div>
        <button
          className="icon-button danger"
          onClick={back}
          aria-label="Cancelar treino"
        >
          <X size={21} />
        </button>
      </header>

      <div className="workout-content">
        <div className="workout-overview">
          <div>
            <span className="eyebrow">
              {workout?.titulo || "FICHA DE TREINO"}
            </span>
            <h2>Faça no seu ritmo.</h2>
          </div>
          <StatusBadge type="coral">{exercises.length} EXERCÍCIOS</StatusBadge>
        </div>

        {loading && (
          <div className="exercise-loading-grid">
            <div className="exercise-skeleton">
              <i />
              <span />
            </div>
          </div>
        )}

        {!loading && exercises.length === 0 && (
          <EmptyState
            icon={<Dumbbell size={32} />}
            title="Nenhum exercício na ficha"
            copy="Consulte a biblioteca para selecionar exercícios antes de iniciar."
          />
        )}

        {!loading &&
          exercises.map((exercise, index) => (
            <article
              className="exercise-card"
              key={exercise.id || `${exercise.nome}-${index}`}
            >
              <div className="exercise-heading">
                <button
                  className="gif-trigger"
                  onClick={() => setFullscreenExercise(exercise)}
                  aria-label={`Abrir demonstração de ${exercise.nome}`}
                >
                  <ExerciseThumb
                    tint="coral"
                    small
                    image={exercise.gif_url}
                    alt={`Como fazer ${exercise.nome}`}
                  />
                </button>
                <div>
                  <h3>{exercise.nome}</h3>
                  <p>
                    {exercise.grupo_muscular} <span>·</span>{" "}
                    {exercise.series_padrao || "3"} séries ·{" "}
                    {exercise.reps_padrao} <span>·</span>{" "}
                    {exercise.descanso_padrao || "60s"}
                  </p>
                </div>
              </div>

              <div className="set-table">
                <div className="set-labels">
                  <span>SÉRIE</span>
                  <span>CARGA (KG)</span>
                  <span>REPS</span>
                  <span />
                </div>
                {Array.from(
                  { length: setCount(exercise) },
                  (_, i) => i + 1
                ).map(set => {
                  const key = `${index}-${set}`;
                  const checked = done.includes(key);
                  return (
                    <div
                      className={`set-row ${checked ? "done" : ""}`}
                      key={key}
                    >
                      <button
                        className="set-check"
                        onClick={() => toggleSet(key)}
                        aria-label={`Concluir série ${set}`}
                      >
                        <i className="check-circle">
                          {checked && <Check size={13} />}
                        </i>
                        {set}
                      </button>
                      <label className="load-input">
                        <input
                          inputMode="decimal"
                          value={loads[key] || ""}
                          onChange={e =>
                            setLoads({ ...loads, [key]: e.target.value })
                          }
                          aria-label={`Carga da série ${set}`}
                        />
                        <span>kg</span>
                      </label>
                      <label className="load-input" style={{ width: "55px" }}>
                        <input
                          inputMode="numeric"
                          value={reps[key] || ""}
                          onChange={e =>
                            setReps({ ...reps, [key]: e.target.value })
                          }
                          aria-label={`Repetições da série ${set}`}
                        />
                        <span>reps</span>
                      </label>
                      <span>{checked ? "Feito" : "Toque"}</span>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="video-feedback"
                onClick={notifyVideoUnavailable}
              >
                <Camera size={16} /> Enviar feedback por vídeo
              </button>
            </article>
          ))}
      </div>

      <div className="workout-footer">
        <PrimaryButton onClick={saveExecution} disabled={saving}>
          {saving ? "Salvando sessão…" : "Finalizar e salvar treino"}{" "}
          <CheckCircle2 size={19} />
        </PrimaryButton>
      </div>

      {fullscreenExercise && (
        <FullscreenGif
          exercise={fullscreenExercise}
          close={() => setFullscreenExercise(null)}
        />
      )}
    </section>
  );
}

export function LibraryScreen({ go, back, onSelectWorkout }) {
  const [treinosBanco, setTreinosBanco] = useState([]),
    [treinosError, setTreinosError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .getAlunoTreinos()
      .then(data => {
        if (live)
          setTreinosBanco([
            ...(data.atribuidos || []),
            ...(data.modelos_biblioteca || []),
          ]);
      })
      .catch(e => {
        if (live) setTreinosError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="screen library-screen">
      <Header
        title="Biblioteca de Exercícios"
        subtitle="Demonstrações reais e treinos catalogados"
        back={back}
      />

      {treinosError && (
        <div className="inline-banner error" role="alert">
          <CircleAlert size={16} /> Não foi possível carregar as fichas:{" "}
          {treinosError}
        </div>
      )}

      {treinosBanco.length > 0 && (
        <div style={{ marginBottom: "26px" }}>
          <div className="section-title">
            <div>
              <span className="eyebrow">SUAS FICHAS</span>
              <h2>Fichas e Modelos de Treino</h2>
            </div>
          </div>
          <div className="workout-library-grid">
            {treinosBanco.map(treino => (
              <article className="library-card" key={treino.id}>
                <div className={`library-visual ${treino.cor_tema || "coral"}`}>
                  <div className="library-lines" />
                  <ExerciseThumb tint={treino.cor_tema || "coral"} />
                  <span>{treino.tempo_estimado_min || 45} min</span>
                </div>
                <div className="library-body">
                  <StatusBadge type="coral">
                    {treino.nivel || "Intermediário"}
                  </StatusBadge>
                  <h3>{treino.titulo}</h3>
                  <p>{treino.descricao || "Ficha completa"}</p>
                  <div className="library-actions">
                    <button
                      disabled={!treino.exercicios?.length}
                      onClick={() => onSelectWorkout(treino)}
                    >
                      {treino.exercicios?.length
                        ? "Iniciar este"
                        : "Sem exercícios cadastrados"}
                    </button>
                    <PrimaryButton
                      disabled={!treino.exercicios?.length}
                      onClick={() => onSelectWorkout(treino)}
                      className="mini-button"
                    >
                      <Play size={15} fill="currentColor" />
                    </PrimaryButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <CatalogBrowser />
      <BottomNav role="student" active="workout" go={go} />
    </section>
  );
}

export function NutritionScreen({ go, back, notify }) {
  const [foodOpen, setFoodOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadNutrition = async () => {
    try {
      const res = await api.getAlunoDashboard();
      setData(res);
    } catch (err) {
      notify(err.message || "Erro ao carregar dados nutricionais.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNutrition();
    const timer = setInterval(loadNutrition, 60000);
    window.addEventListener("focus", loadNutrition);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", loadNutrition);
    };
  }, []);

  const addWater = async amount => {
    try {
      const res = await api.registrarHidratacao(amount);
      if (res && res.nutricao) {
        setData(prev =>
          prev
            ? {
                ...prev,
                nutricao_hoje: {
                  ...prev.nutricao_hoje,
                  agua_ml: res.nutricao.agua_ml,
                },
              }
            : prev
        );
        notify(`+${amount} ml adicionados.`);
      }
    } catch (err) {
      notify(err.message || "Erro ao registrar hidratação.", "error");
    }
  };

  if (loading) {
    return (
      <section className="screen nutrition-screen">
        {data?.perfil?.metas_pendentes && (
          <p className="chart-card" role="status">
            Metas pendentes: complete nascimento e os dados metabólicos em
            Perfil. Os registros de consumo continuam disponíveis.
            <button onClick={() => go("profile")}>Completar perfil</button>
          </p>
        )}
        <Header
          title="Nutrição"
          subtitle="Metas baseadas no seu objetivo"
          back={back}
        />

        <div
          className="exercise-skeleton"
          style={{ height: "180px", margin: "20px 0" }}
        >
          <i />
        </div>
      </section>
    );
  }

  const perfil = data?.perfil || {};
  const nutricao = data?.nutricao_hoje || {
    agua_ml: 0,
    calorias_consumidas: 0,
    proteinas_g: 0,
    carboidratos_g: 0,
    gorduras_g: 0,
    refeicoes: [],
  };

  let refeicoes = [];
  if (Array.isArray(nutricao.refeicoes)) {
    refeicoes = nutricao.refeicoes;
  } else if (typeof nutricao.refeicoes === "string") {
    try {
      refeicoes = JSON.parse(nutricao.refeicoes);
    } catch {
      refeicoes = [];
    }
  }

  const metaCal = perfil.meta_calorias_kcal || 0;
  const metaProt = perfil.meta_proteinas_g || 0;
  const metaCarb = perfil.meta_carboidratos_g || 0;
  const metaGord = perfil.meta_gorduras_g || 0;
  const metaAgua = perfil.meta_agua_ml || 0;

  const calPercent = Math.min(
    100,
    Math.round((nutricao.calorias_consumidas / (metaCal || Infinity)) * 100)
  );

  return (
    <section className="screen nutrition-screen">
      {data?.perfil?.metas_pendentes && (
        <p className="chart-card" role="status">
          Metas pendentes: complete nascimento e os dados metabólicos em Perfil.
          Os registros de consumo continuam disponíveis.
          <button onClick={() => go("profile")}>Completar perfil</button>
        </p>
      )}
      <Header
        title="Nutrição"
        subtitle="Metas baseadas no seu objetivo"
        back={back}
      />

      {!!data?.nutricao_hoje?.nutrientes_totais?.ausentes?.length && (
        <p className="inline-banner warning">
          O diário contém nutrientes não informados pela fonte. Alguns totais
          são parciais.
        </p>
      )}
      {nutricao.nutrientes_totais?.valores && (
        <details className="chart-card">
          <summary>Vitaminas, minerais e nutrientes do dia</summary>
          {Object.entries(nutricao.nutrientes_totais.valores).map(([k, v]) => (
            <p key={k}>
              {k.replaceAll("_", " ")}:{" "}
              {v === null
                ? "Não informado / total parcial"
                : Number(v).toLocaleString("pt-BR", {
                    maximumFractionDigits: 3,
                  })}
            </p>
          ))}
        </details>
      )}
      <div className="metabolic-card">
        <div>
          <span className="eyebrow">PAINEL METABÓLICO</span>
          <h2>Consistência também se come.</h2>
        </div>
        <div className="metabolic-content">
          <div
            className="progress-ring ring-large"
            style={{ "--progress": `${calPercent}%` }}
          >
            <div>
              <b>
                {Number(nutricao.calorias_consumidas).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
              </b>
              <span>/ {metaCal || "—"} kcal</span>
            </div>
          </div>
          <div className="macro-list">
            <Macro
              label="Proteínas"
              value={`${Number(nutricao.proteinas_g || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}g`}
              target={`${metaProt}g`}
              percent={`${Math.min(100, Math.round(((nutricao.proteinas_g || 0) / metaProt) * 100))}%`}
              color="coral"
            />
            <Macro
              label="Carboidratos"
              value={`${Number(nutricao.carboidratos_g || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}g`}
              target={`${metaCarb}g`}
              percent={`${Math.min(100, Math.round(((nutricao.carboidratos_g || 0) / metaCarb) * 100))}%`}
              color="orange"
            />
            <Macro
              label="Gorduras"
              value={`${Number(nutricao.gorduras_g || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}g`}
              target={`${metaGord}g`}
              percent={`${Math.min(100, Math.round(((nutricao.gorduras_g || 0) / metaGord) * 100))}%`}
              color="purple"
            />
          </div>
        </div>
      </div>

      <div className="section-title">
        <div>
          <span className="eyebrow">REGISTRO DE HOJE</span>
          <h2>Alimentação</h2>
        </div>
        <button
          className="text-link"
          aria-label="Adicionar refeição"
          onClick={() => setFoodOpen(true)}
        >
          + Adicionar
        </button>
      </div>

      {refeicoes.length === 0 ? (
        <EmptyState
          icon={<Apple size={30} />}
          title="Nenhuma refeição registrada hoje"
          copy="Clique em '+ Adicionar' para registrar seu café, almoço ou jantar e atualizar seus macros."
        />
      ) : (
        refeicoes.map((meal, index) => (
          <div className="meal-card" key={meal.id || index}>
            <div className="meal-icon">
              <Utensils size={19} />
            </div>
            <div>
              <strong>{meal.titulo}</strong>
              <p>
                {meal.itens ||
                  `${meal.proteinas}g prot, ${meal.carboidratos}g carb`}
              </p>
            </div>
            <b>
              {Number(meal.kcal).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}{" "}
              <small>kcal</small>
            </b>
          </div>
        ))
      )}

      <section className="hydration-card">
        <div className="hydration-head">
          <div className="meal-icon blue">
            <Droplets size={19} />
          </div>
          <div>
            <strong>Hidratação</strong>
            <p>
              {(nutricao.agua_ml / 1000).toFixed(2).replace(".", ",")} L de{" "}
              {(metaAgua / 1000).toFixed(1).replace(".", ",")} L
            </p>
          </div>
        </div>
        <div className="water-progress">
          <i
            style={{
              width: `${Math.min(100, (nutricao.agua_ml / (metaAgua || Infinity)) * 100)}%`,
            }}
          />
        </div>
        <div className="water-options">
          {[200, 300, 500].map(amount => (
            <button key={amount} onClick={() => addWater(amount)}>
              +{amount} ml
            </button>
          ))}
        </div>
      </section>

      <BottomNav role="student" active="nutrition" go={go} />

      {foodOpen && (
        <FoodSheet
          close={() => setFoodOpen(false)}
          notify={notify}
          onAdded={loadNutrition}
        />
      )}
    </section>
  );
}

export function FoodSheet(props) {
  return (
    <NutritionFoodSheet {...props} manual={<ManualFoodSheet {...props} />} />
  );
}

export function ManualFoodSheet({ close, notify, onAdded }) {
  const [titulo, setTitulo] = useState("");
  const [itens, setItens] = useState("");
  const [kcal, setKcal] = useState("");
  const [proteinas, setProteinas] = useState("");
  const [carboidratos, setCarboidratos] = useState("");
  const [gorduras, setGorduras] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (!titulo.trim() || !kcal) {
      notify("Informe o título e as calorias.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      await api.adicionarRefeicao({
        titulo: titulo.trim(),
        itens: itens.trim(),
        kcal: Number(kcal),
        proteinas: Number(proteinas) || 0,
        carboidratos: Number(carboidratos) || 0,
        gorduras: Number(gorduras) || 0,
      });
      notify("Refeição registrada no diário com sucesso.");
      onAdded();
      close();
    } catch (err) {
      notify(err.message || "Erro ao salvar refeição.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet title="Adicionar Refeição" close={close}>
      <form
        onSubmit={submit}
        className="stack-form"
        style={{ marginTop: "12px" }}
      >
        <InputField
          icon={<Utensils size={18} />}
          label="Título da Refeição *"
          placeholder="Ex.: Café da Manhã, Almoço"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          required
        />
        <InputField
          icon={<Apple size={18} />}
          label="Alimentos consumidos"
          placeholder="Ex.: 3 ovos mexidos, aveia e banana"
          value={itens}
          onChange={e => setItens(e.target.value)}
        />
        <div className="field-pair">
          <InputField
            icon={<Flame size={18} />}
            label="Calorias (kcal) *"
            placeholder="Ex.: 450"
            type="number"
            value={kcal}
            onChange={e => setKcal(e.target.value)}
            required
          />
          <InputField
            icon={<Activity size={18} />}
            label="Proteínas (g)"
            placeholder="Ex.: 30"
            type="number"
            value={proteinas}
            onChange={e => setProteinas(e.target.value)}
          />
        </div>
        <div className="field-pair">
          <InputField
            icon={<Activity size={18} />}
            label="Carboidratos (g)"
            placeholder="Ex.: 50"
            type="number"
            value={carboidratos}
            onChange={e => setCarboidratos(e.target.value)}
          />
          <InputField
            icon={<Activity size={18} />}
            label="Gorduras (g)"
            placeholder="Ex.: 15"
            type="number"
            value={gorduras}
            onChange={e => setGorduras(e.target.value)}
          />
        </div>

        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar no Diário"} <Plus size={18} />
        </PrimaryButton>
      </form>
    </Sheet>
  );
}

export function ChatScreen({ user, go, back, notify }) {
  const [conversas, setConversas] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadConversas = async () => {
    try {
      const data = await api.getConversas();
      setConversas(data || []);
      if (data && data.length > 0) {
        setSelectedContact(data[0]);
      }
    } catch (err) {
      notify(err.message || "Erro ao carregar contatos do chat.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversas();
  }, []);

  const loadMessages = async contactId => {
    if (!contactId) return;
    try {
      const msgs = await api.getMensagens(contactId);
      setMessages(msgs || []);
    } catch (err) {
      console.error("Erro ao carregar mensagens:", err);
    }
  };

  useEffect(() => {
    if (!selectedContact) return;
    let active = true,
      busy = false;
    setMessages([]);
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const msgs = await api.getMensagens(selectedContact.id);
        if (active) setMessages(msgs || []);
      } catch (err) {
        if (active) notify(err.message, "error");
      } finally {
        busy = false;
      }
    };
    refresh();
    const events =
      typeof EventSource !== "undefined"
        ? new EventSource("/api/chat/eventos")
        : null;
    let connected = false;
    if (events) {
      events.onopen = () => {
        connected = true;
        refresh();
      };
      events.onmessage = refresh;
      events.onerror = () => {
        connected = false;
      };
    }
    const timer = setInterval(() => {
      if (!connected) refresh();
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
      events?.close();
    };
  }, [selectedContact]);

  const send = async () => {
    if (!text.trim() || !selectedContact || sending) return;
    setSending(true);
    try {
      const res = await api.enviarMensagem({
        destinatario_id: selectedContact.id,
        texto: text.trim(),
        video_url: videoUrl || null,
        tipo: videoUrl ? "video_feedback" : "texto",
      });
      if (res && res.mensagem) {
        setMessages(prev => [...prev, res.mensagem]);
        setText("");
        setVideoUrl("");
      }
    } catch (err) {
      notify(err.message || "Erro ao enviar mensagem.", "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <section className="screen chat-screen">
        <header className="chat-header">
          <BackButton onClick={back} />
          <div>Carregando chat seguro…</div>
        </header>
      </section>
    );
  }

  if (conversas.length === 0) {
    return (
      <section className="screen chat-screen">
        <header className="chat-header">
          <BackButton onClick={back} />
          <div className="chat-person">
            <strong>Chat FitTrack</strong>
            <span>Comunicação direta</span>
          </div>
        </header>
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <EmptyState
            icon={<ShieldCheck size={36} />}
            title="Nenhum personal trainer vinculado"
            copy="Por segurança, as mensagens são restritas a alunos e personais com vínculo ativo na plataforma. Vincule-se a um personal para liberar o canal."
          />
          <PrimaryButton
            onClick={() => go("student-dashboard")}
            style={{ marginTop: "20px" }}
          >
            Voltar ao Início
          </PrimaryButton>
        </div>
        <BottomNav role="student" active="chat" go={go} />
      </section>
    );
  }

  return (
    <section className="screen chat-screen">
      <header className="chat-header">
        <BackButton onClick={back} />
        <Avatar name={selectedContact?.nome} size="md" active />
        <div className="chat-person">
          <strong>{selectedContact?.nome}</strong>
          <span>
            <i /> Vínculo ativo
          </span>
        </div>
      </header>

      <div className="chat-context">
        <ShieldCheck size={15} /> Conversa criptografada e restrita entre aluno
        e personal
      </div>

      <div className="messages">
        {messages.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              color: "var(--muted)",
              padding: "30px 0",
            }}
          >
            Inicie a conversa com seu instrutor enviando uma mensagem abaixo.
          </p>
        ) : (
          messages.map(message => {
            const isMe = Number(message.remetente_id) === Number(user.id);
            const time = message.enviado_em
              ? new Date(message.enviado_em).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "agora";

            return (
              <div
                className={`message ${isMe ? "student" : "personal"}`}
                key={message.id}
              >
                <p>{message.texto}</p>
                {message.video_url &&
                  /^https:\/\//i.test(message.video_url) && (
                    <a
                      href={message.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir vídeo
                    </a>
                  )}
                <span>{time}</span>
              </div>
            );
          })
        )}
      </div>

      <label className="search-field">
        Link HTTPS do vídeo (opcional)
        <input
          type="url"
          value={videoUrl}
          onChange={e => setVideoUrl(e.target.value)}
        />
      </label>
      <div className="chat-input">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") send();
          }}
          placeholder="Digite uma mensagem ao seu instrutor"
          disabled={sending}
        />
        <button
          className="send-button"
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label="Enviar mensagem"
        >
          <Send size={18} />
        </button>
      </div>

      <BottomNav role="student" active="chat" go={go} />
    </section>
  );
}

export function HistoryScreen({ go, back }) {
  const [executions, setExecutions] = useState([]);
  return (
    <section className="screen history-screen">
      <Header
        title="Evolução"
        subtitle="Seu desempenho em movimento"
        back={back}
      />
      <HistoryExplorer onExecutions={setExecutions} />
      <StudentFeedbackPanel executions={executions} />
      <BottomNav role="student" active="dashboard" go={go} />
    </section>
  );
}
