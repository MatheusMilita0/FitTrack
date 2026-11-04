> Atualização nutricional: o projeto agora inclui catálogo próprio TACO, medidas POF e cálculo de porções no servidor. Veja [NUTRICAO_TACO.md](NUTRICAO_TACO.md). O registro manual anterior permanece como opção explícita.

> Atualização do catálogo em 27/10/2026: o proxy ExerciseDB foi substituído por catálogo próprio PT-BR com carga transacional. Consulte [CATALOGO_PTBR.md](CATALOGO_PTBR.md). Referências ao catálogo externo abaixo descrevem a entrega anterior e foram superadas por esta atualização.

# FitTrack 1.0 - Backend & API Server-side

Conferência com o TG revisado em 03/11/2026: veja [CONFORMIDADE_TG_REVISADO.md](CONFORMIDADE_TG_REVISADO.md). As divergências funcionais reproduzidas foram corrigidas e verificadas com 165 testes. Integrações externas e requisitos operacionais ainda exigem homologação; veja o relatório atualizado.

Base executável do backend FitTrack, com persistência real em PostgreSQL online, autenticação por hash bcrypt, sessões seguras em banco com cookies HttpOnly, isolamento de papéis (aluno, personal trainer e administrador), e regras estritas de autorização entre pares.

---

## 1. Instruções para Criação e Configuração do PostgreSQL Online

O backend do FitTrack foi projetado para operar com qualquer provedor PostgreSQL gerenciado na nuvem (ex.: **Neon**, **Supabase**, **Render**, **Railway**, **ElephantSQL**, **AWS RDS** ou **Azure PostgreSQL**).

> **Aviso Importante sobre o Banco de Dados:**
> O banco de dados PostgreSQL online NÃO é criado, provisionado nem conectado automaticamente durante a inicialização local. Cabe ao operador configurar a variável `DATABASE_URL` no `.env` antes de rodar migrações ou iniciar o servidor em ambiente conectado. Em testes unitários/automatizados (`npm test`), utiliza-se o PostgreSQL in-process simulado via `pg-mem`.

### Passo 1: Criar o Banco de Dados Online
1. Acesse o provedor de sua preferência (ex.: [neon.tech](https://neon.tech) ou [supabase.com](https://supabase.com)).
2. Crie um novo projeto/instância PostgreSQL (versão 14 ou superior).
3. Copie a string de conexão (Connection String / URI) fornecida pelo painel. Ela terá o formato:
   ```
   postgresql://<usuario>:<senha>@<host-do-banco>:5432/<nome-do-banco>?sslmode=require
   ```

### Passo 2: Configurar o Arquivo `.env`
No diretório raiz do projeto (`C:\Users\DedicaTech\Downloads\FitTrack`):
1. Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
2. Abra o `.env` e preencha as variáveis necessárias:
   - `DATABASE_URL`: Cole a string de conexão do PostgreSQL obtida no Passo 1.
   - `PORT`: Porta do servidor backend (padrão: `5000` em desenvolvimento para atender o proxy Vite).
   - `NODE_ENV`: `development` ou `production`.
   - `ADMIN_EMAIL` e `ADMIN_PASSWORD`: Credenciais para o bootstrap do primeiro administrador.

> **ATENÇÃO DE SEGURANÇA:**
> - Nunca adicione a `DATABASE_URL` em código client-side (`client/**`).
> - O arquivo `.env` nunca deve ser versionado em repositório público (já ignorado no `.gitignore`).
> - As sessões de autenticação utilizam tokens aleatórios e opacos persistidos com segurança na tabela `sessoes` do banco de dados (não utiliza variáveis estáticas como SESSION_SECRET).
> - As conexões TLS/SSL utilizam `rejectUnauthorized: true`.

---

## 2. Execução da Migração DDL (`schema.sql`)

> **AVISO CRÍTICO SOBRE O ESQUEMA DE BANCO DE DADOS:**
> O arquivo `schema.sql` contém criação condicional de tabelas e índices, além de `ALTER TABLE` para as alterações incrementais de compatibilidade (feedback, nutrição, perfil metabólico, sugestões e fila profissional). São 22 tabelas e 187 campos na versão atual.
> A existência de comandos condicionais não garante compatibilidade com qualquer banco legado: valide a migração numa cópia da base antes da implantação.
> **É expressamente proibido executar o script em bancos de terceiros ou em ambientes de produção sem a realização prévia de backup completo e validação técnica de integridade.**

Para aplicar o esquema completo (tabelas, índices, constraints e chaves estrangeiras) em um banco vazio inicial:

```bash
npm run migrate
```

O script lê o arquivo `schema.sql` e executa as instruções SQL em bloco transacional (`BEGIN` ... `COMMIT`).

---

## 3. Bootstrap Seguro da Conta de Administrador

Por regra inegociável de segurança, a conta de **Administrador NUNCA pode ser criada via formulário de signup público**. O bootstrap deve ser feito via servidor com preenchimento seguro via `.env` NÃO commitado:

> **REGRAS DE SEGURANÇA DO BOOTSTRAP:**
> - **Não é permitido fornecer senhas via argumentos CLI**: parâmetros de linha de comando aparecem expostos na lista de processos do sistema operacional (`ps`, Task Manager) e no histórico de comandos. O script recusa expressamente qualquer parâmetro de senha via linha de comando.
> - **Preenchimento seguro no `.env`**: forneça `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo 8 caracteres) e `ADMIN_CPF` no arquivo `.env` local fora de versionamento. O bootstrap recusa a execução antes de conectar caso qualquer dessas variáveis obrigatórias esteja ausente.
> - **Prevenção contra elevação indevida de privilégios**: caso o e-mail informado pertença a um usuário existente não-administrador (aluno ou personal trainer), a operação falha explicitamente em vez de atualizá-la, impedindo a promoção indevida de contas de terceiros.
> - **Idempotência segura**: caso já exista um usuário com o mesmo e-mail cujo papel já seja `admin`, seus dados cadastrais e credenciais são atualizados de forma segura mantendo o papel de administrador inalterado.

```bash
# Execução segura utilizando as credenciais definidas no .env local:
npm run bootstrap:admin
```

A senha será criptografada com **bcrypt** (fator de custo 10) e salva em `usuarios`.

---
## 4. Scripts e Comandos de Execução

### 4.1 Ambiente de Desenvolvimento (2 Terminais Windows PowerShell)

O servidor de desenvolvimento do Vite (`vite.config.js`) roda na porta `3000` e possui proxy configurado para redirecionar requisições `/api` para `http://localhost:5000`. Portanto, são necessários 2 terminais:

**Terminal 1 — Servidor Backend API (porta 5000):**
```powershell
$env:PORT = "5000"
node server/index.js
```

**Terminal 2 — Servidor Frontend Vite (porta 3000):**
```powershell
npm run dev
```

Acesse a aplicação no navegador em `http://localhost:3000`.

---

### 4.2 Ambiente de Produção

Em produção, o Vite compila o frontend para a pasta `dist/public` e o `esbuild` empacota a API Node em `dist/index.js`. O servidor Express unificado serve tanto os arquivos estáticos do frontend quanto as rotas `/api`:

```powershell
# 1. Build de produção (Vite + esbuild)
npm run build

# 2. Execução unificada em produção (porta 3000 por padrão)
npm start
```

---

### 4.3 Tabela de Comandos Disponíveis

| Comando | Descrição |
|---|---|
| `npm install` | Instala todas as dependências de produção e desenvolvimento |
| `npm run dev` | Inicia o servidor de desenvolvimento frontend Vite na porta 3000 com proxy para `/api` (localhost:5000) |
| `npm run build` | Compila os assets do cliente Vite para `dist/public` e empacota o servidor com `esbuild` para `dist/index.js` |
| `npm start` | Inicia o servidor Node em produção executando `dist/index.js` |
| `npm test` | Executa a suíte de testes automatizados com `vitest` |
| `npm run migrate` | Executa o `schema.sql` no banco apontado por `DATABASE_URL` |
| `npm run bootstrap:admin` | Cria ou atualiza a conta de administrador no banco |

---

## 5. Especificação do Contrato da API REST

Todas as rotas de API possuem prefixo `/api`. As mutações (`POST`, `PUT`, `PATCH`, `DELETE`) contam com validação de Origem/CSRF. As sessões são gerenciadas por cookie `fittrack_session` com propriedades `HttpOnly`, `SameSite=Lax` e `Secure` (quando HTTPS/produção).

### 5.1 Autenticação (`/api/auth`)

#### `POST /api/auth/register`
- **Acesso**: Público.
- **Payload (Aluno)**:
  ```json
  {
    "nome": "João Silva",
    "cpf": "123.456.789-00",
    "email": "joao@email.com",
    "senha": "senhaSegura123",
    "tipo": "student",
    "peso_kg": 75.5,
    "altura_cm": 178,
    "data_nascimento": "2000-01-15",
    "sexo_metabolico": "masculino",
    "fator_atividade": 1.55,
    "objetivo": "Hipertrofia"
  }
  ```
- **Payload (Personal Trainer)**:
  ```json
  {
    "nome": "Carlos Personal",
    "cpf": "987.654.321-99",
    "email": "carlos@personal.com",
    "senha": "senhaSegura123",
    "tipo": "personal",
    "cref": "123456-G/SP",
    "area_formacao": "Bacharelado em Educação Física",
    "atuacao_principal": "Hipertrofia e Condicionamento"
  }
  ```
- **Regras**: `tipo: "admin"` é bloqueado com status 403. Personais iniciam com `status_cref: "Pendente"`.
- **Resposta (201)**: `{ "message": "...", "user": { "id": 1, ... }, "profile": { ... } }` + Cookie `fittrack_session`.

#### `POST /api/auth/login`
- **Acesso**: Público.
- **Payload**:
  ```json
  {
    "identifier": "joao@email.com",
    "senha": "senhaSegura123"
  }
  ```
  *(Aceita e-mail ou CPF no campo `identifier`).*
- **Resposta (200)**: `{ "message": "...", "user": { ... }, "profile": { ... } }` + Cookie `fittrack_session`.

#### `POST /api/auth/logout`
- **Acesso**: Autenticado.
- **Resposta (200)**: Invalida a sessão no banco e limpa o cookie HTTP.

#### `GET /api/auth/me`
- **Acesso**: Autenticado.
- **Resposta (200)**: Retorna os dados cadastrais do usuário e perfil vinculado (`perfis_alunos` ou `perfis_personais`).

#### `POST /api/auth/recuperar-senha`
- **Acesso**: Público.
- **Payload**: `{ "email": "joao@email.com" }`.
- Retorna mensagem genérica para não enumerar contas. Em desenvolvimento sem provedor, identifica demonstração sem envio; em produção, falha de entrega não é anunciada como sucesso.
- A redefinição usa `POST /api/auth/redefinir-senha` com token temporário e nova senha, conforme contrato implementado. Tokens são guardados por hash, expiram em uma hora e têm uso único.

---

### 5.2 Preferências e Perfil (`/api/usuarios`)

#### `PATCH /api/usuarios/preferencias`
- **Acesso**: Autenticado.
- **Payload**: `{ "tema": "dark" | "light", "notificacoes": true | false }`
- **Resposta (200)**: Dados de preferência atualizados.

#### `PATCH /api/usuarios/perfil`
- **Acesso**: Autenticado.
- **Payload**: Campos do perfil do aluno (peso, metas, objetivo) ou personal (formação, atuação).
- **Resposta (200)**: Registro atualizado.

---

### 5.3 Módulo do Aluno (`/api/aluno`)

*Requer usuário autenticado com papel `student`.*

#### `GET /api/aluno/dashboard`
Retorna dados reais calculados:
- Treino do dia ativo com lista completa de exercícios.
- Hidratação e alimentação do dia atual.
- Personal trainer vinculado ativo.
- Frequência semanal calculada e meta.

#### `POST /api/aluno/hidratacao`
- **Payload**: `{ "incremento_ml": 250 }`
- **Resposta (200)**: Atualiza cumulativamente o consumo diário em `registros_nutricao`.

#### `POST /api/aluno/refeicoes`
- **Payload**:
  ```json
  {
    "titulo": "Café da Manhã",
    "itens": "3 ovos mexidos, aveia e banana",
    "kcal": 420,
    "proteinas": 28,
    "carboidratos": 45,
    "gorduras": 12
  }
  ```
- **Resposta (201)**: Adiciona refeição no array JSONB e soma macros no diário consolidado.

#### `GET /api/aluno/treinos`
Retorna lista de treinos atribuídos pelo personal ao aluno e modelos públicos da biblioteca.

#### `POST /api/aluno/treinos/execucao`
- **Payload**:
  ```json
  {
    "treino_id": 1,
    "duracao_segundos": 2400,
    "series_executadas": [
      { "nome": "Supino Reto", "serie": 1, "carga": "60", "reps": "10", "concluido": true },
      { "nome": "Supino Reto", "serie": 2, "carga": "65", "reps": "8", "concluido": true }
    ]
  }
  ```
- **Resposta (201)**: Registra a sessão concluída em `execucoes_treino`.

#### `GET /api/aluno/historico`
Retorna evolução temporal real de peso e progressão de cargas agregada a partir das execuções.

#### `GET /api/aluno/personais`
Lista personais cadastrados com CREF validado disponíveis para solicitação de acompanhamento.

#### `POST /api/aluno/vincular-personal`
- **Payload**: `{ "personal_id": 2 }`
- **Resposta (201)**: Cria solicitação com status `'pending'` em `vinculos_aluno_personal`.

---

### 5.4 Módulo do Personal Trainer (`/api/personal`)

*Requer usuário autenticado com papel `personal`.*

#### `GET /api/personal/dashboard`
Retorna contadores reais agregados: alunos ativos, solicitações pendentes e fichas criadas.

#### `GET /api/personal/alunos?status=active`
Lista alunos sob acompanhamento do personal instrutor com metas e última data de treino.

#### `PATCH /api/personal/vinculos/:id`
- **Payload**: `{ "status": "active" | "rejected" | "terminated" }`
- **Regra de Isolamento**: O personal só tem permissão de alterar vínculos onde ele próprio é o `personal_id`.

#### `POST /api/personal/treinos`
- **Payload**:
  ```json
  {
    "titulo": "Treino A - Peito e Tríceps",
    "descricao": "Foco em intensidade e cadência 2-0-2",
    "nivel": "Avançado",
    "tempo_estimado_min": 50,
    "cor_tema": "coral",
    "e_modelo": false,
    "exercicios": [
      {
        "ordem": 1,
        "exercise_id": "0001",
        "nome": "Supino Reto com Barra",
        "grupo_muscular": "chest",
        "series_padrao": "4 × 10 reps",
        "reps_padrao": "10",
        "descanso_padrao": "90s",
        "carga_padrao": "60",
        "gif_url": "https://v2.exercisedb.io/image/0001.gif",
        "notas": "Escápulas aduzidas"
      }
    ]
  }
  ```

#### `POST /api/personal/treinos/atribuir`
- **Payload**:
  ```json
  {
    "treino_id": 1,
    "aluno_id": 5,
    "dias_semana": ["SEG", "QUA", "SEX"]
  }
  ```
- **Regra de Isolamento**: Só permite prescrição para aluno que possua vínculo `'active'` com o personal autenticado.

---

### 5.5 Chat Entre Pares Autorizados (`/api/chat`)

*Requer usuário autenticado.*

#### `GET /api/chat/conversas`
Lista contatos autorizados com contagem de mensagens não lidas.

#### `GET /api/chat/mensagens?com=:usuarioId`
- **Regra de Isolamento**: Valida obrigatoriamente se existe vínculo ativo entre os dois participantes.
- Marca mensagens recebidas como lidas e retorna as 100 mensagens mais recentes, em ordem cronológica.
- `GET /api/chat/eventos` abre um canal SSE autenticado. As telas consultam periodicamente quando ele está indisponível.

#### `POST /api/chat/mensagens`
- **Payload**: `{ "destinatario_id": 2, "texto": "Bom dia! Como foi o treino de hoje?" }`
- **Regra de Isolamento**: Bloqueia envio caso não haja vínculo ativo entre remetente e destinatário.

---

### 5.6 Painel Administrativo (`/api/admin`)

*Requer usuário autenticado com papel `admin`.*

#### `GET /api/admin/usuarios?tipo=personal&status=Pendente`
Lista usuários com filtros por papel, status e termo de busca textual.

#### `PATCH /api/admin/usuarios/:id/status`
- **Payload**: `{ "status": "Ativo" | "Bloqueado" | "Pendente" }`
- Se a conta for bloqueada, todas as sessões ativas do usuário são imediatamente revogadas. Não permite auto-bloqueio.

#### `PATCH /api/admin/personais/:id/validar-cref`
- **Payload**: `{ "status_cref": "Validado" | "Rejeitado" | "Pendente" }`
- A aprovação exige confirmação positiva do serviço externo configurado. Respostas inválidas, erros HTTP e modo demonstrativo não aprovam o registro. Quando a validação real é confirmada, a conta do personal é ativada.

#### `GET /api/admin/estatisticas`
Retorna KPIs globais: contagem de alunos, personais, admins, contas bloqueadas, sessões ativas, fichas e execuções registradas.

---

### 5.7 Catálogo e Exercícios (`/api/exercicios`)

#### `GET /api/exercicios/catalogo?grupo=peitorais&busca=supino`
Consulta o catálogo próprio no PostgreSQL, com busca, filtros em português e paginação. Não consulta ExerciseDB em tempo de execução. Execute `npm run seed:exercises` após configurar o banco. Fotos dependem da publicação no armazenamento e de `EXERCISE_MEDIA_BASE_URL`; instruções e metadados funcionam independentemente delas. Consulte [CATALOGO_PTBR.md](CATALOGO_PTBR.md).

---

### 5.8 Vídeo Feedback (`/api/feedbacks`)

#### `POST /api/feedbacks/video`
- Sem armazenamento configurado, responde `503` e explica a indisponibilidade.
- Com `STORAGE_SIGN_URL` e `STORAGE_API_KEY`, solicita ao provedor URLs HTTPS para envio e acesso ao vídeo; aceita os formatos suportados e até 100 MB. A interface registra links ou arquivos pelo histórico; seleção de arquivo, captura por câmera, prévia e envio assinado estão integrados à tela Evolução; a operação real depende do armazenamento configurado.
- `POST /api/feedbacks` exige uma execução pertencente ao aluno, vínculo ativo e URL HTTPS válida sem credenciais. A exclusão é bloqueada após a visualização pelo personal.


## Fluxos acrescentados na correção do TG

- Histórico: `GET /api/aluno/historico` e `GET /api/personal/alunos/:id/evolucao` aceitam `inicio`, `fim`, `limit` (1–100) e `offset`. A resposta contém contagens e `paginacao.tem_mais`.
- Atribuição: `POST /api/personal/treinos/atribuir` aceita `aluno_ids: [5, 6]` e mantém compatibilidade com `aluno_id`. O lote inteiro é autorizado antes de gravar.
- IA do aluno: `POST /api/aluno/recomendacao-ia`; salvar em `/api/aluno/sugestoes-ia/:id/salvar` com `confirmar_demonstracao: true` quando a origem for mock; enviar em `/api/aluno/sugestoes-ia/:id/enviar`. Exige perfil completo e uma execução anterior.
- Cadastro: peso, altura, nascimento e parâmetro da equação são obrigatórios para aluno. A idade deriva da data; `fator_atividade` aceita as opções oferecidas pelo formulário. Metas não usam biometria artificial. Contas legadas completam o perfil.
- CREF: o cadastro é rápido e pendente; o trabalhador persistente faz a consulta externa e reagenda indisponibilidades. A administração dispõe de reagendamento, sem liberação por mock.
- Auditoria: alterações e seus eventos são confirmados em conjunto. Se não for possível gravar a auditoria, a operação não recebe sucesso.

Use `TZ=America/Sao_Paulo` para o calendário diário brasileiro. Configure o mesmo fuso de operação no ambiente e no banco. Veja `CONFORMIDADE_TG_REVISADO.md` para contratos, limitações e evidências.
