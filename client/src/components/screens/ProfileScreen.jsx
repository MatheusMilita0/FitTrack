import { MetabolicFields } from "./MetabolicFields.jsx";
("use strict");
import { useState } from "react";
import {
  Activity,
  BookOpen,
  ChevronRight,
  Droplets,
  Languages,
  LogOut,
  Pencil,
  ShieldCheck,
  Sun,
  Target,
} from "lucide-react";
import { api } from "../../lib/api.js";
import {
  Avatar,
  Header,
  InputField,
  PrimaryButton,
  SecondaryButton,
  SettingRow,
  SettingsGroup,
  Sheet,
  ThemeToggle,
} from "./UIComponents.jsx";

export function ProfileScreen({
  user,
  profile,
  back,
  theme,
  setTheme,
  askLogout,
  notify,
  onUserUpdated,
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [peso, setPeso] = useState(profile?.peso_kg || "");
  const [altura, setAltura] = useState(profile?.altura_cm || "");
  const [objetivo, setObjetivo] = useState(profile?.objetivo || "");
  const [metaAgua, setMetaAgua] = useState(profile?.meta_agua_ml ?? "");
  const [metabolic, setMetabolic] = useState({
    data_nascimento: profile?.data_nascimento || "",
    sexo_metabolico: profile?.sexo_metabolico || "",
    fator_atividade: profile?.fator_atividade || 1.55,
  });
  const [saving, setSaving] = useState(false);

  const saveProfile = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.atualizarPerfil({
        ...metabolic,
        peso_kg: peso ? Number(peso) : null,
        altura_cm: altura ? Number(altura) : null,
        objetivo,
        ...(metaAgua !== "" ? { meta_agua_ml: Number(metaAgua) } : {}),
      });
      notify("Perfil atualizado com sucesso.");
      if (res && res.profile) {
        onUserUpdated(user, res.profile);
      }
      setEditOpen(false);
    } catch (err) {
      notify(err.message || "Erro ao salvar perfil.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="screen profile-screen">
      <Header title="Perfil e Configurações" back={back} />

      <div className="profile-top">
        <div className="profile-avatar">
          <Avatar name={user.nome} size="xl" active />
        </div>
        <h2>{user.nome}</h2>
        <p>{user.email}</p>
        <span
          style={{
            fontSize: "11px",
            color: "var(--tertiary)",
            marginTop: "3px",
          }}
        >
          CPF: {user.cpf} · Tipo: {user.tipo.toUpperCase()}
        </span>
      </div>

      <SettingsGroup title="Preferências">
        <SettingRow
          icon={<Sun size={19} />}
          label="Tema do aplicativo"
          control={<ThemeToggle theme={theme} setTheme={setTheme} />}
        />
        <SettingRow
          icon={<Languages size={19} />}
          label="Idioma"
          value="Português (Brasil)"
        />
        <SettingRow
          icon={<ShieldCheck size={19} />}
          label="Sessões"
          value="Protegidas"
        />
      </SettingsGroup>

      <SettingsGroup title="Dados Pessoais">
        {user.tipo === "student" && (
          <>
            <SettingRow
              icon={<Activity size={19} />}
              label="Peso cadastrado"
              value={`${profile?.peso_kg || "--"} kg`}
            />
            <SettingRow
              icon={<Target size={19} />}
              label="Objetivo"
              value={profile?.objetivo || "Hipertrofia"}
            />
            <button
              className="account-item"
              onClick={() => setEditOpen(true)}
              style={{ padding: "12px 14px", width: "100%", textAlign: "left" }}
            >
              <Pencil size={17} />
              <span>Editar metas físicas</span>
              <ChevronRight size={17} />
            </button>
          </>
        )}

        {user.tipo === "personal" && (
          <>
            <SettingRow
              icon={<ShieldCheck size={19} />}
              label="Registro CREF"
              value={profile?.cref || "--"}
            />
            <SettingRow
              icon={<BookOpen size={19} />}
              label="Área de Formação"
              value={profile?.area_formacao || "--"}
            />
          </>
        )}
      </SettingsGroup>

      <SecondaryButton className="logout-button" onClick={askLogout}>
        <LogOut size={18} /> Sair da conta
      </SecondaryButton>

      <p className="app-version">FITTRACK · versão 1.0.0</p>

      {editOpen && (
        <Sheet title="Editar Dados Físicos" close={() => setEditOpen(false)}>
          <form
            onSubmit={saveProfile}
            className="stack-form"
            style={{ marginTop: "12px" }}
          >
            <MetabolicFields value={metabolic} onChange={setMetabolic} />
            <InputField
              icon={<Activity size={18} />}
              label="Peso (kg)"
              required
              min="20"
              max="400"
              step="0.01"
              type="number"
              value={peso}
              onChange={e => setPeso(e.target.value)}
            />
            <InputField
              icon={<Activity size={18} />}
              label="Altura (cm)"
              required
              min="100"
              max="250"
              step="1"
              type="number"
              value={altura}
              onChange={e => setAltura(e.target.value)}
            />
            <InputField
              icon={<Target size={18} />}
              label="Objetivo"
              value={objetivo}
              onChange={e => setObjetivo(e.target.value)}
            />
            <InputField
              icon={<Droplets size={18} />}
              label="Meta Diária de Água (ml)"
              type="number"
              value={metaAgua}
              onChange={e => setMetaAgua(e.target.value)}
            />
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar Alterações"}
            </PrimaryButton>
          </form>
        </Sheet>
      )}
    </section>
  );
}
