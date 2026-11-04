"use strict";
import { useEffect, useState } from "react";
import "./index.css";
import { api } from "./lib/api.js";
import { resolveRoute } from "./lib/routes.js";
import {
  AccountSheet,
  AISheet,
  Brand,
  ConfirmDialog,
  LogoMark,
  RestTimer,
  Toast,
} from "./components/screens/UIComponents.jsx";
import {
  ForgotScreen,
  LoginScreen,
  PersonalPendingScreen,
  SignupScreen,
} from "./components/screens/AuthScreens.jsx";
import {
  ChatScreen,
  HistoryScreen,
  LibraryScreen,
  NutritionScreen,
  StudentDashboard,
  WorkoutScreen,
} from "./components/screens/StudentScreens.jsx";
import {
  AssignWorkoutScreen,
  CreateWorkoutScreen,
  FeedbackScreen,
  PersonalChatScreen,
  PersonalDashboard,
  StudentsScreen,
} from "./components/screens/PersonalScreens.jsx";
import { AdminDashboard } from "./components/screens/AdminScreens.jsx";
import { ProfileScreen } from "./components/screens/ProfileScreen.jsx";

const routePaths = {
  login: "/login",
  signup: "/cadastro",
  forgot: "/recuperar-senha",
  "personal-pending": "/personal/pendente",
  "student-dashboard": "/aluno/dashboard",
  workout: "/aluno/treino/execucao",
  library: "/aluno/biblioteca-treinos",
  nutrition: "/aluno/nutricao",
  chat: "/aluno/chat",
  history: "/aluno/historico",
  "personal-dashboard": "/personal/dashboard",
  students: "/personal/alunos",
  "create-workout": "/personal/treinos/criar",
  "assign-workout": "/personal/treinos/atribuir",
  feedback: "/personal/feedbacks",
  "personal-chat": "/personal/chat",
  "admin-dashboard": "/admin/dashboard",
  profile: "/perfil",
};

const pathToRoute = pathName =>
  Object.entries(routePaths).find(
    ([, candidate]) => candidate === pathName
  )?.[0] || "login";

const publicRoutes = ["login", "signup", "forgot"];

function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [route, setRoute] = useState(() =>
    pathToRoute(window.location.pathname)
  );
  const [theme, setTheme] = useState("dark");
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [restSeconds, setRestSeconds] = useState(60);
  const [toast, setToast] = useState(null);
  const [activeWorkout, setActiveWorkout] = useState(null);

  // 1. Recuperar sessão real do backend via GET /api/auth/me
  const fetchSession = async () => {
    try {
      // Endpoint contratual: /api/auth/me
      const data = await api.getMe();
      if (data && data.user) {
        setUser(data.user);
        setProfile(data.profile);
        if (data.user.tema) {
          setTheme(data.user.tema);
        }
        return data;
      }
      setUser(null);
      setProfile(null);
      return null;
    } catch {
      setUser(null);
      setProfile(null);
      return null;
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  // 2. Ouvinte de popstate para histórico do navegador
  useEffect(() => {
    const onPopState = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 3. Controle de Toasts temporários
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = next => {
    setAccountOpen(false);
    setRoute(next);
    const targetPath = routePaths[next] || "/login";
    window.history.pushState({}, "", targetPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const notify = (message, kind = "success") => setToast({ message, kind });

  const handleAuthSuccess = (loggedUser, loggedProfile) => {
    setUser(loggedUser);
    setProfile(loggedProfile);
    if (loggedUser.tema) setTheme(loggedUser.tema);

    if (
      loggedUser.tipo === "personal" &&
      (loggedUser.status === "Pendente" ||
        loggedProfile?.status_cref === "Pendente")
    ) {
      go("personal-pending");
      notify("Cadastro em análise de validação CREF.", "warning");
      return;
    }

    if (loggedUser.tipo === "student") {
      go("student-dashboard");
      notify(`Bem-vindo(a) de volta, ${loggedUser.nome.split(" ")[0]}!`);
    } else if (loggedUser.tipo === "personal") {
      go("personal-dashboard");
      notify(`Painel de personal iniciado: ${loggedUser.nome.split(" ")[0]}.`);
    } else if (loggedUser.tipo === "admin") {
      go("admin-dashboard");
      notify("Painel de administração carregado.");
    } else {
      go("login");
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      setLogoutOpen(false);
      notify(
        err.message ||
          "Não foi possível encerrar a sessão no servidor. Tente novamente.",
        "error"
      );
      return;
    }
    setUser(null);
    setProfile(null);
    setActiveWorkout(null);
    setLogoutOpen(false);
    setAccountOpen(false);
    go("login");
    notify("Sessão encerrada com segurança.", "info");
  };

  const updateTheme = async newTheme => {
    const previousTheme = theme;
    setTheme(newTheme);
    try {
      await api.atualizarPreferencias({ tema: newTheme });
      setUser(current => (current ? { ...current, tema: newTheme } : current));
    } catch (err) {
      setTheme(previousTheme);
      notify(err.message || "Não foi possível salvar o tema.", "error");
    }
  };

  const back = () => {
    if (!user) {
      go("login");
      return;
    }
    const defaultDashboard =
      user.tipo === "student"
        ? "student-dashboard"
        : user.tipo === "personal"
          ? user.status === "Pendente" || profile?.status_cref === "Pendente"
            ? "personal-pending"
            : "personal-dashboard"
          : "admin-dashboard";

    const fallbacks = {
      login: defaultDashboard,
      signup: "login",
      forgot: "login",
      "personal-pending": "login",
      "student-dashboard": "student-dashboard",
      workout: "student-dashboard",
      library: "student-dashboard",
      nutrition: "student-dashboard",
      chat: "student-dashboard",
      history: "student-dashboard",
      "personal-dashboard": "personal-dashboard",
      students: "personal-dashboard",
      "create-workout": "personal-dashboard",
      "assign-workout": "personal-dashboard",
      feedback: "personal-dashboard",
      "personal-chat": "personal-dashboard",
      "admin-dashboard": "admin-dashboard",
      profile: defaultDashboard,
    };

    go(fallbacks[route] || defaultDashboard);
  };

  const personalPending =
    user?.tipo === "personal" &&
    (user.status !== "Ativo" || profile?.status_cref !== "Validado");
  const safeRoute = resolveRoute(user, profile, route);

  useEffect(() => {
    if (!authLoading && safeRoute !== route) {
      window.history.replaceState({}, "", routePaths[safeRoute]);
      setRoute(safeRoute);
    }
  }, [authLoading, user, route, safeRoute]);

  // 4. Guards de Rota e Autorização
  // Enquanto verifica a sessão em /api/auth/me, renderiza tela de splash neutra sem expor dados privados
  if (authLoading) {
    return (
      <div className={`fittrack-root ${theme}`}>
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <main className="app-shell">
          <section
            className="auth-screen"
            style={{ textAlign: "center", justifyContent: "center" }}
          >
            <div className="auth-brand">
              <LogoMark />
              <Brand />
              <p>Carregando FitTrack…</p>
            </div>
            <div
              className="api-inline-loading"
              style={{ justifyContent: "center" }}
            >
              <i /> Validando credenciais de acesso seguro…
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Se deslogado tentando acessar rota protegida, redireciona para login
  if (!user && !publicRoutes.includes(route)) {
    return (
      <div className={`fittrack-root ${theme}`}>
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <main className="app-shell">
          <LoginScreen onAuthSuccess={handleAuthSuccess} go={go} />
        </main>
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  // Se logado e personal pendente, força tela de análise CREF
  const isPersonalPendente = personalPending;

  let content;

  if (!user) {
    // Visitantes
    switch (route) {
      case "signup":
        content = (
          <SignupScreen
            go={go}
            back={back}
            notify={notify}
            onAuthSuccess={handleAuthSuccess}
          />
        );
        break;
      case "forgot":
        content = <ForgotScreen go={go} back={back} notify={notify} />;
        break;
      default:
        content = <LoginScreen onAuthSuccess={handleAuthSuccess} go={go} />;
    }
  } else if (isPersonalPendente) {
    // Personal aguardando validação
    content = (
      <PersonalPendingScreen
        user={user}
        profile={profile}
        onRefreshSession={fetchSession}
        onLogout={() => setLogoutOpen(true)}
      />
    );
  } else {
    // Usuários com sessão ativa
    switch (safeRoute) {
      case "student-dashboard":
        content = (
          <StudentDashboard
            user={user}
            go={go}
            openAccount={() => setAccountOpen(true)}
            openAI={() => setAiOpen(true)}
            notify={notify}
            onStartWorkout={workout => {
              setActiveWorkout(workout);
              go("workout");
            }}
          />
        );
        break;
      case "workout":
        content = (
          <WorkoutScreen
            workout={activeWorkout}
            back={back}
            finish={() => {
              setActiveWorkout(null);
              go("student-dashboard");
            }}
            openRest={seconds => {
              setRestSeconds(seconds);
              setRestOpen(true);
            }}
            notify={notify}
          />
        );
        break;
      case "library":
        content = (
          <LibraryScreen
            go={go}
            back={back}
            notify={notify}
            onSelectWorkout={workout => {
              setActiveWorkout(workout);
              go("workout");
            }}
          />
        );
        break;
      case "nutrition":
        content = (
          <NutritionScreen user={user} go={go} back={back} notify={notify} />
        );
        break;
      case "chat":
        content = (
          <ChatScreen user={user} go={go} back={back} notify={notify} />
        );
        break;
      case "history":
        content = <HistoryScreen go={go} back={back} />;
        break;
      case "personal-dashboard":
        content = (
          <PersonalDashboard
            user={user}
            profile={profile}
            go={go}
            openAccount={() => setAccountOpen(true)}
          />
        );
        break;
      case "students":
        content = <StudentsScreen go={go} back={back} notify={notify} />;
        break;
      case "create-workout":
        content = <CreateWorkoutScreen go={go} back={back} notify={notify} />;
        break;
      case "assign-workout":
        content = <AssignWorkoutScreen go={go} back={back} notify={notify} />;
        break;
      case "feedback":
        content = <FeedbackScreen go={go} back={back} notify={notify} />;
        break;
      case "personal-chat":
        content = <PersonalChatScreen go={go} back={back} notify={notify} />;
        break;
      case "admin-dashboard":
        content = (
          <AdminDashboard
            user={user}
            go={go}
            openAccount={() => setAccountOpen(true)}
            notify={notify}
          />
        );
        break;
      case "profile":
        content = (
          <ProfileScreen
            user={user}
            profile={profile}
            back={back}
            theme={theme}
            setTheme={updateTheme}
            askLogout={() => setLogoutOpen(true)}
            notify={notify}
            onUserUpdated={(updatedUser, updatedProfile) => {
              setUser(updatedUser);
              if (updatedProfile) setProfile(updatedProfile);
            }}
          />
        );
        break;
      default:
        if (user.tipo === "student") {
          content = (
            <StudentDashboard
              user={user}
              go={go}
              openAccount={() => setAccountOpen(true)}
              openAI={() => setAiOpen(true)}
              notify={notify}
              onStartWorkout={workout => {
                setActiveWorkout(workout);
                go("workout");
              }}
            />
          );
        } else if (user.tipo === "personal") {
          content = (
            <PersonalDashboard
              user={user}
              profile={profile}
              go={go}
              openAccount={() => setAccountOpen(true)}
            />
          );
        } else {
          content = (
            <AdminDashboard
              user={user}
              go={go}
              openAccount={() => setAccountOpen(true)}
              notify={notify}
            />
          );
        }
    }
  }

  return (
    <div className={`fittrack-root ${theme}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <main className="app-shell">
        <div className="route-transition" key={safeRoute}>
          {content}
        </div>
      </main>

      {accountOpen && user && (
        <AccountSheet
          user={user}
          theme={theme}
          setTheme={updateTheme}
          onProfile={() => go("profile")}
          onLogout={() => {
            setAccountOpen(false);
            setLogoutOpen(true);
          }}
          close={() => setAccountOpen(false)}
        />
      )}

      {aiOpen && (
        <AISheet
          close={() => setAiOpen(false)}
          notify={notify}
          onStartWorkout={workout => {
            setActiveWorkout(workout);
            go("workout");
          }}
        />
      )}
      {restOpen && (
        <RestTimer
          initialSeconds={restSeconds}
          close={() => setRestOpen(false)}
        />
      )}

      {logoutOpen && (
        <ConfirmDialog
          title="Sair da conta?"
          description="Sua sessão será encerrada com segurança e os cookies revogados."
          confirmLabel="Sair"
          destructive
          onCancel={() => setLogoutOpen(false)}
          onConfirm={logout}
        />
      )}

      {toast && <Toast toast={toast} />}
    </div>
  );
}

export default App;
