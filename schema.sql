-- ============================================================================
-- FitTrack - Esquema de Banco de Dados PostgreSQL
-- Compatível com PostgreSQL 14+ e execução idempotente
-- ============================================================================

-- 1. Usuários do Sistema (Alunos, Personais e Administradores)
CREATE TABLE IF NOT EXISTS usuarios (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cpf VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('student', 'personal', 'admin')),
    status VARCHAR(20) NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Bloqueado', 'Pendente')),
    tema VARCHAR(10) NOT NULL DEFAULT 'dark' CHECK (tema IN ('dark', 'light')),
    notificacoes BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_cpf ON usuarios(cpf);
CREATE INDEX IF NOT EXISTS idx_usuarios_tipo ON usuarios(tipo);

-- 2. Sessões Autenticadas (Persistência em Banco com expiração)
CREATE TABLE IF NOT EXISTS sessoes (
    token VARCHAR(128) PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em);

-- 3. Perfis de Alunos (Metas e Dados Físicos)
CREATE TABLE IF NOT EXISTS perfis_alunos (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    peso_kg NUMERIC(5,2),
    altura_cm NUMERIC(5,2),
    idade INTEGER,
    meta_treinos_semana INTEGER NOT NULL DEFAULT 4,
    meta_agua_ml INTEGER NOT NULL DEFAULT 2500,
    meta_calorias_kcal INTEGER NOT NULL DEFAULT 2400,
    meta_proteinas_g NUMERIC(6,1) NOT NULL DEFAULT 140,
    meta_carboidratos_g NUMERIC(6,1) NOT NULL DEFAULT 220,
    meta_gorduras_g NUMERIC(6,1) NOT NULL DEFAULT 60,
    objetivo VARCHAR(100) NOT NULL DEFAULT 'Hipertrofia',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Perfis de Personais (CREF, Área e Status de Validação)
CREATE TABLE IF NOT EXISTS perfis_personais (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    cref VARCHAR(30) UNIQUE NOT NULL,
    area_formacao VARCHAR(150) NOT NULL,
    atuacao_principal VARCHAR(100) NOT NULL,
    status_cref VARCHAR(20) NOT NULL DEFAULT 'Pendente' CHECK (status_cref IN ('Pendente', 'Validado', 'Rejeitado')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_perfis_personais_status_cref ON perfis_personais(status_cref);

-- 5. Vínculos entre Aluno e Personal Trainer
CREATE TABLE IF NOT EXISTS vinculos_aluno_personal (
    id BIGSERIAL PRIMARY KEY,
    aluno_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    personal_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'terminated')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_aluno_personal UNIQUE(aluno_id, personal_id)
);

CREATE INDEX IF NOT EXISTS idx_vinculos_aluno ON vinculos_aluno_personal(aluno_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_personal ON vinculos_aluno_personal(personal_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_status ON vinculos_aluno_personal(status);

-- 6. Treinos (Fichas Estruturadas e Modelos de Biblioteca)
CREATE TABLE IF NOT EXISTS treinos (
    id BIGSERIAL PRIMARY KEY,
    criador_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo VARCHAR(120) NOT NULL,
    descricao TEXT,
    nivel VARCHAR(30) NOT NULL DEFAULT 'Intermediário',
    tempo_estimado_min INTEGER NOT NULL DEFAULT 45,
    cor_tema VARCHAR(20) NOT NULL DEFAULT 'coral',
    e_modelo BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_treinos_criador ON treinos(criador_id);
CREATE INDEX IF NOT EXISTS idx_treinos_modelo ON treinos(e_modelo);

-- 7. Exercícios dos Treinos (Composição e Snapshots dos Exercícios)
CREATE TABLE IF NOT EXISTS treino_exercicios (
    id BIGSERIAL PRIMARY KEY,
    treino_id BIGINT NOT NULL REFERENCES treinos(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL DEFAULT 1,
    exercise_id VARCHAR(80) NOT NULL,
    nome VARCHAR(150) NOT NULL,
    grupo_muscular VARCHAR(60) NOT NULL,
    series_padrao VARCHAR(30) NOT NULL DEFAULT '3 × 12 reps',
    reps_padrao VARCHAR(20) NOT NULL DEFAULT '12',
    descanso_padrao VARCHAR(20) NOT NULL DEFAULT '75s',
    carga_padrao VARCHAR(20) NOT NULL DEFAULT '0',
    gif_url TEXT NOT NULL DEFAULT '',
    notas TEXT
);

CREATE INDEX IF NOT EXISTS idx_treino_exercicios_treino ON treino_exercicios(treino_id);

-- 8. Atribuições de Treino a Alunos
CREATE TABLE IF NOT EXISTS atribuicoes_treino (
    id BIGSERIAL PRIMARY KEY,
    treino_id BIGINT NOT NULL REFERENCES treinos(id) ON DELETE CASCADE,
    aluno_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    personal_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    dias_semana TEXT[] NOT NULL DEFAULT ARRAY['SEG', 'QUA', 'SEX'],
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    atribuido_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_atribuicoes_aluno ON atribuicoes_treino(aluno_id);
CREATE INDEX IF NOT EXISTS idx_atribuicoes_personal ON atribuicoes_treino(personal_id);

-- 9. Execuções Concluídas de Treino (Histórico Real de Cargas e Reps)
CREATE TABLE IF NOT EXISTS execucoes_treino (
    id BIGSERIAL PRIMARY KEY,
    treino_id BIGINT NOT NULL REFERENCES treinos(id) ON DELETE CASCADE,
    aluno_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    duracao_segundos INTEGER NOT NULL DEFAULT 0,
    concluido_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    series_executadas JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_execucoes_aluno ON execucoes_treino(aluno_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_treino ON execucoes_treino(treino_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_data ON execucoes_treino(concluido_em);

-- 10. Registros Diários de Nutrição e Hidratação
CREATE TABLE IF NOT EXISTS registros_nutricao (
    id BIGSERIAL PRIMARY KEY,
    aluno_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    agua_ml INTEGER NOT NULL DEFAULT 0,
    calorias_consumidas INTEGER NOT NULL DEFAULT 0,
    proteinas_g NUMERIC(6,2) NOT NULL DEFAULT 0,
    carboidratos_g NUMERIC(6,2) NOT NULL DEFAULT 0,
    gorduras_g NUMERIC(6,2) NOT NULL DEFAULT 0,
    refeicoes JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT uq_nutricao_aluno_data UNIQUE(aluno_id, data)
);

CREATE INDEX IF NOT EXISTS idx_nutricao_aluno_data ON registros_nutricao(aluno_id, data);

-- 11. Mensagens de Chat Entre Pares Autorizados (Aluno <-> Personal)
CREATE TABLE IF NOT EXISTS mensagens_chat (
    id BIGSERIAL PRIMARY KEY,
    remetente_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    destinatario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'video_feedback', 'orientacao')),
    texto TEXT NOT NULL,
    video_url TEXT,
    enviado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lido BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_chat_conversa ON mensagens_chat(remetente_id, destinatario_id);
CREATE INDEX IF NOT EXISTS idx_chat_destinatario_lido ON mensagens_chat(destinatario_id, lido);

-- 12. Tokens Seguros de Recuperação de Senha (Uso Único e Expiração)
CREATE TABLE IF NOT EXISTS tokens_recuperacao_senha (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expira_em TIMESTAMPTZ NOT NULL,
    usado BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tokens_recuperacao_hash ON tokens_recuperacao_senha(token_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_recuperacao_usuario ON tokens_recuperacao_senha(usuario_id);

-- 13. Trilha de Auditoria de Operações Sensíveis
CREATE TABLE IF NOT EXISTS auditoria_operacoes (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    operacao VARCHAR(80) NOT NULL,
    detalhes JSONB NOT NULL DEFAULT '{}',
    ip VARCHAR(45),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_operacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria_operacoes(criado_em);

-- 14. Feedbacks de Treino com Mídia e Imutabilidade
CREATE TABLE IF NOT EXISTS feedbacks_treino (
    id BIGSERIAL PRIMARY KEY,
    treino_id BIGINT NOT NULL REFERENCES treinos(id) ON DELETE CASCADE,
    aluno_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    personal_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    texto TEXT NOT NULL,
    video_url TEXT,
    visualizado_pelo_personal BOOLEAN NOT NULL DEFAULT FALSE,
    resposta_personal TEXT,
    respondido_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_aluno ON feedbacks_treino(aluno_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_personal ON feedbacks_treino(personal_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_treino ON feedbacks_treino(treino_id);


-- Compatibility migration for the structured feedback API (legacy rows retained).
ALTER TABLE feedbacks_treino ADD COLUMN IF NOT EXISTS execucao_id BIGINT REFERENCES execucoes_treino(id) ON DELETE RESTRICT;
ALTER TABLE feedbacks_treino ADD COLUMN IF NOT EXISTS nota_execucao TEXT;
ALTER TABLE feedbacks_treino ADD COLUMN IF NOT EXISTS comentario_aluno TEXT;
ALTER TABLE feedbacks_treino ALTER COLUMN texto SET DEFAULT '';
ALTER TABLE feedbacks_treino ALTER COLUMN treino_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vinculo_ativo_aluno ON vinculos_aluno_personal(aluno_id) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS historico_biometria (
 id BIGSERIAL PRIMARY KEY, aluno_id BIGINT NOT NULL REFERENCES usuarios(id),
 peso_kg NUMERIC(5,2), altura_cm NUMERIC(5,2), objetivo VARCHAR(100),
 registrado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Catálogo próprio: metadados e instruções em português, sem mídia binária.
CREATE TABLE IF NOT EXISTS exercicios_catalogo (
 id TEXT PRIMARY KEY, nome TEXT NOT NULL, forca TEXT, nivel TEXT NOT NULL,
 mecanica TEXT, equipamento TEXT, categoria TEXT NOT NULL,
 musculos_primarios JSONB NOT NULL, musculos_secundarios JSONB NOT NULL,
 instrucoes JSONB NOT NULL, imagens_caminhos JSONB NOT NULL,
 versao_origem TEXT NOT NULL, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_catalogo_nivel ON exercicios_catalogo(nivel);
CREATE INDEX IF NOT EXISTS idx_catalogo_equipamento ON exercicios_catalogo(equipamento);
CREATE INDEX IF NOT EXISTS idx_catalogo_categoria ON exercicios_catalogo(categoria);
CREATE INDEX IF NOT EXISTS idx_catalogo_nome ON exercicios_catalogo(nome,id);
-- Índice invertido de palavras normalizadas, com busca por prefixo sem extensões.
CREATE TABLE IF NOT EXISTS exercicios_busca (
 termo TEXT NOT NULL, exercicio_id TEXT NOT NULL REFERENCES exercicios_catalogo(id) ON DELETE CASCADE,
 PRIMARY KEY(termo,exercicio_id)
);
CREATE INDEX IF NOT EXISTS idx_catalogo_busca_exercicio ON exercicios_busca(exercicio_id);

-- Catálogos TACO e POF: as numerações não são intercambiáveis.
CREATE TABLE IF NOT EXISTS alimentos_taco (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL, busca TEXT NOT NULL, base TEXT, preparo TEXT,
 categoria TEXT, nutrientes_100g JSONB NOT NULL, qualificadores JSONB NOT NULL, versao TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alimentos_taco_nome ON alimentos_taco(nome,id);
CREATE INDEX IF NOT EXISTS idx_alimentos_taco_categoria ON alimentos_taco(categoria);
CREATE TABLE IF NOT EXISTS medidas_pof (
 id TEXT PRIMARY KEY, codigo_alimento TEXT NOT NULL, nome_alimento TEXT NOT NULL,
 codigo_preparo TEXT NOT NULL, preparo TEXT NOT NULL, nome TEXT NOT NULL, busca TEXT NOT NULL,
 gramas NUMERIC(14,6), fonte TEXT NOT NULL, original JSONB NOT NULL, versao TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_medidas_pof_alimento ON medidas_pof(codigo_alimento,codigo_preparo);
CREATE TABLE IF NOT EXISTS vinculos_taco_pof (
 taco_id INTEGER NOT NULL REFERENCES alimentos_taco(id), pof_id TEXT NOT NULL REFERENCES medidas_pof(id),
 ativo BOOLEAN NOT NULL DEFAULT TRUE, criterio TEXT NOT NULL, evidencia TEXT NOT NULL, responsavel_id BIGINT REFERENCES usuarios(id),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(taco_id,pof_id)
);
ALTER TABLE registros_nutricao ADD COLUMN IF NOT EXISTS nutrientes_totais JSONB NOT NULL DEFAULT '{}';
ALTER TABLE registros_nutricao ALTER COLUMN calorias_consumidas TYPE NUMERIC(14,6);
ALTER TABLE registros_nutricao ALTER COLUMN proteinas_g TYPE NUMERIC(14,6);
ALTER TABLE registros_nutricao ALTER COLUMN carboidratos_g TYPE NUMERIC(14,6);
ALTER TABLE registros_nutricao ALTER COLUMN gorduras_g TYPE NUMERIC(14,6);

-- Dados para as equações do TG. Contas legadas devem completar o perfil.
ALTER TABLE perfis_alunos ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE perfis_alunos ADD COLUMN IF NOT EXISTS sexo_metabolico VARCHAR(10) CHECK (sexo_metabolico IS NULL OR sexo_metabolico IN ('masculino','feminino'));
ALTER TABLE perfis_alunos ADD COLUMN IF NOT EXISTS fator_atividade NUMERIC(5,3) NOT NULL DEFAULT 1.55;
ALTER TABLE perfis_alunos ALTER COLUMN meta_calorias_kcal DROP NOT NULL;
ALTER TABLE perfis_alunos ALTER COLUMN meta_proteinas_g DROP NOT NULL;
ALTER TABLE perfis_alunos ALTER COLUMN meta_carboidratos_g DROP NOT NULL;
ALTER TABLE perfis_alunos ALTER COLUMN meta_gorduras_g DROP NOT NULL;
ALTER TABLE perfis_alunos ALTER COLUMN meta_agua_ml DROP NOT NULL;

CREATE TABLE IF NOT EXISTS sugestoes_ia (
 id BIGSERIAL PRIMARY KEY, aluno_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 criador_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 treino JSONB NOT NULL, origem VARCHAR(20) NOT NULL CHECK (origem IN ('mock','gemini')),
 treino_id BIGINT REFERENCES treinos(id) ON DELETE SET NULL,
 enviado_personal_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS validacoes_profissionais (
 usuario_id BIGINT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
 estado VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','processando','concluido')),
 tentativas INTEGER NOT NULL DEFAULT 0, proxima_tentativa TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 bloqueado_ate TIMESTAMPTZ, ultimo_erro TEXT
);
-- Inclui cadastros pendentes anteriores sem duplicar trabalhos existentes.
INSERT INTO validacoes_profissionais(usuario_id)
 SELECT p.usuario_id FROM perfis_personais p JOIN usuarios u ON u.id=p.usuario_id
 WHERE p.status_cref='Pendente' AND u.status='Pendente'
 ON CONFLICT (usuario_id) DO NOTHING;
