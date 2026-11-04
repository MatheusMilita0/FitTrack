> Atualização nutricional: o projeto agora inclui catálogo próprio TACO, medidas POF e cálculo de porções no servidor. Veja [NUTRICAO_TACO.md](NUTRICAO_TACO.md). O registro manual anterior permanece como opção explícita.

> Atualização do catálogo em 27/10/2026: o proxy ExerciseDB foi substituído por catálogo próprio PT-BR com carga transacional. Consulte [CATALOGO_PTBR.md](CATALOGO_PTBR.md). Referências ao catálogo externo abaixo descrevem a entrega anterior e foram superadas por esta atualização.

# Auditoria FIT TRACK e documentação TG

> Esta é a auditoria histórica de 27/10. A conferência com o Word revisado, as correções de CREF/URLs e as pendências verificadas em 03/11 estão em [CONFORMIDADE_TG_REVISADO.md](CONFORMIDADE_TG_REVISADO.md).

Data: 27 de outubro de 2026.

O projeto foi extraído do ZIP original e comparado com o documento **TG_Sistema_Fitness_Integrado_Harmonico_FINAL_v2(1).docx** recuperado dos anexos da conversa. O ZIP local e o anexo têm o mesmo SHA-256: `F4157E503E8F1CEEB0CD52CDF606F5C1B04BD89FC4C421D514D9A8E9EF42989A`. O documento foi usado como requisito, não como comprovação de que o aplicativo funcionava.

Foram examinados cliente, servidor, esquema SQL, serviços externos, configurações, testes e as 21 imagens do documento, incluindo diagramas e protótipos. Os componentes genéricos de interface que não são importados pelo aplicativo não representam funcionalidades implementadas. O projeto entregue continua em JavaScript, JSX, HTML e CSS.

## Conclusão

O original tinha uma base consistente de autenticação, autorização e persistência, mas alguns módulos existiam apenas parcialmente. As divergências mais graves eram o esquema incompatível de feedback, sucesso fictício de SMTP, recomendação de IA desconectada da tela e do contrato de dados, execução com quantidade fixa de séries e troca silenciosa do personal.

As correções preservam o tema escuro, destaque coral, marca, cartões, navegação inferior, formulários e versões clara/escura existentes. O pacote não inclui o `.env` recebido nem senhas de exemplo. **Não constitui homologação de produção**: a verificação automatizada usa banco descartável pg-mem, e os serviços externos reais não foram chamados com credenciais do usuário.

## O que já estava correto

- Separação entre aluno, personal e administrador no cliente e nas rotas do servidor; administrador não pode ser criado pelo cadastro público.
- Senhas com bcrypt, sessão persistida no banco, cookie HttpOnly e expiração. O cliente não mantém senha ou token em localStorage.
- Consultas parametrizadas e verificações de propriedade em diversos recursos, inclusive atribuição e evolução de alunos.
- Bloqueio de conta e revogação de sessões na administração; personal pendente não pode prescrever.
- Formulários de cadastro/login, preferências, biometria, hidratação e refeições com persistência real, sem painéis preenchidos com alunos fictícios.
- Registro de execuções com cargas/repetições, tabelas de histórico, biblioteca de modelos e estrutura para auditoria.
- Incrementos de água e refeições com UPSERT, evitando perder atualizações concorrentes dessas agregações.
- CSS com variáveis de tema e adaptações para telas menores; imagens de exercícios com descrições alternativas em componentes centrais.

## Achados e correções

| Gravidade | Evidência no original | Correção |
|---|---|---|
| Crítica | `emailService.js` anunciava SMTP real sem enviar e-mail | Removido sucesso fictício. Adaptador HTTP com timeout; modo local explicitamente demonstrativo; produção falha sem provedor |
| Crítica | Rotas de feedback usavam `execucao_id`, `nota_execucao` e `comentario_aluno`, ausentes do SQL | Migração compatível adiciona campos, mantém colunas e linhas antigas; consultas aceitam o treino antigo como alternativa |
| Alta | Vídeo podia ser cadastrado sem execução válida | Execução concluída deve pertencer ao aluno e o aluno precisa de personal ativo |
| Alta | Verificação de visualização seguida de DELETE separado permitia corrida | DELETE também condiciona `visualizado_pelo_personal = FALSE`; bloqueio após leitura foi testado |
| Alta | Tela de treino usava três séries fixas e podia salvar usando ID 1 | Séries e descanso vêm da ficha. Sem ficha/sem série concluída, não salva. ID arbitrário removido |
| Alta | Objetivo, histórico e restrições enviados à IA não correspondiam à assinatura do serviço | Contrato alinhado; histórico/restrições incluídos na consulta; origem Gemini/mock devolvida e exibida |
| Alta | IA e feedback tinham apenas avisos de indisponibilidade na interface | Consulta de IA, envio de link no histórico, leitura e resposta profissional conectados ao servidor |
| Alta | Nova solicitação encerrava automaticamente o vínculo ativo | Solicitação com vínculo ativo retorna conflito; encerramento explícito pelo aluno ou personal; atribuições desativadas |
| Alta | Não havia garantia SQL de apenas um personal ativo | Índice único parcial por aluno com vínculo ativo |
| Alta | Treino vazio ou sem repetições/descanso podia ser salvo | Validação compartilhada para criação, edição e modelos; dias da semana e execução também validados |
| Alta | CPF formatado podia ter tratamento diferente no cadastro e login | Normalização para dígitos e consulta compatível com CPF legado formatado |
| Alta | Validações de cadastro eram mais permissivas em `NODE_ENV=test` | Removidas exceções de nome, CPF e credencial; testes usam CPFs válidos |
| Alta | Conta marcada ativa podia acessar rotas de personal com CREF não validado | Consulta do CREF em cada acesso protegido de personal |
| Alta | Administrador podia marcar CREF validado sem consulta externa | Aprovação agora exige resposta externa real; fallback não aprova e retorna indisponibilidade |
| Alta | Troca de senha verificava token fora da transação | Revalidação e bloqueio de linha dentro da transação antes de consumir token |
| Média | Biometria com meta calórica explícita ignorava recálculo | Mudança biométrica/objetivo recalcula calorias e macros; novos snapshots de biometria |
| Média | Hidratação/refeições usavam UTC, dashboard usava dia local | Uma chave de dia local do servidor para os registros; registros anteriores permanecem no histórico |
| Média | Histórico não tinha filtro, evolução profissional era inacessível | Período para sessões, histórico nutricional/biométrico e painel de evolução do aluno vinculado |
| Média | Chat não atualizava mensagens recebidas sem reabrir | Consulta periódica a cada 1,5 s, cancelamento ao trocar contato e limpeza de mensagens anteriores |
| Média | Histórico do chat limitava as primeiras 100 mensagens | Consulta das 100 mais recentes e apresentação em ordem cronológica |
| Média | Chat rejeitava qualquer link de vídeo | Links HTTPS aceitos entre vinculados; feedback técnico continua tendo registro próprio por execução |
| Média | Exclusão de treino podia apagar sessões por cascata | Exclusão de treino com execução histórica bloqueada |
| Média | APIs de edição, auditoria e modelos não tinham acesso completo pela interface | Gestão de fichas, criação/exclusão de modelos e consulta de auditoria adicionadas |
| Média | Catálogo externo duplicado e bypassava configuração do servidor | Telas usam proxy do servidor, com tratamento do formato de resposta; exercício manual permite criar ficha sem catálogo online |
| Média | Desenvolvimento tinha conflito de portas e alteração de Host no proxy | API local padrão 5000, Vite 3000, comando `dev:api`; Host preservado para validação de origem |
| Média | Painel anunciava ExerciseDB disponível sem consultar serviço | Status passa a “não verificado”; banco só confirmado quando há resposta de métricas |
| Média | Erros eram convertidos em listas vazias no painel administrativo | Falhas agora chegam ao tratamento de erro, evitando confundir indisponibilidade com ausência de usuários |
| Média | Sem limitação de tentativas de autenticação | Limite local de tentativas e tamanho máximo do corpo JSON; cabeçalhos de segurança básicos |

## Matriz de requisitos funcionais

| Requisito | Correspondência final e observações |
|---|---|
| RF01 Login | E-mail/CPF, cookie, perfil, bloqueio; formulário de redefinição usa token do link. Entrega de e-mail depende do provedor |
| RF02 Cadastro | Aluno/personal, CPF algorítmico, unicidade, nome/e-mail/senha/medidas; personal permanece pendente até validação externa |
| RF03 Interface aluno | Dashboard, perfil, histórico, biblioteca, nutrição, chat e sugestão. Origem demonstrativa da IA visível |
| RF04 Treinamentos/feedback | Ficha selecionada, séries, descanso, duração, histórico e feedback por execução. Upload binário depende do armazenamento |
| RF05 Pré-prontos | Modelos persistidos; catálogo de exercícios externo com alternativa manual para montar fichas. Base inicial não é artificialmente preenchida |
| RF06 Nutrição | Refeições, macros, água, recálculo e histórico diário. Cálculo depende dos dados informados e não é uma integração com base alimentar |
| RF07 Chat | Autorização por vínculo, texto e link HTTPS; atualização periódica. Não foi implementado WebSocket nem comprovada latência sob carga |
| RF08 Interface personal | Painel, solicitações, alunos, criação/edição/exclusão de fichas, atribuição, evolução e feedback |
| RF09 Programação | Exercícios, séries, repetições, descanso, observações e dias; revisão de sugestão da IA antes da atribuição |
| RF10 Alunos | Isolamento por vínculo, sessões, cargas, vídeos e orientações. Histórico profissional ainda tem limite de 60 execuções |

## Regras de negócio

| Regra | Resultado |
|---|---|
| RN01 | Credencial validada e hash bcrypt comparado |
| RN02 | Mínimo de seis caracteres com maiúscula/minúscula, também na redefinição |
| RN03 | E-mail/CPF únicos no banco; CPF normalizado. Bases legadas com duplicações formatadas precisam de saneamento antes de migração |
| RN04 | Resolução de rota por perfil e redirecionamento de URL protegida sem sessão |
| RN05 | Serviço de CREF separado; mock permanece pendente; aprovação administrativa exige resposta real |
| RN06 | Recálculo ao alterar objetivo/biometria, inclusive quando a requisição tenta impor calorias |
| RN07 | Lista não vazia, repetições e descanso na criação/edição; validações de atribuição |
| RN08 | Chat por vínculo; removido passe livre de administrador para leitura de qualquer conversa |
| RN09 | Auditoria existente ampliada para nutrição; snapshots biométricos adicionados. Limitação transacional descrita abaixo |
| RN10 | CPF algorítmico igual no teste e na aplicação |
| RN11 | Letras/espaços e até 100 caracteres; apóstrofos não são aceitos conforme redação literal do TG |
| RN12 | Formato de e-mail e pontos indevidos verificados |
| RN13 | Token hash, expiração, uso único e invalidação de sessões. Provedor de entrega é obrigatório em produção |
| RN14 | Feedback vinculado à execução; exclusão bloqueada após visualização |
| RN15 | Biblioteca continua acessível sem personal; fichas particulares dependem de atribuição. A redação “apenas biblioteca” foi interpretada como fonte de treino, mantendo perfil/nutrição disponíveis |
| RN16 | Consumo segregado por dia do servidor, sem apagar o histórico; telas abertas precisam de nova consulta para refletir a virada |
| RN17 | Peso de 20 a 400 kg e altura de 100 a 250 cm, aceitando metros normalizados |
| RN18 | Um vínculo ativo por aluno; rejeição de troca silenciosa e encerramento explícito |

## Casos de uso e diferenças dos protótipos

UC01/UC02: formulários e redirecionamento implementados. UC03: formulário de nova senha agora existe; e-mail real depende do serviço. UC04: camada de CREF presente, sem aprovação simulada. UC05/UC06: perfil, metas e diário persistidos. UC07: biblioteca e catálogo. UC08/UC09: fichas e atribuição; atribuição de vários alunos é feita repetindo a operação por aluno. UC10/UC11: execução e gravação de séries. UC12/UC13: link por execução, leitura e orientação; gravação de câmera e transferência binária não são entregues sem armazenamento. UC14: chat com atualização periódica. UC15: solicitação, aceite, recusa e encerramento. UC16: sessões filtráveis, biometria e nutrição; análise gráfica permanece mais simples que o protótipo. UC17: consulta do aluno e do personal para aluno vinculado, com salvamento profissional para revisão; credencial real ainda é necessária.

As Figuras 4–6 representam autenticação; foram mantidos formulários e identidade, com redefinição acrescentada. As Figuras 7–10 correspondem a dashboard, biblioteca, execução e nutrição; a implementação usa dados persistidos e estados vazios em vez dos números demonstrativos. A Figura 11 mostra conversa com vídeo: a entrega abre links, não reproduz upload hospedado no próprio sistema. As Figuras 12/20 têm indicadores de perfil mais ricos que os dados efetivamente coletados; não foram inventadas métricas. A Figura 13 mostra curva de peso/frequência: há snapshots, sessões e visualização de cargas, mas não reprodução integral dos gráficos. A Figura 14 representa IA: origem Gemini/demonstração foi explicitada. As Figuras 15–18 correspondem a personal, alunos, criação e atribuição: esses fluxos foram preservados e ampliados. A Figura 19 prevê uma central de vídeo com player: entregue fluxo de link protegido por permissão, leitura e resposta; player/armazenamento dependem do provedor. A Figura 21 corresponde ao administrador: métricas reais, moderação, modelos e auditoria; disponibilidade não é presumida.

## Integrações e pendências reais

1. **PostgreSQL:** configurar `DATABASE_URL`, executar migração e criar administrador pelo bootstrap. Nenhum banco remoto foi alterado. Testes em pg-mem não comprovam comportamento concorrente, TLS ou migração numa base existente.
2. **Gemini:** configurar `GEMINI_API_KEY`, `GEMINI_MODEL` e retirar `AI_MODE=mock`. A chave fica no servidor; timeout e fallback são explícitos. Não foi comprovada qualidade clínica/técnica da sugestão. O mock usa objetivo, mas não personaliza histórico/restrições. O serviço ainda usa apenas histórico recente, sem critério formal de “histórico suficiente” do UC17.
3. **CREF:** `CREF_SERVICE_URL` e chave, conforme contrato do fornecedor. O adaptador espera POST com CREF/formação/nome e resposta `{ativo,situacao}`. Esse contrato precisa ser adaptado ao provedor contratado; não há alegação de API oficial universal disponível.
4. **E-mail:** adaptador HTTP recebe remetente/destinatário/assunto/texto/HTML. Configurar URL/chave/remetente e `APP_URL` público. SMTP direto não foi implementado. Demonstração não entrega mensagens e não expõe token pela API.
5. **Vídeos:** serviço espera assinatura de upload pelo provedor; valida tipo/tamanho e HTTPS. A interface entrega links existentes; gravação e transferência do arquivo, expiração de links privados, retenção e antivírus ainda precisam da integração de armazenamento.
6. **ExerciseDB:** depende de conectividade e do contrato da API externa; indisponibilidade não é substituída por catálogo fictício. O editor aceita exercícios manuais.

## Limitações de arquitetura e requisitos ainda parciais

- RNF01 (respostas inferiores a 2 s/concorrrência) e RNF04 (99% de disponibilidade) exigem testes de carga, implantação, monitoramento, backup e restauração. Não foram certificados por build/testes locais.
- RNF02 está fortalecido, mas ainda precisa de revisão de implantação: HTTPS, políticas de armazenamento, sessão por dispositivo, limites distribuídos e gestão de segredos. O limitador desta entrega é por processo; não é distribuído.
- RN09 continua usando auditoria best-effort em parte dos fluxos: falha de log não reverte todas as mutações de negócio. Algumas operações administrativas e de vínculo usam várias instruções fora de uma única transação. O índice de vínculo garante unicidade, mas não substitui um teste de concorrência real.
- Perfil biométrico é histórico de snapshots novos; não é possível reconstruir pesos antigos que o original sobrescreveu. Dados legados continuam precisando de validação antes da migração. Índice único falha explicitamente se já houver dois vínculos ativos; não encerra nenhum silenciosamente.
- Filtro de período alcança sessões, não todas as coleções de biometria/nutrição. A interface profissional apresenta cargas/sessões, mas não todos os gráficos/filtros do TG. Histórico do chat mostra as últimas 100 mensagens, sem paginação de mensagens mais antigas.
- Não há armazenamento de rascunho de treino em andamento: recarregar a página durante a execução perde a ficha ativa e os valores não finalizados. Agora o sistema pede seleção novamente em vez de gravar no treino errado.
- React está modularizado por áreas, mas `StudentScreens.jsx`/`PersonalScreens.jsx` e o CSS ainda são grandes. Foram separados os novos painéis de feedback; uma reorganização completa não foi feita para preservar os fluxos e o visual.
- Algumas interfaces ainda usam erros por toast e chamadas repetidas; não há cache centralizado. Catálogo e imagens externos exigem rede. Os componentes genéricos do template foram preservados, mesmo os não usados.
- Acessibilidade: controles principais têm rótulos e imagens têm alternativas; não houve certificação WCAG, teste completo de leitor de tela ou revisão integral de foco nos painéis.

Esses itens são requisitos parciais ou dependências, não funcionalidades declaradas como prontas. O TG contém ainda referências de RNF sem definição uniforme (por exemplo RNF08 em privacidade); não se deve inferir conformidade automática.

## Verificação

Ver `VALIDACAO.md` para comandos, resultados e limites. As verificações automatizadas não substituem homologação com PostgreSQL e provedores reais.

## Principais arquivos alterados

`schema.sql`; `server/routes/{auth,aluno,personal,admin,chat,feedback,usuarios}.js`; `server/services/{aiService,crefService,emailService,storageService}.js`; middleware de autorização/limite; validadores; `client/src/App.jsx`; `client/src/lib/{api,routes}.js`; telas de aluno/personal/admin/autenticação; novos `FeedbackPanels.jsx`; CSS; configuração Vite; `.env.example`; testes de regressão.
