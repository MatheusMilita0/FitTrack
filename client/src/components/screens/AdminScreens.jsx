import { NutritionAdminPanel } from "./NutritionAdminPanel.jsx";
("use strict");
import { useEffect, useState } from "react";
import {
  Database,
  Dumbbell,
  MoreHorizontal,
  Search,
  Server,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { CreateWorkoutScreen } from "./PersonalScreens.jsx";
import {
  AdminKpi,
  Avatar,
  ConfirmDialog,
  StatusBadge,
} from "./UIComponents.jsx";

export function AdminDashboard({ user, openAccount, notify }) {
  const [stats, setStats] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [filterTipo, setFilterTipo] = useState("");
  const [search, setSearch] = useState("");
  const [menuUser, setMenuUser] = useState(null);
  const [confirmBlock, setConfirmBlock] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [statsData, usuariosData] = await Promise.all([
        api.getAdminEstatisticas(),
        api.getAdminUsuarios({ tipo: filterTipo, busca: search }),
      ]);
      setStats(statsData);
      setUsuarios(usuariosData || []);
    } catch (err) {
      notify(
        err.message || "Erro ao carregar dados de administração.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterTipo]);

  const handleSearch = e => {
    e.preventDefault();
    loadData();
  };

  const handleToggleStatus = async targetUser => {
    if (targetUser.id === user.id) {
      notify(
        "Operação inválida: você não pode alterar o status da sua própria conta.",
        "warning"
      );
      return;
    }
    const nextStatus =
      targetUser.status === "Bloqueado" ? "Ativo" : "Bloqueado";
    try {
      await api.atualizarStatusUsuario(targetUser.id, nextStatus);
      notify(`Status de ${targetUser.nome} alterado para ${nextStatus}.`);
      loadData();
    } catch (err) {
      notify(err.message || "Erro ao alterar status do usuário.", "error");
    } finally {
      setConfirmBlock(null);
    }
  };

  const handleValidarCref = async (targetUserId, nextStatus) => {
    try {
      await api.validarCrefPersonal(targetUserId, nextStatus);
      notify(`CREF atualizado para '${nextStatus}'.`);
      loadData();
    } catch (err) {
      notify(err.message || "Erro ao validar CREF.", "error");
    }
  };

  return (
    <section className="screen admin-screen">
      <div className="admin-head">
        <div>
          <span className="eyebrow">FITTRACK ADMIN</span>
          <h1>Painel de Governança</h1>
          <p>Visão operacional da plataforma baseada no banco PostgreSQL.</p>
        </div>
        <button className="avatar-button" onClick={openAccount}>
          <Avatar name={user.nome} active />
        </button>
      </div>

      <div className="admin-kpis">
        <AdminKpi
          label="Total Alunos"
          value={String(stats?.usuarios?.alunos || 0)}
          icon={<Users size={18} />}
        />
        <AdminKpi
          label="Personais"
          value={String(stats?.usuarios?.personais || 0)}
          icon={<UserCheck size={18} />}
        />
        <AdminKpi
          label="Treinos Cadastrados"
          value={String(stats?.total_treinos_cadastrados || 0)}
          icon={<Dumbbell size={18} />}
        />
        <AdminKpi
          label="Sessões Ativas"
          value={String(stats?.sessoes_ativas || 0)}
          icon={<ShieldCheck size={18} />}
          good
        />
      </div>

      <div className="system-status">
        <div>
          <Server size={18} />
          <span>PostgreSQL DB</span>
          <StatusBadge type={stats ? "success" : "warning"}>
            {stats ? "CONSULTA OK" : "SEM CONFIRMAÇÃO"}
          </StatusBadge>
        </div>
        <div>
          <Database size={18} />
          <span>Fotos do catálogo</span>
          <StatusBadge type="warning">NÃO VERIFICADO</StatusBadge>
        </div>
        <div>
          <ShieldCheck size={18} />
          <span>Sessões HttpOnly</span>
          <StatusBadge>ATIVO</StatusBadge>
        </div>
      </div>

      <section className="admin-table-card">
        <div className="admin-table-head">
          <div>
            <span className="eyebrow">GESTÃO DE CONTAS</span>
            <h2>Usuários do Sistema</h2>
          </div>
          <form onSubmit={handleSearch}>
            <label className="table-search">
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
              />
            </label>
          </form>
        </div>

        <div className="table-filter">
          <button
            className={filterTipo === "" ? "active" : ""}
            onClick={() => setFilterTipo("")}
          >
            Todos
          </button>
          <button
            className={filterTipo === "student" ? "active" : ""}
            onClick={() => setFilterTipo("student")}
          >
            Alunos
          </button>
          <button
            className={filterTipo === "personal" ? "active" : ""}
            onClick={() => setFilterTipo("personal")}
          >
            Personais
          </button>
          <button
            className={filterTipo === "admin" ? "active" : ""}
            onClick={() => setFilterTipo("admin")}
          >
            Admins
          </button>
        </div>

        <div className="users-table">
          <div className="table-row table-labels">
            <span>USUÁRIO</span>
            <span>TIPO</span>
            <span>STATUS / CREF</span>
            <span />
          </div>

          {loading && (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--muted)",
              }}
            >
              Carregando registros da base de dados…
            </div>
          )}

          {!loading && usuarios.length === 0 && (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--muted)",
              }}
            >
              Nenhum usuário localizado para os filtros informados.
            </div>
          )}

          {!loading &&
            usuarios.map(u => {
              const isBlocked = u.status === "Bloqueado";
              const isPersonalPendente =
                u.tipo === "personal" && u.status_cref === "Pendente";

              return (
                <div className="table-row" key={u.id}>
                  <span className="user-name">
                    <Avatar name={u.nome} size="sm" />
                    <div>
                      <b>{u.nome}</b>
                      <small
                        style={{
                          display: "block",
                          color: "var(--tertiary)",
                          fontSize: "10px",
                        }}
                      >
                        {u.email}
                      </small>
                    </div>
                  </span>

                  <span>
                    {u.tipo === "student"
                      ? "Aluno"
                      : u.tipo === "personal"
                        ? "Personal"
                        : "Admin"}
                  </span>

                  <span>
                    <StatusBadge
                      type={
                        isBlocked
                          ? "error"
                          : isPersonalPendente || u.status === "Pendente"
                            ? "warning"
                            : "success"
                      }
                    >
                      {isBlocked
                        ? "Bloqueado"
                        : u.tipo === "personal"
                          ? `CREF ${u.status_cref || "Pendente"}`
                          : u.status}
                    </StatusBadge>
                  </span>

                  <span className="row-menu">
                    <button
                      className="icon-button subtle"
                      onClick={() =>
                        setMenuUser(menuUser?.id === u.id ? null : u)
                      }
                      aria-label="Opções"
                    >
                      <MoreHorizontal size={18} />
                    </button>

                    {menuUser?.id === u.id && (
                      <div className="context-menu">
                        {u.tipo === "personal" &&
                          u.status_cref !== "Validado" &&
                          !isBlocked && (
                            <button
                              onClick={() => {
                                handleValidarCref(u.id, "Pendente");
                                setMenuUser(null);
                              }}
                            >
                              Reagendar análise CREF
                            </button>
                          )}
                        {u.tipo === "personal" &&
                          u.status_cref === "Pendente" && (
                            <button
                              onClick={() => {
                                handleValidarCref(u.id, "Validado");
                                setMenuUser(null);
                              }}
                            >
                              Homologar CREF após conferência
                            </button>
                          )}
                        {u.id !== user.id && (
                          <button
                            className="danger-text"
                            onClick={() => {
                              setConfirmBlock(u);
                              setMenuUser(null);
                            }}
                          >
                            {isBlocked ? "Desbloquear conta" : "Bloquear conta"}
                          </button>
                        )}
                      </div>
                    )}
                  </span>
                </div>
              );
            })}
        </div>
      </section>

      <AdminRecords />
      <NutritionAdminPanel />
      {confirmBlock && (
        <ConfirmDialog
          title={`${confirmBlock.status === "Bloqueado" ? "Desbloquear" : "Bloquear"} ${confirmBlock.nome}?`}
          description={
            confirmBlock.status === "Bloqueado"
              ? "O usuário recuperará o acesso ao sistema."
              : "As sessões ativas do usuário serão revogadas imediatamente no banco."
          }
          confirmLabel={
            confirmBlock.status === "Bloqueado" ? "Desbloquear" : "Bloquear"
          }
          destructive={confirmBlock.status !== "Bloqueado"}
          onCancel={() => setConfirmBlock(null)}
          onConfirm={() => handleToggleStatus(confirmBlock)}
        />
      )}
    </section>
  );
}

function AdminRecords() {
  const [creating, setCreating] = useState(false);
  const [logs, setLogs] = useState([]),
    [models, setModels] = useState([]),
    [error, setError] = useState("");
  const load = async () => {
    try {
      setLogs(await api.getAuditoria());
      setModels(await api.getModelos());
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  if (creating)
    return (
      <CreateWorkoutScreen
        saveWorkout={api.criarModelo}
        go={() => {
          setCreating(false);
          load();
        }}
        back={() => setCreating(false)}
        notify={setError}
      />
    );
  return (
    <section className="chart-card">
      <h2>Biblioteca e auditoria</h2>
      <button onClick={() => setCreating(true)}>
        Criar modelo da biblioteca
      </button>
      <p role="alert">{error}</p>
      {models.map(t => (
        <p key={t.id}>
          {t.titulo} · {t.total_exercicios} exercícios{" "}
          <button
            onClick={async () => {
              try {
                await api.excluirModelo(t.id);
                load();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Excluir modelo
          </button>
        </p>
      ))}
      <details>
        <summary>Últimas operações registradas</summary>
        {logs.map(l => (
          <p key={l.id}>
            {new Date(l.criado_em).toLocaleString("pt-BR")} · {l.usuario_nome} ·{" "}
            {l.operacao}
          </p>
        ))}
      </details>
    </section>
  );
}
