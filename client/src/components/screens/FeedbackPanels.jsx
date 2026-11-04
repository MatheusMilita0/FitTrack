import { VideoCapture, FeedbackVideo } from "./VideoCapture.jsx";
import { HistoryExplorer } from "./HistoryExplorer.jsx";
import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Sheet, InputField, PrimaryButton } from "./UIComponents.jsx";

export function StudentFeedbackPanel({ executions }) {
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]),
    [id, setId] = useState(""),
    [url, setUrl] = useState(""),
    [comment, setComment] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api
      .getFeedbacks()
      .then(setItems)
      .catch(e => setMessage(e.message));
  useEffect(() => {
    load();
  }, []);
  const send = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      let videoUrl = url;
      if (file) {
        const signed = await api.prepararVideo(file);
        setMessage("Enviando vídeo…");
        const upload = await fetch(signed.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
          credentials: "omit",
          redirect: "error",
        });
        if (!upload.ok)
          throw new Error(
            "O armazenamento recusou o envio. Verifique a configuração do provedor e tente novamente."
          );
        videoUrl = signed.video_url;
      }
      await api.enviarFeedback({
        execucao_id: Number(id),
        video_url: videoUrl,
        comentario_aluno: comment,
      });
      setMessage("Feedback enviado.");
      setUrl("");
      setFile(null);
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="chart-card">
      <h2>Vídeos e orientações</h2>
      <p>
        Grave ou selecione um vídeo, ou informe um link HTTPS. O envio de
        arquivo exige armazenamento configurado.
      </p>
      <form onSubmit={send} className="stack-form">
        <label>
          Treino concluído
          <select required value={id} onChange={e => setId(e.target.value)}>
            <option value="">Selecione</option>
            {executions.map(e => (
              <option key={e.id} value={e.id}>
                {e.treino_titulo} —{" "}
                {new Date(e.concluido_em).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
        </label>
        <VideoCapture file={file} onFile={setFile} />
        <InputField
          label="Ou link HTTPS do vídeo"
          type="url"
          required={!file}
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
        <InputField
          label="Comentário"
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
        <PrimaryButton type="submit" disabled={busy}>
          Enviar feedback
        </PrimaryButton>
      </form>
      <p role="status">{message}</p>
      {items.map(item => (
        <article className="meal-card" key={item.id}>
          <div>
            <strong>{item.treino_titulo || "Treino concluído"}</strong>
            <p>{item.comentario_aluno}</p>
            <FeedbackVideo url={item.video_url} />
            <p>{item.resposta_personal || "Aguardando orientação"}</p>
            {!item.visualizado_pelo_personal && (
              <button
                onClick={async () => {
                  try {
                    await api.excluirFeedback(item.id);
                    load();
                  } catch (e) {
                    setMessage(e.message);
                  }
                }}
              >
                Excluir antes da visualização
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

export function ProfessionalFeedback({ item, onUpdated }) {
  const [reply, setReply] = useState(item.resposta_personal || ""),
    [error, setError] = useState(""),
    [viewed, setViewed] = useState(false),
    [busy, setBusy] = useState(false);
  const view = async () => {
    try {
      await api.visualizarFeedback(item.id);
      setViewed(true);
    } catch (e) {
      setError(e.message);
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      await api.responderFeedback(item.id, reply);
      onUpdated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="chart-card">
      <h3>
        {item.aluno_nome} · {item.treino_titulo}
      </h3>
      <p>{item.comentario_aluno || item.texto}</p>
      <p>{new Date(item.criado_em).toLocaleString("pt-BR")}</p>
      {item.video_url &&
        /^https?:\/\//i.test(item.video_url) &&
        (viewed ? (
          <FeedbackVideo url={item.video_url} />
        ) : (
          <button onClick={view}>Registrar visualização e liberar vídeo</button>
        ))}
      <InputField
        label="Orientação técnica"
        value={reply}
        onChange={e => setReply(e.target.value)}
      />
      <PrimaryButton onClick={send} disabled={busy || !reply.trim()}>
        Responder
      </PrimaryButton>
      <p role="alert">{error}</p>
    </article>
  );
}

export function EvolutionSheet({ aluno, close }) {
  const [suggestion, setSuggestion] = useState(null);
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .getEvolucaoAluno(aluno.aluno_id)
      .then(setData)
      .catch(e => setError(e.message));
  }, [aluno.aluno_id]);
  return (
    <Sheet title={`Evolução de ${aluno.nome}`} close={close}>
      <p role="alert">{error}</p>
      {!data && !error && <p>Carregando…</p>}
      {data && (
        <>
          <button
            onClick={async () => {
              try {
                setSuggestion(
                  (await api.recomendarParaAluno(aluno.aluno_id)).recomendacao
                );
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Solicitar apoio da IA
          </button>
          {suggestion && (
            <div>
              <h3>{suggestion.titulo}</h3>
              <p>
                {suggestion.mock
                  ? "DEMONSTRAÇÃO: sem Gemini"
                  : "Sugestão Gemini"}
              </p>
              {suggestion.exercicios.map((ex, i) => (
                <p key={i}>
                  {ex.nome} · {ex.series} × {ex.repeticoes} · {ex.descanso}
                </p>
              ))}
              <p>{suggestion.disclaimer}</p>
              <button
                onClick={async () => {
                  try {
                    await api.criarTreino({
                      titulo: suggestion.titulo,
                      descricao: suggestion.descricao,
                      exercicios: suggestion.exercicios.map(ex => ({
                        nome: ex.nome,
                        grupo_muscular: ex.grupo_muscular,
                        series_padrao: String(ex.series),
                        reps_padrao: ex.repeticoes,
                        descanso_padrao: ex.descanso,
                        notas: ex.observacoes,
                      })),
                    });
                    setError(
                      "Ficha salva. Revise em Gerenciar fichas e atribua ao aluno."
                    );
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Salvar como ficha para revisão
              </button>
            </div>
          )}
          <HistoryExplorer alunoId={aluno.aluno_id} />
        </>
      )}
    </Sheet>
  );
}
