# Correções do FIT TRACK e alinhamento com o TG

Data da verificação: 03/11/2026. Requisitos de referência: TG recebido, posteriormente consolidado em `TG_FIT_TRACK_Revisado.docx`. Projeto mantido em JavaScript, React, HTML e CSS, com identidade visual FIT TRACK, tema coral e modos claro/escuro.

## Resultado da correção

As divergências funcionais reproduzidas na conferência foram corrigidas no código e o dicionário foi atualizado. Foram aprovados **165 testes em 17 arquivos**, a compilação do cliente e do servidor e os fluxos locais descritos abaixo. Isso demonstra funcionamento local; não equivale à homologação dos serviços externos, à aprovação de um profissional real ou ao cumprimento de SLA de produção.

## O que já estava coerente e foi preservado

- Perfis de aluno, personal e administrador, com autorização no servidor, bloqueio de contas e proibição de cadastro público de administrador.
- Senhas com bcrypt, sessões no banco, cookie HttpOnly, expiração e revogação; consultas parametrizadas e validações de CPF, e-mail, nome e senha.
- Modelos e fichas, exercícios manuais, parâmetros prescritos, execução e histórico; profissional pendente não recebe permissão de prescrição.
- Solicitação, aceite, recusa e encerramento de vínculo; um personal ativo por aluno e isolamento entre usuários sem vínculo.
- Catálogo próprio PT-BR com **873 exercícios**, filtros e carga reproduzível, sem consulta a API pública de exercícios durante a navegação.
- Nutrição TACO/POF no banco, cálculo de nutrientes por massa no servidor, diário por aluno/data, hidratação acumulada e refeições com snapshots. O registro manual permanece uma opção explícita.
- Feedback associado a execução própria, visualização registrada, resposta profissional e bloqueio de exclusão após leitura.
- Administração de usuários, modelos, auditoria e correspondências TACO/POF, com indicadores derivados do banco.

## Problemas encontrados e correções aplicadas

| Área e referência | Situação anterior | Resultado atual e evidência principal |
|---|---|---|
| Cadastro — UC01, RF02, RN17 | Peso e altura ausentes eram aceitos e substituídos por valores artificiais no cálculo | Cadastro exige peso, altura, nascimento e parâmetro da equação; valida limites e calendário. `routes/auth.js`, `AuthScreens.jsx`, `MetabolicFields.jsx` |
| Nascimento — Figura 5 | Somente idade fixa era armazenada | Nova coluna DATE; idade derivada do aniversário no cadastro e nas consultas. Contas legadas devem completar o perfil; não recebem idade fictícia |
| Metabolismo — Seção 2.1, RN06 | Constante −78 e fator fixo divergiam das equações documentadas | Constante +5 ou −161, conforme parâmetro informado, e fator de atividade selecionável. Peso/altura/objetivo e demais entradas recalculam metas. Valores pendentes ficam identificados; não há substitutos de 70 kg/175 cm/25 anos |
| Auditoria — RN09 | Erros eram ignorados e algumas auditorias ocorriam após COMMIT | Mutações HTTP e auditoria compartilham conexão e transação; sucesso/cookie só é confirmado após COMMIT. Falha retorna erro e solicita ROLLBACK. Operações sem auditoria específica recebem evento mínimo sem corpo sensível |
| Histórico — RF10, UC16, Figura 13 | Cortes fixos de sessões/dias impediam consulta completa | Paginação com total e carregamento de registros anteriores, tanto para aluno como para personal vinculado; biometria, nutrição, sessões e séries acessíveis por período |
| Evolução — Figura 13 | Curvas e filtros incompletos na área profissional | Componente compartilhado de peso, frequência e cargas por exercício. Gráficos informam que representam as páginas carregadas; não simulam tendências sem dados |
| Datas | Limite UTC de sessões não correspondia ao dia nutricional do servidor | Calendário validado, início local inclusivo e dia seguinte exclusivo. Campos DATE recebem datas civis, sem deslocamento UTC. `TZ` configurável no ambiente |
| Vídeo — RF04, UC12/13, Figuras 9/19 | Somente link, sem seleção/captura/upload/player completos | Seleção MP4/WebM/MOV, gravação mediante ação do usuário, prévia, limite de 100 MB, assinatura no servidor e PUT do arquivo. O feedback só é registrado após upload aceito; sem provedor há erro explícito. Player e alternativa por link na interface |
| Vídeo e leitura — RN14 | Player não integrado ao fluxo | Profissional registra visualização antes de liberar o player. A exclusão continua bloqueada após leitura. Novos links exigem HTTPS válido; registros antigos não foram apagados |
| IA — UC17, Figura 14 | Sugestão do aluno não virava ficha nem iniciava treino | Sugestão persistida no servidor, com autoria/origem e propriedade verificadas; salvar é idempotente, iniciar usa a ficha salva, enviar utiliza chat autorizado |
| IA e contexto | Apenas últimas execuções, sem critério mínimo nem série biométrica | Exige perfil completo e uma sessão concluída; consulta até 30 sessões e 30 snapshots biométricos, além de objetivo e restrições. A biometria inicial é registrada no cadastro |
| IA e demonstração | Ausência de um ciclo completo de confirmação | Resposta Gemini e exemplo mock ficam separados; salvar demonstração exige consentimento explícito no cliente e servidor. O exemplo não é anunciado como personalização real |
| Atribuição — RF09, UC09, Figura 18 | Um aluno por operação e falhas de consulta viravam listas vazias | Seleção de vários alunos, validação do lote inteiro antes de gravar, auditoria conjunta, reaproveitamento de atribuição existente; erro com nova tentativa na interface |
| Vínculo — RN18 | Encerrar acompanhamento podia desativar também ficha própria de IA | Encerramento desativa atribuições profissionais e preserva a rotina própria do aluno |
| CREF — RN05, UC04 | Retry imediato sem fila persistente; contrato aceitava coerções inadequadas | Booleano estrito e validação de HTTP; cadastro fica pendente e entra na fila no banco. Trabalhador com bloqueio temporário, tentativas e reagendamento; indisponibilidade não aprova |
| CREF e administração | Validação concluída não voltava à fila ao pedir nova análise | A administração pode reagendar a análise. Estado, prazo e tentativas são reiniciados na mesma transação. Rejeição é exibida como tal; demonstração nunca libera o profissional |
| Chat — RF07, UC14 | Somente consulta a cada 1,5 s | SSE autenticado notifica participantes após confirmação da gravação. Cliente consulta periodicamente quando o canal está indisponível; encerramento e expiração liberam a conexão. Mensagens e sugestões compartilhadas notificam o destinatário |
| Execução — RN07 | Faixas como “8–10 reps” podiam ser enviadas como quantidade executada; campos vazios/booleanos passavam por coerção | Faixa prescrita aparece separada; entrada numérica editável, validação das séries concluídas e aceitação de carga decimal com vírgula na interface. Séries não concluídas não recebem quantidades prescritas como execução real |
| Interface e CSS — RNF03 | Novos filtros podiam transbordar no celular | Filtro do histórico em grade que se adapta, controle do campo de arquivo e uso das cores existentes por variáveis CSS. Telas verificadas em 390 e 1440 px sem transbordamento |
| Documento | RNF08 inexistente, resultados tratados como trabalho futuro e dicionário anterior | Referência do UC13 corrigida para RNF02; resumo, metodologia, resultados e conclusões distinguem construção local e homologação. Dicionário cobre 22 tabelas/187 campos, incluindo fila e sugestões |

## Matriz de requisitos funcionais após a correção

| Requisito | Atendimento observado | Limite material |
|---|---|---|
| RF01 Login | Login e-mail/CPF, sessão, bloqueio, recuperação e redefinição por token | Entrega real de e-mail depende do provedor |
| RF02 Cadastro | Identificação, unicidade, biometria obrigatória, nascimento e perfil profissional | Consulta real de CREF e formação exige contrato externo homologado |
| RF03 Área do aluno | Dashboard, perfil, biblioteca, execução, nutrição, histórico, chat e sugestão | Indicadores somente com dados registrados; não há alunos/consumos de demonstração injetados na produção |
| RF04 Visualizar treinamentos | Ficha, parâmetros, execução e feedback com captura/seleção/player | Transferência real de mídia depende do armazenamento |
| RF05 Modelos | Biblioteca e catálogo próprio filtrável, preservação do exercício manual | Executar cargas e publicar fotos; banco vazio não recebe fichas fictícias automaticamente |
| RF06 Nutrição | Composição por 100 g, conversão explícita de medida, macros/micros, água, metas e histórico | Cobertura de medidas caseiras restrita às correspondências validadas |
| RF07 Chat | Vínculo ativo, leitura/envio, persistência, SSE e contingência periódica | Instâncias múltiplas exigem mensageria compartilhada para eventos; histórico exibe as 100 mensagens mais recentes |
| RF08 Área profissional | Alunos, solicitações, fichas, evolução e orientações | Liberação condicionada ao registro validado |
| RF09 Programação | Criação/edição e atribuição para vários alunos/dias | Homologar concorrência real de atribuições repetidas |
| RF10 Acompanhamento | Histórico paginado por período, gráficos, sessões, biometria e feedback | Gráficos representam os registros carregados, com opção de carregar anteriores |

As regras RN01–RN04 e RN10–RN13 mantêm autenticação, unicidade, perfis e recuperação segura. RN05, RN06, RN09 e RN17 receberam as correções descritas. RN07 preserva parâmetros da ficha e a quantidade real executada. RN08 restringe comunicação por vínculo; RN14 controla propriedade e leitura do feedback; RN16 preserva os dias anteriores; RN18 impede troca silenciosa de profissional. RN15 foi esclarecida no TG em conjunto com UC17: sem personal, modelos são a fonte de treino sem prescrição profissional; o aluno mantém os outros módulos e pode salvar uma sugestão identificada, sem tratá-la como prescrição de um personal.

UC01–UC17 têm fluxos representados no código. UC03, UC04, UC12/13 e UC17 possuem dependências externas cuja efetividade não foi simulada como entrega real. Não foi atribuído percentual de conformidade.

## Nutrição e exercícios

O catálogo contém 873 exercícios, dos quais cinco não têm instruções na fonte; a ausência é informada e não foi preenchida com conteúdo inventado. Imagens ficam fora do repositório, resolvidas por URL de armazenamento. A navegação usa o banco próprio, com carga fixada e integridade verificada.

Há 597 alimentos TACO e 11.801 registros POF, com **12 correspondências específicas pré-validadas**. Não existe equivalência automática entre números TACO e POF. O administrador pode revisar alimento, preparo, massa, evidência e ativação de outras correspondências. A ampliação requer revisão do domínio nutricional, e não uma chave de API.

Nutriente da porção = nutriente por 100 g × massa/100. Ausências não viram zero; totais completos e somas conhecidas ficam separados. Os snapshots preservam a versão, composição e massa da refeição. A água acumula mililitros por aluno/dia e é comparada com a meta estimada a partir do peso.

## Diferenças visuais que não representam funções homologadas

O fluxo técnico de feedback está ligado ao chat: o envio gera aviso com referência à sessão e à central, sem copiar a URL do vídeo para um player que contorne o registro de visualização. A orientação profissional é preservada no feedback e enviada como texto na conversa. Após encerrar o vínculo, o antigo profissional não pode listar, marcar visualização nem responder aos feedbacks desse aluno; o aluno mantém seu histórico.

Foram esclarecidos detalhes dos casos de uso no TG: identificação profissional não exige biometria do aluno; a sessão criada no cadastro conduz à área do perfil, com tela restrita para pendentes; recuperação usa mensagem genérica; criação de ficha também pode ocorrer sem atribuição imediata; exclusão de vídeo é bloqueada após visualização. Esses ajustes eliminam ambiguidades entre os fluxos legados e as regras de segurança e preservam os recursos existentes.

Foram preservados marca, coral, cartões, tipografia, navegação, temas e componentes existentes. Os protótipos são uma referência de fluxo, sem equivalência pixel a pixel. Percentuais de exemplo, assinatura FIT TRACK Pro, avaliações físicas e alguns indicadores adicionais das Figuras 12/20 não possuem módulos completos no código e não são apresentados no TG como recursos entregues. Não há cobrança ou assinatura inventada para preencher a figura.

## Arquitetura, segurança e persistência

- Novos serviços separados para histórico, atribuição, ciclo de IA, fila de CREF e eventos de chat. Novos componentes compartilhados para dados metabólicos, histórico e captura de vídeo.
- A API continua usando PostgreSQL; o banco simulado é exclusivo das verificações. As colunas novas preservam contas legadas, que devem completar o perfil; ausência não recebe dados físicos fictícios.
- As alterações HTTP usam uma transação externa por requisição. Auditoria específica ou evento mínimo participa da mesma confirmação. Testes de rollback usam emulação por snapshot porque pg-mem não reproduz transações reais; homologar isolamento e concorrência em PostgreSQL continua necessário.
- Chaves ficam no servidor. Aprovação profissional requer confirmação externa; modo mock não concede permissão. O navegador recebe somente instruções de envio e URL da mídia, nunca a chave do armazenamento.
- Autorizações do aplicativo não tornam um link público privado no provedor. O armazenamento de vídeos deve aplicar a política de acesso da implantação, com proteção das URLs, expiração adequada, CORS, limpeza de objetos órfãos e controles de tamanho/tipo. Links externos continuam sob controle do respectivo serviço.
- SSE utiliza um emissor em memória por processo e consulta de contingência. Uma implantação com várias instâncias deve compartilhar eventos e limites de autenticação. Isso permanece trabalho operacional explícito; não há garantia fictícia de entrega global.
- `StudentScreens.jsx`, `PersonalScreens.jsx` e CSS ainda contêm agrupamentos extensos de telas. Os fluxos novos foram extraídos para serviços/componentes próprios sem reconstruir a aplicação ou converter para TypeScript.

## Configuração que ainda depende de serviços externos

| Serviço | Configuração e operação necessária | Comportamento sem configuração |
|---|---|---|
| PostgreSQL | `DATABASE_URL`, TLS/CA quando necessário, migração validada, cargas e política de backup | Cadastro e login não são simulados; healthcheck indica indisponibilidade |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` compatível e `AI_MODE` fora de mock; homologar respostas e disponibilidade | Exemplo demonstrativo explicitamente identificado |
| CREF/formação | `CREF_SERVICE_URL`, `CREF_API_KEY`, `CREF_MODE` fora de mock e contrato de resposta verificado | Profissional permanece pendente; a fila não finge aprovação |
| E-mail | `EMAIL_SERVICE_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_MODE` fora de mock e `APP_URL` público HTTPS | Desenvolvimento declara demonstração sem envio; produção não confirma entrega inexistente |
| Fotos de exercícios | Publicação dos ativos e `EXERCISE_MEDIA_BASE_URL` | Instruções e filtros continuam disponíveis, sem fingir demonstração visual |
| Vídeos | `STORAGE_SIGN_URL`, `STORAGE_API_KEY` e bucket compatível com o contrato de PUT assinado | Seleção/câmera locais funcionam; envio de arquivo responde indisponibilidade. Link HTTPS continua opção explícita |

O provedor de assinatura recebe `POST` com Bearer do servidor e JSON `{ owner, contentType, size }`; retorna `{ uploadUrl, videoUrl }`, ambos HTTPS. O navegador envia PUT com o mesmo Content-Type para `uploadUrl`, sem cookies da aplicação. O provedor deve permitir esse fluxo em CORS e aplicar limites e autorização no objeto. A gravação depende de suporte do navegador e permissão de câmera/microfone; não foi acessada a câmera real do usuário.

A fila de CREF inicia junto com o servidor, verifica trabalhos a cada 30 segundos e reagenda indisponibilidades com espera crescente, até 24 horas. O processamento só ativa a conta após resposta positiva do adaptador real; trabalhos pendentes sobrevivem à reinicialização porque ficam no banco. Cadastros pendentes legados são incluídos pela migração. Nenhum profissional real foi aprovado nesta verificação.

## Verificações realizadas

1. **165 testes aprovados em 17 arquivos**: autorização, contratos, catálogos, nutrição, cálculos, auditoria, lote, paginação, CREF, SSE e IA. Respostas externas são simuladas somente nos testes.
2. Compilação Vite e empacotamento esbuild concluídos. Há aviso de tamanho de um pacote do cliente, sem erro de compilação; não é evidência de atendimento de RNF01.
3. Navegador Edge com banco descartável: dashboard, histórico, nutrição e perfil em 390 e 1440 px; atribuição, alunos, chat e feedbacks do personal no celular. Sem erro JavaScript ou transbordamento nas telas verificadas.
4. Ciclo da sugestão em modo demonstrativo: confirmação obrigatória, salvar, enviar ao personal, iniciar e concluir treino com resposta 201 e persistência no histórico.
5. Canal SSE aberto com sessão e transmissão positiva de evento; acesso sem sessão recusado. Falhas de auditoria testadas sem confirmação de cadastro/cookie e com rollback emulado.
6. Dicionário extraído do próprio Word e comparado com metadados SQL: **22 tabelas e 187 campos, sem divergências de nomes**. Tipos e significado também foram apresentados no documento.
7. TG renderizado e revisto: pesquisa na justificativa, 21 figuras com descrição, diagramas melhorados, dicionário e apêndice único com os 17 casos de uso. Conteúdos de requisitos, regras e atores não foram duplicados nos apêndices. Números de página aparecem somente após o sumário completo.

RNF01 (<2 s) e RNF04 (99%) exigem carga e monitoramento em produção e não foram comprovados. RNF02 tem mecanismos e testes locais, sem constituir auditoria de segurança externa. RNF03 exige ainda avaliação com usuários e dispositivos; RNF05 recebeu separação adicional de responsabilidades. Nenhum banco remoto ou provedor externo do usuário foi modificado.

## Arquivos principais alterados

- `schema.sql`, `server/db.js`, `server/app.js`, `server/index.js`, `server/transactionContext.js` e `server/middleware/transaction.js`.
- `server/routes/auth.js`, `usuarios.js`, `aluno.js`, `personal.js`, `chat.js`, `feedback.js`, `admin.js` e serviços `auditService.js`, `calculoMetabolico.js`, `profileView.js`, `historyService.js`, `assignmentService.js`, `aiWorkflow.js`, `crefQueue.js`, `chatEvents.js`.
- `client/src/App.jsx`, `client/src/lib/api.js`, `client/src/index.css`, telas de aluno/personal/admin/autenticação/perfil e componentes `MetabolicFields.jsx`, `HistoryExplorer.jsx`, `VideoCapture.jsx`, `FeedbackPanels.jsx`, `UIComponents.jsx`.
- Testes de alinhamento e regressão, documentação de operação e `.env.example`.

Para executar: instalar dependências, configurar `.env`, validar/aplicar a migração, executar as cargas e seguir `EXECUTAR.md`. O pacote contém fontes, dados, testes e instruções; não contém `.env`, credenciais, dependências instaladas ou compilação. A compilação é gerada com `npm run build`.
