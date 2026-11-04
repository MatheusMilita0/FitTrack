import { CatalogBrowser } from "./CatalogBrowser.jsx";
("use strict");
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Dumbbell,
  GripVertical,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Video,
  Zap,
  ChevronRight,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { ProfessionalFeedback, EvolutionSheet } from "./FeedbackPanels.jsx";
import {
  Avatar,
  BottomNav,
  EmptyState,
  ExerciseThumb,
  Header,
  InputField,
  KPI,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "./UIComponents.jsx";

export function PersonalDashboard({ user, profile, go, openAccount }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .getPersonalDashboard()
      .then(res => setData(res))
      .catch(err => console.error("Erro no dashboard do personal:", err));
  }, []);

  const alunosAtivos = data?.alunos_ativos || 0;
  const alunosPendentes = data?.alunos_pendentes || 0;
  const totalTreinos = data?.total_treinos || 0;

  return (
    <section className="screen dashboard-screen personal-dashboard">
      <div className="top-row personal-top">
        <div className="personal-info">
          <button className="avatar-button" onClick={openAccount}>
            <Avatar name={user.nome} size="lg" active />
          </button>
          <div>
            <p className="date-line">PERSONAL TRAINER</p>
            <h1>{user.nome}</h1>
            <span className="cref">{profile?.cref || "CREF Registrado"}</span>
          </div>
        </div>
      </div>

      <StatusBadge
        type={profile?.status_cref === "Validado" ? "success" : "warning"}
      >
        <ShieldCheck size={13} /> CREF {profile?.status_cref || "VALIDADO"}
      </StatusBadge>

      <section className="personal-lead" style={{ marginTop: "16px" }}>
        <div className="lead-mark">
          <Zap size={22} />
        </div>
        <div>
          <span className="eyebrow">SEU PAINEL PROFISSIONAL</span>
          <h2>Movimente resultados.</h2>
          <p>
            {alunosAtivos} alunos sob acompanhamento ativo e {alunosPendentes}{" "}
            solicitações pendentes.
          </p>
        </div>
      </section>

      <div className="kpi-grid">
        <KPI
          value={String(alunosAtivos).padStart(2, "0")}
          label="Alunos ativos"
          icon={<Users size={19} />}
          onClick={() => go("students")}
        />
        <KPI
          value={String(alunosPendentes).padStart(2, "0")}
          label="Solicitações pendentes"
          icon={<UserPlus size={19} />}
          onClick={() => go("students")}
          accent={alunosPendentes > 0}
        />
        <KPI
          value={String(totalTreinos).padStart(2, "0")}
          label="Fichas criadas"
          icon={<Dumbbell size={19} />}
          onClick={() => go("create-workout")}
        />
        <KPI
          value="00"
          label="Feedbacks pendentes"
          icon={<Video size={19} />}
          onClick={() => go("feedback")}
        />
      </div>

      <div className="personal-actions" style={{ marginTop: "24px" }}>
        <button onClick={() => go("create-workout")}>
          <Dumbbell size={20} />
          <span>
            Montar
            <br />
            treino
          </span>
        </button>
        <button onClick={() => go("assign-workout")}>
          <UserCheck size={20} />
          <span>
            Atribuir
            <br />
            treino
          </span>
        </button>
        <button onClick={() => go("students")}>
          <Users size={20} />
          <span>
            Meus
            <br />
            alunos
          </span>
        </button>
      </div>

      <WorkoutManagement go={go} />
      <BottomNav role="personal" active="dashboard" go={go} />
    </section>
  );
}

export function StudentsScreen({ go, back, notify }) {
  const [evolution, setEvolution] = useState(null);
  const [tab, setTab] = useState("active");
  const [alunos, setAlunos] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAlunos = async () => {
    try {
      const data = await api.getPersonalAlunos();
      setAlunos(data || []);
    } catch (err) {
      notify(err.message || "Erro ao carregar alunos.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlunos();
  }, []);

  const handleUpdateStatus = async (vinculoId, status, nomeAluno) => {
    try {
      await api.atualizarVinculo(vinculoId, status);
      notify(
        status === "active"
          ? `${nomeAluno} foi aprovado(a) como seu aluno.`
          : `Solicitação de ${nomeAluno} foi recusada.`
      );
      loadAlunos();
    } catch (err) {
      notify(err.message || "Erro ao atualizar vínculo.", "error");
    }
  };

  const ativos = alunos.filter(a => a.vinculo_status === "active");
  const pendentes = alunos.filter(a => a.vinculo_status === "pending");

  return (
    <section className="screen students-screen">
      <Header
        title="Meus Alunos"
        subtitle="Acompanhe cada vínculo"
        back={back}
      />

      <div className="segmented">
        <button
          className={tab === "active" ? "selected" : ""}
          onClick={() => setTab("active")}
        >
          Ativos <span>{ativos.length}</span>
        </button>
        <button
          className={tab === "pending" ? "selected" : ""}
          onClick={() => setTab("pending")}
        >
          Pendentes <span>{pendentes.length}</span>
        </button>
      </div>

      <div className="student-list" style={{ marginTop: "16px" }}>
        {loading && (
          <div className="api-inline-loading">
            <i /> Carregando alunos vinculados…
          </div>
        )}

        {!loading && tab === "active" && ativos.length === 0 && (
          <EmptyState
            icon={<Users size={32} />}
            title="Nenhum aluno ativo no momento"
            copy="Assim que alunos solicitarem vínculo ou você aceitar pendências, eles aparecerão aqui."
          />
        )}

        {!loading &&
          tab === "active" &&
          ativos.map(aluno => (
            <article className="student-card" key={aluno.vinculo_id}>
              <Avatar name={aluno.nome} />
              <div className="student-details">
                <strong>{aluno.nome}</strong>
                <button onClick={() => setEvolution(aluno)}>
                  Ver evolução
                </button>
                <button
                  onClick={() =>
                    handleUpdateStatus(
                      aluno.vinculo_id,
                      "terminated",
                      aluno.nome
                    )
                  }
                >
                  Encerrar vínculo
                </button>
                <p>{aluno.objetivo || "Acompanhamento geral"}</p>
                <span>
                  Meta: {aluno.meta_treinos_semana || 4}x/semana ·{" "}
                  {aluno.peso_kg || "--"}kg
                </span>
              </div>
              <button
                className="icon-button subtle"
                onClick={() => go("personal-chat")}
                title="Abrir chat"
              >
                <MessageCircle size={18} />
              </button>
            </article>
          ))}

        {!loading && tab === "pending" && pendentes.length === 0 && (
          <EmptyState
            icon={<UserCheck size={32} />}
            title="Sem solicitações pendentes"
            copy="Você está em dia com todas as solicitações de acompanhamento."
          />
        )}

        {!loading &&
          tab === "pending" &&
          pendentes.map(aluno => (
            <article className="student-card" key={aluno.vinculo_id}>
              <Avatar name={aluno.nome} />
              <div className="student-details">
                <strong>{aluno.nome}</strong>
                <button onClick={() => setEvolution(aluno)}>
                  Ver evolução
                </button>
                <button
                  onClick={() =>
                    handleUpdateStatus(
                      aluno.vinculo_id,
                      "terminated",
                      aluno.nome
                    )
                  }
                >
                  Encerrar vínculo
                </button>
                <p>Objetivo: {aluno.objetivo || "Hipertrofia"}</p>
                <span>
                  Solicitado em:{" "}
                  {new Date(aluno.vinculo_criado_em).toLocaleDateString()}
                </span>
              </div>
              <div className="student-actions">
                <button
                  className="approve"
                  onClick={() =>
                    handleUpdateStatus(aluno.vinculo_id, "active", aluno.nome)
                  }
                  title="Aprovar aluno"
                >
                  <Check size={16} />
                </button>
                <button
                  className="decline"
                  onClick={() =>
                    handleUpdateStatus(aluno.vinculo_id, "rejected", aluno.nome)
                  }
                  title="Recusar solicitação"
                >
                  <X size={16} />
                </button>
              </div>
            </article>
          ))}
      </div>

      {evolution && (
        <EvolutionSheet aluno={evolution} close={() => setEvolution(null)} />
      )}
      <BottomNav role="personal" active="students" go={go} />
    </section>
  );
}

export function CreateWorkoutScreen({
  go,
  back,
  notify,
  initialWorkout,
  saveWorkout,
}) {
  const [titulo, setTitulo] = useState(initialWorkout?.titulo || "");
  const [descricao, setDescricao] = useState(initialWorkout?.descricao || "");
  const [nivel, setNivel] = useState(initialWorkout?.nivel || "Intermediário");
  const [tempo, setTempo] = useState(initialWorkout?.tempo_estimado_min || 45);
  const [corTema] = useState("coral");
  const [eModelo, setEModelo] = useState(initialWorkout?.e_modelo || false);
  const [items, setItems] = useState(initialWorkout?.exercicios || []);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const addExercise = ex => {
    setItems([
      ...items,
      {
        exercise_id: ex.exerciseId,
        nome: ex.name,
        grupo_muscular: ex.bodyParts?.[0] || "geral",
        series_padrao: "3 × 12 reps",
        reps_padrao: "12",
        descanso_padrao: "75s",
        carga_padrao: "0",
        gif_url: ex.imageUrl || "",
        notas: ex.instructions?.length
          ? ex.instructions.join("\n")
          : "Instruções ausentes na base. Revisão profissional necessária.",
      },
    ]);
    setQuery("");
  };

  const removeExercise = idx => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSave = async (andAssign = false) => {
    if (!titulo.trim()) {
      notify("Informe o título do treino.", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        nivel,
        tempo_estimado_min: Number(tempo) || 45,
        cor_tema: corTema,
        e_modelo: Boolean(eModelo),
        exercicios: items.map((it, idx) => ({
          ordem: idx + 1,
          exercise_id: it.exercise_id,
          nome: it.nome,
          grupo_muscular: it.grupo_muscular,
          series_padrao: it.series_padrao || "3 × 12 reps",
          reps_padrao: it.reps_padrao || "12",
          descanso_padrao: it.descanso_padrao || "75s",
          carga_padrao: it.carga_padrao || "0",
          gif_url: it.gif_url || "",
          notas: it.notas || null,
        })),
      };

      if (saveWorkout) await saveWorkout(payload);
      else if (initialWorkout)
        await api.editarTreino(initialWorkout.id, payload);
      else await api.criarTreino(payload);
      notify(`Treino '${titulo}' criado com sucesso!`);
      if (andAssign) {
        go("assign-workout");
      } else {
        go("personal-dashboard");
      }
    } catch (err) {
      notify(
        err.message || "Erro ao salvar treino no banco de dados.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="screen create-screen">
      <header className="creation-header">
        <button className="text-link" onClick={back}>
          Cancelar
        </button>
        <h1>Novo treino</h1>
        <button
          className="text-link"
          onClick={() => handleSave(false)}
          disabled={saving}
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </header>

      <label className="field-label">
        Título do treino *
        <span className="input-box">
          <Dumbbell size={18} />
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Ex.: Treino A - Peito e Tríceps"
            required
          />
        </span>
      </label>

      <label className="field-label">
        Descrição e observações
        <textarea
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="Foco em hipertrofia e cadência controlada"
        />
      </label>

      <div className="field-pair">
        <label className="field-label">
          Nível
          <div className="select-field">
            <select value={nivel} onChange={e => setNivel(e.target.value)}>
              <option value="Iniciante">Iniciante</option>
              <option value="Intermediário">Intermediário</option>
              <option value="Avançado">Avançado</option>
            </select>
          </div>
        </label>

        <InputField
          icon={<Zap size={18} />}
          label="Tempo Estimado (min)"
          type="number"
          value={tempo}
          onChange={e => setTempo(e.target.value)}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          margin: "10px 0",
        }}
      >
        <input
          type="checkbox"
          id="modeloCheck"
          checked={eModelo}
          onChange={e => setEModelo(e.target.checked)}
        />
        <label
          htmlFor="modeloCheck"
          style={{ fontSize: "13px", cursor: "pointer" }}
        >
          Disponibilizar como modelo geral na biblioteca
        </label>
      </div>

      <div className="section-title create-title">
        <div>
          <span className="eyebrow">CATÁLOGO EM PORTUGUÊS</span>
          <h2>Adicionar Exercícios</h2>
        </div>
        <span className="count-chip">{items.length}</span>
      </div>

      <label className="search-field">
        <Search size={18} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Nome de exercício manual (opcional)"
        />
      </label>

      <SecondaryButton
        onClick={() => {
          if (query.trim()) {
            setItems([
              ...items,
              {
                exercise_id: `manual-${Date.now()}`,
                nome: query.trim(),
                grupo_muscular: "Geral",
                series_padrao: "3 × 12",
                reps_padrao: "12",
                descanso_padrao: "60s",
                carga_padrao: "0",
              },
            ]);
            setQuery("");
          }
        }}
        disabled={!query.trim()}
      >
        Adicionar o nome digitado como exercício manual
      </SecondaryButton>
      <CatalogBrowser
        onSelect={addExercise}
        selectedIds={items.map(ex => ex.exercise_id)}
      />
      <div className="section-title create-title" style={{ marginTop: "24px" }}>
        <div>
          <span className="eyebrow">EXERCÍCIOS ADICIONADOS</span>
          <h2>Estrutura da Ficha</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "13px" }}>
          Nenhum exercício adicionado a este treino ainda.
        </p>
      ) : (
        <div className="added-list">
          {items.map((exercise, index) => (
            <article key={index} className="added-exercise">
              <GripVertical size={19} />
              <ExerciseThumb image={exercise.gif_url} small />
              <div className="added-body">
                <strong>{exercise.nome}</strong>
                <div className="exercise-inputs">
                  <label>
                    Séries
                    <input
                      value={exercise.series_padrao}
                      onChange={e => {
                        const copy = [...items];
                        copy[index].series_padrao = e.target.value;
                        setItems(copy);
                      }}
                    />
                  </label>
                  <label>
                    Reps
                    <input
                      value={exercise.reps_padrao}
                      onChange={e => {
                        const copy = [...items];
                        copy[index].reps_padrao = e.target.value;
                        setItems(copy);
                      }}
                    />
                  </label>
                  <label>
                    Carga
                    <input
                      value={exercise.carga_padrao}
                      onChange={e => {
                        const copy = [...items];
                        copy[index].carga_padrao = e.target.value;
                        setItems(copy);
                      }}
                    />
                  </label>
                </div>
              </div>
              <button
                className="delete-exercise"
                onClick={() => removeExercise(index)}
                aria-label="Excluir exercício"
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="creation-footer">
        <SecondaryButton onClick={() => handleSave(false)} disabled={saving}>
          Salvar treino
        </SecondaryButton>
        <PrimaryButton onClick={() => handleSave(true)} disabled={saving}>
          Salvar e atribuir <ArrowUpRight size={18} />
        </PrimaryButton>
      </div>
    </section>
  );
}

export function AssignWorkoutScreen({ go, back, notify }) {
  const [treinos, setTreinos] = useState([]);
  const [alunos, setAlunos] = useState([]);
  const [selectedTreinoId, setSelectedTreinoId] = useState("");
  const [selectedAlunoIds, setSelectedAlunoIds] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [days, setDays] = useState(["SEG", "QUA", "SEX"]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const weekdays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

  useEffect(() => {
    Promise.all([api.getPersonalTreinos(), api.getPersonalAlunos("active")])
      .then(([treinosData, alunosData]) => {
        setTreinos(treinosData || []);
        setAlunos(alunosData || []);
        if (treinosData?.length > 0) setSelectedTreinoId(treinosData[0].id);
        if (alunosData?.length > 0)
          setSelectedAlunoIds([Number(alunosData[0].aluno_id)]);
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = d => {
    if (days.includes(d)) {
      setDays(days.filter(item => item !== d));
    } else {
      setDays([...days, d]);
    }
  };

  const handleAssign = async () => {
    if (!selectedTreinoId || !selectedAlunoIds.length) {
      notify("Selecione o treino e o aluno.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      await api.atribuirTreino({
        treino_id: selectedTreinoId,
        aluno_ids: selectedAlunoIds,
        dias_semana: days,
      });
      notify("Treino prescrito e atribuído com sucesso!");
      go("students");
    } catch (err) {
      notify(err.message || "Erro ao prescrever treino.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="screen assign-screen">
        <Header title="Atribuir Treino" back={back} />
        <div className="api-inline-loading">
          <i /> Carregando fichas e alunos…
        </div>
      </section>
    );
  }

  return (
    <section className="screen assign-screen">
      <Header
        title="Atribuir Treino"
        subtitle="Prescrição individualizada"
        back={back}
      />

      <label className="field-label">
        Selecione o Treino
        <div className="select-field">
          <Dumbbell size={18} />
          <select
            value={selectedTreinoId}
            onChange={e => setSelectedTreinoId(e.target.value)}
          >
            {treinos.map(t => (
              <option key={t.id} value={t.id}>
                {t.titulo} ({t.nivel || "Geral"})
              </option>
            ))}
          </select>
          <ChevronRight size={17} />
        </div>
      </label>

      <p role="alert">{loadError}</p>
      {loadError && (
        <button
          onClick={() => {
            setLoading(true);
            Promise.all([
              api.getPersonalTreinos(),
              api.getPersonalAlunos("active"),
            ])
              .then(([t, a]) => {
                setTreinos(t);
                setAlunos(a);
                setLoadError("");
              })
              .catch(e => setLoadError(e.message))
              .finally(() => setLoading(false));
          }}
        >
          Tentar novamente
        </button>
      )}
      <fieldset className="chart-card">
        <legend>
          Alunos com vínculo ativo ({selectedAlunoIds.length} selecionados)
        </legend>
        {alunos.map(a => (
          <label key={a.aluno_id} className="account-item">
            <input
              type="checkbox"
              checked={selectedAlunoIds.includes(Number(a.aluno_id))}
              onChange={e =>
                setSelectedAlunoIds(ids =>
                  e.target.checked
                    ? [...ids, Number(a.aluno_id)]
                    : ids.filter(id => id !== Number(a.aluno_id))
                )
              }
            />
            {a.nome} · {a.objetivo || "Acompanhamento"}
          </label>
        ))}
      </fieldset>
      <div className="section-title" style={{ marginTop: "24px" }}>
        <div>
          <span className="eyebrow">FREQUÊNCIA PREVISTA</span>
          <h2>Dias da Semana</h2>
        </div>
      </div>

      <div className="days-row">
        {weekdays.map(day => {
          const on = days.includes(day);
          return (
            <button
              className={on ? "active" : ""}
              key={day}
              onClick={() => toggleDay(day)}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="assign-footer" style={{ marginTop: "30px" }}>
        <PrimaryButton
          disabled={submitting || treinos.length === 0 || alunos.length === 0}
          onClick={handleAssign}
        >
          {submitting ? "Prescrevendo…" : "Confirmar atribuição"}{" "}
          <Check size={18} />
        </PrimaryButton>
      </div>
    </section>
  );
}

export function FeedbackScreen({ go, back }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getPersonalFeedbacks()
      .then(data => setFeedbacks(data || []))
      .catch(err =>
        setError(err.message || "Não foi possível carregar as orientações.")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="screen feedback-screen">
      <Header
        title="Feedbacks e Vídeos"
        subtitle="Orientações técnicas"
        back={back}
      />

      {loading && (
        <div className="api-inline-loading">
          <i /> Buscando mensagens de orientação…
        </div>
      )}

      {error && (
        <div className="inline-banner error" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      )}

      {!loading && !error && feedbacks.length === 0 && (
        <EmptyState
          icon={<Video size={32} />}
          title="Nenhum feedback em vídeo pendente"
          copy="Orientações e dúvidas trocadas com seus alunos aparecem diretamente no canal de chat seguro."
        />
      )}

      {!loading &&
        feedbacks.map(item => (
          <ProfessionalFeedback
            key={item.id}
            item={item}
            onUpdated={() => api.getPersonalFeedbacks().then(setFeedbacks)}
          />
        ))}

      <BottomNav role="personal" active="dashboard" go={go} />
    </section>
  );
}

export function PersonalChatScreen({ go, back, notify }) {
  const [conversas, setConversas] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
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
        setSelectedStudent(data[0]);
      }
    } catch (err) {
      notify(err.message || "Erro ao carregar conversas.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversas();
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    let active = true,
      busy = false;
    setMessages([]);
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const msgs = await api.getMensagens(selectedStudent.id);
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
  }, [selectedStudent]);

  const send = async () => {
    if (!text.trim() || !selectedStudent || sending) return;
    setSending(true);
    try {
      const res = await api.enviarMensagem({
        destinatario_id: selectedStudent.id,
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
      <section className="screen personal-chat-screen">
        <Header title="Mensagens" back={back} />
        <div className="api-inline-loading">
          <i /> Carregando conversas…
        </div>
      </section>
    );
  }

  if (conversas.length === 0) {
    return (
      <section className="screen personal-chat-screen">
        <Header title="Mensagens" back={back} />
        <EmptyState
          icon={<MessageCircle size={32} />}
          title="Nenhum aluno com vínculo ativo"
          copy="Aprove solicitações de alunos na tela de Alunos para iniciar conversas."
        />
        <BottomNav role="personal" active="chat" go={go} />
      </section>
    );
  }

  return (
    <section className="screen personal-chat-screen">
      <Header
        title="Mensagens"
        subtitle="Suas conversas com alunos"
        back={back}
      />

      <div className="personal-chat-layout">
        <aside className="conversations">
          {conversas.map(contact => (
            <button
              className={selectedStudent?.id === contact.id ? "selected" : ""}
              key={contact.id}
              onClick={() => setSelectedStudent(contact)}
            >
              <Avatar name={contact.nome} />
              <span>
                <strong>{contact.nome}</strong>
                <small>{contact.objetivo || "Aluno ativo"}</small>
              </span>
            </button>
          ))}
        </aside>

        <div className="conversation-panel">
          <div className="conversation-head">
            <Avatar name={selectedStudent?.nome} />
            <div>
              <strong>{selectedStudent?.nome}</strong>
              <span>Vínculo ativo</span>
            </div>
          </div>

          <div className="messages personal-messages">
            {messages.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--muted)",
                  padding: "20px",
                }}
              >
                Envie orientações para o aluno abaixo.
              </p>
            ) : (
              messages.map(m => {
                const isPersonal =
                  Number(m.destinatario_id) === Number(selectedStudent?.id);
                return (
                  <div
                    className={`message ${isPersonal ? "personal" : "student"}`}
                    key={m.id}
                  >
                    <p>{m.texto}</p>
                    <span>
                      {new Date(m.enviado_em).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
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
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Escreva uma orientação técnica"
              disabled={sending}
            />
            <button
              className="send-button"
              onClick={send}
              disabled={sending || !text.trim()}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      <BottomNav role="personal" active="chat" go={go} />
    </section>
  );
}

function WorkoutManagement({ go }) {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null);
  const load = () =>
    api
      .getPersonalTreinos()
      .then(setItems)
      .catch(e => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  if (editing)
    return (
      <CreateWorkoutScreen
        initialWorkout={editing}
        go={() => {
          setEditing(null);
          load();
        }}
        back={() => setEditing(null)}
        notify={setError}
      />
    );
  return (
    <section className="chart-card">
      <h2>Gerenciar fichas</h2>
      <p role="status">{error}</p>
      {items.map(t => (
        <article className="meal-card" key={t.id}>
          <strong>{t.titulo}</strong>
          <button
            onClick={async () => {
              try {
                setEditing(await api.getTreinoDetalhes(t.id));
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Editar
          </button>
          <button
            onClick={async () => {
              try {
                await api.excluirTreino(t.id);
                load();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Excluir
          </button>
        </article>
      ))}
    </section>
  );
}
