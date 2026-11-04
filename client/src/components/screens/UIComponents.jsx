import { createPortal } from "react-dom";
("use strict");
import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Dumbbell,
  Home,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Moon,
  Pencil,
  Sparkles,
  Sun,
  UserRound,
  Users,
  X,
  Apple,
} from "lucide-react";

export function Brand({ compact = false }) {
  return (
    <div
      className={`brand ${compact ? "brand-compact" : ""}`}
      aria-label="FITTRACK"
    >
      <span>FIT</span>
      <b>TRACK</b>
    </div>
  );
}

export function LogoMark() {
  return (
    <div className="logo-mark">
      <Activity size={18} strokeWidth={2.4} />
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
}) {
  return (
    <button
      type={type}
      className={`btn btn-primary ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
}) {
  return (
    <button
      type={type}
      className={`btn btn-secondary ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function BackButton({ onClick }) {
  return (
    <button className="icon-button" aria-label="Voltar" onClick={onClick}>
      <ArrowLeft size={21} />
    </button>
  );
}

export function Avatar({ name = "Usuário", size = "md", active = false }) {
  const initial = (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase() || "")
    .join("");
  return (
    <div
      className={`avatar avatar-${size} ${active ? "avatar-active" : ""}`}
      title={name}
    >
      {initial || "U"}
    </div>
  );
}

export function StatusBadge({ children, type = "success" }) {
  return <span className={`status-badge ${type}`}>{children}</span>;
}

export function Header({ title, subtitle, back, right }) {
  return (
    <header className="screen-header">
      <div className="header-left">
        {back && <BackButton onClick={back} />}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {right}
    </header>
  );
}

export function ExerciseThumb({
  tint = "coral",
  small = false,
  image,
  alt = "Demonstração do exercício",
}) {
  return (
    <div className={`exercise-thumb ${tint} ${small ? "thumb-small" : ""}`}>
      <div className="exercise-grid" />
      {image && <img src={image} alt={alt} loading="lazy" />}
      <Dumbbell size={small ? 19 : 31} strokeWidth={1.5} />
      <span className="movement-line one" />
      <span className="movement-line two" />
    </div>
  );
}

export function InputField({
  icon,
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  required = false,
  ...inputProps
}) {
  return (
    <label className="field-label">
      {label}
      <span className="input-box">
        {icon}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          {...inputProps}
        />
      </span>
    </label>
  );
}

export function BottomNav({ role, active, go }) {
  const items =
    role === "student"
      ? [
          {
            id: "dashboard",
            label: "Início",
            icon: Home,
            route: "student-dashboard",
          },
          { id: "workout", label: "Treinos", icon: Dumbbell, route: "library" },
          {
            id: "nutrition",
            label: "Nutrição",
            icon: Apple,
            route: "nutrition",
          },
          { id: "chat", label: "Chat", icon: MessageCircle, route: "chat" },
          { id: "profile", label: "Perfil", icon: UserRound, route: "profile" },
        ]
      : [
          {
            id: "dashboard",
            label: "Início",
            icon: LayoutDashboard,
            route: "personal-dashboard",
          },
          { id: "students", label: "Alunos", icon: Users, route: "students" },
          {
            id: "workout",
            label: "Treinos",
            icon: Dumbbell,
            route: "create-workout",
          },
          {
            id: "chat",
            label: "Chat",
            icon: MessageCircle,
            route: "personal-chat",
          },
          { id: "profile", label: "Perfil", icon: UserRound, route: "profile" },
        ];

  return (
    <nav className="bottom-nav">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={active === item.id ? "active" : ""}
            onClick={() => go(item.route)}
          >
            <span>
              <Icon size={21} strokeWidth={1.8} />
            </span>
            <small>{item.label}</small>
          </button>
        );
      })}
    </nav>
  );
}

export function Macro({ label, value, target, percent, color }) {
  return (
    <div className="macro">
      <div>
        <span>{label}</span>
        <b>
          {value} <small>/ {target}</small>
        </b>
      </div>
      <div className="macro-bar">
        <i className={color} style={{ width: percent }} />
      </div>
    </div>
  );
}

export function KPI({ value, label, icon, onClick, accent = false }) {
  return (
    <button className={`kpi-card ${accent ? "accent" : ""}`} onClick={onClick}>
      <span>{icon}</span>
      <b>{value}</b>
      <small>{label}</small>
    </button>
  );
}

export function AdminKpi({ label, value, icon, good = false }) {
  return (
    <article className="admin-kpi">
      <span className={good ? "good" : ""}>{icon}</span>
      <div>
        <b>{value}</b>
        <small>{label}</small>
      </div>
    </article>
  );
}

export function Sheet({ title, close, children, className = "" }) {
  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = e => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", key);
    };
  }, [close]);
  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <aside className={`bottom-sheet ${className}`}>
        <div className="sheet-grab" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        {children}
      </aside>
    </div>,
    document.querySelector(".fittrack-root") || document.body
  );
}

export function AISheet({ close, onStartWorkout, notify }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false),
    [saving, setSaving] = useState(false);
  const save = async start => {
    setSaving(true);
    setError("");
    try {
      const r = await api.salvarSugestao(result.id, confirmDemo);
      if (start) {
        close();
        onStartWorkout(r.treino);
      } else notify?.("Sugestão salva na sua rotina.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const [restricoes, setRestricoes] = useState("");
  const generate = async () => {
    setConfirmDemo(false);
    setResult(null);
    setLoading(true);
    setError("");
    try {
      setResult((await api.recomendarTreino({ restricoes })).recomendacao);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Sheet title="Treino Sugerido por IA" close={close} className="ai-sheet">
      <InputField
        label="Restrições e foco"
        value={restricoes}
        onChange={e => setRestricoes(e.target.value)}
      />
      <PrimaryButton onClick={generate} disabled={loading}>
        {loading ? "Consultando…" : "Solicitar sugestão"}
      </PrimaryButton>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div>
          <StatusBadge type={result.mock ? "warning" : "success"}>
            {result.mock ? "DEMONSTRAÇÃO — SEM GEMINI" : "GEMINI"}
          </StatusBadge>
          <h2>{result.titulo}</h2>
          <p>{result.aviso || result.descricao}</p>
          {result.exercicios.map((ex, i) => (
            <article className="meal-card" key={i}>
              <div>
                <strong>{ex.nome}</strong>
                <p>
                  {ex.series} séries · {ex.repeticoes} · {ex.descanso}
                </p>
              </div>
            </article>
          ))}
          {result.mock && (
            <label className="account-item">
              <input
                type="checkbox"
                checked={confirmDemo}
                onChange={e => setConfirmDemo(e.target.checked)}
              />
              Entendo que este treino é um exemplo demonstrativo, sem consulta
              ao Gemini.
            </label>
          )}
          <PrimaryButton
            disabled={saving || (result.mock && !confirmDemo)}
            onClick={() => save(false)}
          >
            Salvar na minha rotina
          </PrimaryButton>
          <PrimaryButton
            disabled={saving || (result.mock && !confirmDemo)}
            onClick={() => save(true)}
          >
            Salvar e iniciar treino
          </PrimaryButton>
          <button
            className="btn btn-secondary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const r = await api.enviarSugestao(result.id);
                notify?.(r.message);
              } catch (e) {
                setError(e.message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Enviar para revisão do personal
          </button>
          <p className="sheet-copy">{result.disclaimer}</p>
        </div>
      )}
    </Sheet>
  );
}

export function RestTimer({ close, initialSeconds = 60 }) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    const timer = window.setInterval(
      () => setSeconds(value => (value <= 1 ? 0 : value - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="overlay centered-overlay">
      <div className="rest-card">
        <button
          className="icon-button close-rest"
          onClick={close}
          aria-label="Fechar"
        >
          <X size={19} />
        </button>
        <span className="eyebrow">DESCANSO</span>
        <div className="rest-ring">
          <b>00:{String(seconds).padStart(2, "0")}</b>
        </div>
        <h2>Boa série.</h2>
        <p>Recupere o fôlego antes da próxima repetição.</p>
        <button className="text-link" onClick={close}>
          Pular descanso
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = false,
}) {
  return (
    <div className="overlay centered-overlay">
      <div className="confirm-dialog">
        <div
          className={destructive ? "confirm-icon destructive" : "confirm-icon"}
        >
          {destructive ? <LogOut size={22} /> : <CircleAlert size={22} />}
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
        <div>
          <SecondaryButton onClick={onCancel}>Cancelar</SecondaryButton>
          <PrimaryButton
            onClick={onConfirm}
            className={destructive ? "destructive-button" : ""}
          >
            {confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  return (
    <div className={`toast ${toast.kind}`}>
      <span>
        {toast.kind === "success" ? (
          <CheckCircle2 size={18} />
        ) : (
          <CircleAlert size={18} />
        )}
      </span>
      {toast.message}
    </div>
  );
}

export function EmptyState({ icon, title, copy }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}

export function FullscreenGif({ exercise, close }) {
  const [detail, setDetail] = useState(exercise);
  useEffect(() => {
    let live = true;
    if (exercise.exercise_id && !exercise.exercise_id.startsWith("manual-"))
      api
        .getExercicio(exercise.exercise_id)
        .then(r => {
          if (live) setDetail(r);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [exercise]);
  const images =
    detail.images ||
    (detail.gif_url || detail.gifUrl ? [detail.gif_url || detail.gifUrl] : []);
  return (
    <Sheet
      title={detail.nome || detail.name}
      close={close}
      className="exercise-detail"
    >
      <p>
        {detail.grupo_muscular || detail.bodyParts?.join(", ") || "Musculação"}
      </p>
      {images.length ? (
        <div className="exercise-photo-sequence">
          {images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`${detail.nome || detail.name}, posição ${i + 1}`}
              loading="lazy"
              onError={e => {
                e.currentTarget.hidden = true;
              }}
            />
          ))}
        </div>
      ) : (
        <p>
          Fotos demonstrativas ainda não disponíveis. Consulte as instruções
          abaixo.
        </p>
      )}
      {detail.instructions?.length ? (
        <ol>
          {detail.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      ) : (
        <p>
          {detail.notas ||
            "Instruções não fornecidas pela base. Peça orientação ao profissional antes da execução."}
        </p>
      )}
    </Sheet>
  );
}

export function SettingsGroup({ title, children }) {
  return (
    <section className="settings-group">
      <span className="eyebrow">{title}</span>
      <div className="settings-card">{children}</div>
    </section>
  );
}

export function SettingRow({ icon, label, value, chevron, control }) {
  return (
    <div className="setting-row">
      <span className="setting-icon">{icon}</span>
      <strong>{label}</strong>
      <div className="setting-control">
        {value && <small>{value}</small>}
        {control}
        {chevron && <ChevronRight size={18} />}
      </div>
    </div>
  );
}

export function ThemeToggle({ theme, setTheme }) {
  return (
    <button
      className={`theme-toggle ${theme}`}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Alternar tema"
    >
      <Sun size={14} />
      <Moon size={14} />
      <i />
    </button>
  );
}

export function AccountSheet({
  user,
  theme,
  setTheme,
  onProfile,
  onLogout,
  close,
}) {
  return (
    <div className="overlay">
      <aside className="account-sheet">
        <div className="sheet-grab" />
        <div className="account-summary">
          <Avatar name={user.nome} active />
          <div>
            <strong>{user.nome}</strong>
            <p>{user.email}</p>
          </div>
          <button className="icon-button" onClick={close}>
            <X size={19} />
          </button>
        </div>

        <button className="account-item" onClick={onProfile}>
          <Pencil size={19} />
          <span>Ver perfil e configurações</span>
          <ChevronRight size={18} />
        </button>

        <div className="account-item">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>

        <div className="account-divider" />
        <button className="account-item destructive" onClick={onLogout}>
          <LogOut size={19} />
          <span>Sair da conta</span>
        </button>
      </aside>
    </div>
  );
}
