import { MetabolicFields } from "./MetabolicFields.jsx";
("use strict");
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CircleAlert,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Target,
  UserRound,
  ChevronRight,
} from "lucide-react";
import { api } from "../../lib/api.js";
import {
  Brand,
  LogoMark,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  Header,
  InputField,
} from "./UIComponents.jsx";

export function LoginScreen({ onAuthSuccess, go }) {
  const [identifier, setIdentifier] = useState("");
  const [senha, setSenha] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async event => {
    event.preventDefault();
    setErrorMessage("");

    if (!identifier.trim() || !senha) {
      setErrorMessage("Por favor, informe seu e-mail ou CPF e a senha.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.login({ identifier: identifier.trim(), senha });
      if (data && data.user) {
        onAuthSuccess(data.user, data.profile);
      }
    } catch (err) {
      setErrorMessage(
        err.message || "Credenciais inválidas. Verifique os dados informados."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-screen">
      <div className="auth-orb orb-a" />
      <div className="auth-orb orb-b" />
      <div className="auth-brand">
        <LogoMark />
        <Brand />
        <p>Be an Inspiration</p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <div className="form-intro">
          <span className="eyebrow">BEM-VINDO DE VOLTA</span>
          <h1>Seu progresso começa aqui.</h1>
          <p>Acompanhe seus treinos e celebre cada evolução com dados reais.</p>
        </div>

        <label className="input-pill">
          <UserRound size={18} />
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            aria-label="E-mail ou CPF"
            placeholder="E-mail ou CPF"
            autoComplete="username"
            disabled={loading}
            required
          />
        </label>

        <label className="input-pill">
          <LockKeyhole size={18} />
          <input
            type={showPass ? "text" : "password"}
            value={senha}
            onChange={e => setSenha(e.target.value)}
            aria-label="Senha"
            placeholder="Senha"
            autoComplete="current-password"
            disabled={loading}
            required
          />
          <button
            type="button"
            onClick={() => setShowPass(!showPass)}
            aria-label={showPass ? "Ocultar senha" : "Ver senha"}
          >
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </label>

        <div className="auth-row">
          <button
            type="button"
            className="text-link"
            onClick={() => go("forgot")}
          >
            Esqueci minha senha
          </button>
        </div>

        {errorMessage && (
          <div className="inline-banner error" role="alert">
            <CircleAlert size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? (
            <span>Entrando…</span>
          ) : (
            <>
              <span>Entrar</span>
              <ArrowUpRight size={19} />
            </>
          )}
        </PrimaryButton>
      </form>

      <p className="auth-footer">
        Ainda não tem conta?{" "}
        <button onClick={() => go("signup")}>Cadastre-se</button>
      </p>
    </section>
  );
}

export function SignupScreen({ go, back, onAuthSuccess }) {
  const [type, setType] = useState("student");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [idade, setIdade] = useState("");

  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [objetivo, setObjetivo] = useState("Hipertrofia");

  const [metabolic, setMetabolic] = useState({
    data_nascimento: "",
    sexo_metabolico: "",
    fator_atividade: 1.55,
  });
  const [cref, setCref] = useState("");
  const [areaFormacao, setAreaFormacao] = useState("");
  const [atuacaoPrincipal, setAtuacaoPrincipal] = useState(
    "Musculação e Condicionamento"
  );

  const submit = async event => {
    event.preventDefault();
    setErrorMessage("");

    if (!nome.trim() || !cpf.trim() || !email.trim() || !senha) {
      setErrorMessage("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    if (senha.length < 6) {
      setErrorMessage("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    if (
      type === "personal" &&
      (!cref.trim() || !areaFormacao.trim() || !atuacaoPrincipal.trim())
    ) {
      setErrorMessage(
        "Para cadastro de personal trainer, CREF, área de formação e atuação principal são obrigatórios."
      );
      return;
    }

    setLoading(true);

    const payload = {
      nome: nome.trim(),
      cpf: cpf.trim(),
      email: email.trim().toLowerCase(),
      senha,
      tipo: type,
      idade: idade ? Number(idade) : null,
    };

    if (type === "student") {
      Object.assign(payload, metabolic);
      payload.peso_kg = peso ? Number(peso) : null;
      payload.altura_cm = altura ? Number(altura) : null;
      payload.objetivo = objetivo || "Hipertrofia";
    } else {
      payload.cref = cref.trim();
      payload.area_formacao = areaFormacao.trim();
      payload.atuacao_principal = atuacaoPrincipal.trim();
    }

    try {
      const res = await api.register(payload);
      if (res && res.user) {
        onAuthSuccess(res.user, res.profile);
      }
    } catch (err) {
      setErrorMessage(
        err.message ||
          "Não foi possível concluir o cadastro. Verifique os dados."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="screen scroll-screen form-screen">
      <Header title="Criar Conta" back={back} />

      <div className="segmented role-tabs">
        <button
          type="button"
          className={type === "student" ? "selected" : ""}
          onClick={() => {
            setType("student");
            setErrorMessage("");
          }}
        >
          Quero Treinar
        </button>
        <button
          type="button"
          className={type === "personal" ? "selected" : ""}
          onClick={() => {
            setType("personal");
            setErrorMessage("");
          }}
        >
          Sou Personal
        </button>
      </div>

      <form onSubmit={submit} className="stack-form">
        <InputField
          icon={<UserRound size={18} />}
          label="Nome completo *"
          placeholder="Como quer ser chamado?"
          value={nome}
          onChange={e => setNome(e.target.value)}
          required
        />

        <InputField
          icon={<ShieldCheck size={18} />}
          label="CPF *"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={e => setCpf(e.target.value)}
          required
        />

        <InputField
          icon={<Mail size={18} />}
          label="E-mail *"
          placeholder="voce@email.com"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />

        <InputField
          icon={<LockKeyhole size={18} />}
          label="Senha (mínimo 6 caracteres) *"
          placeholder="Crie uma senha segura"
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          required
        />

        {type === "student" && (
          <MetabolicFields value={metabolic} onChange={setMetabolic} />
        )}

        {type === "student" ? (
          <>
            <div className="field-pair">
              <InputField
                icon={<Activity size={18} />}
                label="Peso (kg) *"
                required
                min="20"
                max="400"
                step="0.01"
                placeholder="Ex.: 75.5"
                type="number"
                value={peso}
                onChange={e => setPeso(e.target.value)}
              />
              <InputField
                icon={<Activity size={18} />}
                label="Altura (cm) *"
                required
                min="100"
                max="250"
                step="1"
                placeholder="Ex.: 178"
                type="number"
                value={altura}
                onChange={e => setAltura(e.target.value)}
              />
            </div>

            <label className="field-label">
              Seu objetivo
              <div className="select-field">
                <Target size={18} />
                <select
                  value={objetivo}
                  onChange={e => setObjetivo(e.target.value)}
                >
                  <option value="Hipertrofia">
                    Ganhar massa muscular (Hipertrofia)
                  </option>
                  <option value="Condicionamento">
                    Melhorar condicionamento
                  </option>
                  <option value="Emagrecimento">Emagrecimento saudável</option>
                  <option value="Força">Desenvolvimento de força</option>
                </select>
                <ChevronRight size={17} />
              </div>
            </label>
          </>
        ) : (
          <>
            <InputField
              icon={<ShieldCheck size={18} />}
              label="Registro CREF *"
              placeholder="Ex.: 123456-G/SP"
              value={cref}
              onChange={e => setCref(e.target.value)}
              required
            />
            <InputField
              icon={<BookOpen size={18} />}
              label="Área de formação *"
              placeholder="Ex.: Bacharelado em Educação Física"
              value={areaFormacao}
              onChange={e => setAreaFormacao(e.target.value)}
              required
            />
            <InputField
              icon={<Target size={18} />}
              label="Atuação principal *"
              placeholder="Ex.: Hipertrofia, Funcional, Reabilitação"
              value={atuacaoPrincipal}
              onChange={e => setAtuacaoPrincipal(e.target.value)}
              required
            />
            <div className="inline-banner warning">
              <CircleAlert size={16} />
              <span>
                Personais trainers iniciam com status "Pendente" e aguardam
                validação de CREF por um administrador.
              </span>
            </div>
          </>
        )}

        {errorMessage && (
          <div className="inline-banner error" role="alert">
            <CircleAlert size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "Processando…" : "Concluir Cadastro"}{" "}
          <ArrowUpRight size={19} />
        </PrimaryButton>
      </form>
    </section>
  );
}

export function ForgotScreen({ back }) {
  const token = new URLSearchParams(window.location.search).get("token");
  const [novaSenha, setNovaSenha] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setApiError("");
    setLoading(true);

    try {
      const result = token
        ? await api.redefinirSenha(token, novaSenha)
        : await api.recuperarSenha(email);
      setSuccess(result.message);
    } catch (err) {
      setApiError(
        err.message ||
          "Serviço de recuperação de senha por e-mail ainda não integrado neste incremento."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-screen recovery-screen">
      <div className="auth-brand compact-brand">
        <LogoMark />
        <Brand compact />
      </div>

      <div className="recovery-card">
        <button className="back-inline" onClick={back}>
          <ArrowLeft size={18} /> Voltar
        </button>
        <div className="recovery-icon">
          <Mail size={31} />
        </div>
        <span className="eyebrow">ACESSO SEGURO</span>
        <h1>Recuperação de Senha</h1>
        <p>
          Solicite um link temporário por e-mail ou defina sua nova senha pelo
          link recebido.
        </p>

        <form onSubmit={submit} className="stack-form">
          {success && <p role="status">{success}</p>}
          {token ? (
            <InputField
              label="Nova senha"
              type="password"
              required
              minLength={6}
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
            />
          ) : (
            <InputField
              icon={<Mail size={18} />}
              label="E-mail cadastrado"
              placeholder="voce@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              required
            />
          )}

          {apiError && (
            <div className="inline-banner warning" role="alert">
              <CircleAlert size={16} />
              <span>{apiError}</span>
            </div>
          )}

          <PrimaryButton type="submit" disabled={loading}>
            {loading
              ? "Verificando…"
              : token
                ? "Salvar nova senha"
                : "Solicitar Recuperação"}{" "}
            <ArrowUpRight size={19} />
          </PrimaryButton>
        </form>

        <p style={{ marginTop: "16px", fontSize: "11px", textAlign: "center" }}>
          A senha precisa ter pelo menos seis caracteres, uma letra maiúscula e
          uma minúscula.
        </p>
      </div>
    </section>
  );
}

export function PersonalPendingScreen({
  user,
  profile,
  onRefreshSession,
  onLogout,
}) {
  const [refreshing, setRefreshing] = useState(false);

  const checkStatus = async () => {
    setRefreshing(true);
    try {
      await onRefreshSession();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => onRefreshSession?.(), 30000);
    return () => clearInterval(timer);
  }, [onRefreshSession]);
  return (
    <section
      className="screen"
      style={{ textAlign: "center", paddingTop: "80px" }}
    >
      <div className="auth-brand">
        <LogoMark />
        <Brand />
      </div>

      <div
        className="recovery-card"
        style={{ margin: "20px auto", maxWidth: "480px", textAlign: "left" }}
      >
        <div className="inline-banner warning" style={{ marginBottom: "16px" }}>
          <CircleAlert size={20} />
          <div>
            <strong>
              {profile?.status_cref === "Rejeitado"
                ? "CREF não validado"
                : "Cadastro em análise CREF"}
            </strong>
            <p>
              {profile?.status_cref === "Rejeitado"
                ? "A validação do registro foi recusada. Solicite à administração a revisão dos dados e da documentação profissional."
                : "Seu perfil aguarda validação. Indisponibilidades do serviço são reagendadas automaticamente; a administração também pode analisar a documentação."}
            </p>
          </div>
        </div>

        <h2>Olá, {user.nome}</h2>
        <p style={{ margin: "10px 0 18px" }}>
          Por exigência regulatória, contas de Personal Trainer precisam ter o
          registro do CREF validado pela administração antes de prescrever
          treinos ou gerenciar alunos.
        </p>

        <div
          style={{
            background: "var(--elevated)",
            padding: "14px",
            borderRadius: "14px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              marginBottom: "4px",
            }}
          >
            CREF REGISTRADO:
          </div>
          <strong style={{ fontSize: "15px" }}>
            {profile?.cref || "Sob análise"}
          </strong>
          <div
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              marginTop: "10px",
              marginBottom: "4px",
            }}
          >
            STATUS DA CONTA:
          </div>
          <StatusBadge type="warning">
            CREF {profile?.status_cref || user.status}
          </StatusBadge>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <PrimaryButton onClick={checkStatus} disabled={refreshing}>
            {refreshing ? "Atualizando…" : "Verificar Aprovação Agora"}
          </PrimaryButton>
          <SecondaryButton onClick={onLogout}>Sair da Conta</SecondaryButton>
        </div>
      </div>
    </section>
  );
}
