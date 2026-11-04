> Atualização nutricional: o projeto agora inclui catálogo próprio TACO, medidas POF e cálculo de porções no servidor. Veja [NUTRICAO_TACO.md](NUTRICAO_TACO.md). O registro manual anterior permanece como opção explícita.

> Atualização do catálogo em 27/10/2026: o proxy ExerciseDB foi substituído por catálogo próprio PT-BR com carga transacional. Consulte [CATALOGO_PTBR.md](CATALOGO_PTBR.md). Referências ao catálogo externo abaixo descrevem a entrega anterior e foram superadas por esta atualização.

# Executar FIT TRACK

Use Node.js 22 ou posterior. Instale dependências com `npm ci`.

1. Copie `.env.example` para `.env` e informe `DATABASE_URL` do seu PostgreSQL.
2. Execute `npm run migrate`, `npm run seed:exercises` e `npm run seed:nutrition`. A migração preserva colunas antigas de feedback e adiciona as novas. Em base com vínculos ativos duplicados, resolva os conflitos antes: a migração não escolhe um personal automaticamente.
3. Configure nome, CPF válido, e-mail e senha do administrador nas variáveis `ADMIN_*`. Execute `npm run bootstrap:admin`. Depois remova a senha do ambiente quando não for mais necessária.
4. Abra dois terminais na pasta do projeto: `npm run dev:api` e `npm run dev`. Acesse o endereço do Vite, normalmente porta 3000; a API usa 5000.
5. Para produção, execute `npm run build` e `npm start`, com `NODE_ENV=production`, porta e banco configurados, atrás de HTTPS. Não copie credenciais para variáveis `VITE_*`.

Execute verificações com `npm test` e `npm run build`.

Sem banco configurado, a tela de entrada abre, mas cadastro/login não são simulados. Sem serviço real de CREF, o personal permanece pendente. Sem e-mail configurado, demonstração local não envia mensagens e produção não informa entrega. Sem Gemini, a sugestão é claramente demonstrativa. As credenciais e contratos dos provedores estão descritos em `AUDITORIA_TG.md`.

O ZIP de entrega contém fontes, dados, testes e documentação; a compilação deve ser gerada com `npm run build`. Não inclui `node_modules`, `.env`, credenciais ou os arquivos originais recebidos. A pasta extraída nesta máquina mantém dependências para a validação local.


## Atualização do perfil e da fila

A migração acrescenta nascimento, parâmetro da equação, fator de atividade, sugestões de IA e fila de validação profissional. Preserve os dados legados: os alunos completam os campos ausentes na tela Perfil, sem receber metas calculadas com dados fictícios. A fila inclui profissionais pendentes anteriores, inicia com o servidor e exige serviço CREF configurado para consultar de verdade. Reagendamento também está disponível na administração.

O ambiente de exemplo define `TZ=America/Sao_Paulo`. Mantenha o fuso diário consistente na implantação. Homologue a migração numa cópia do PostgreSQL antes de aplicá-la à base utilizada pelos usuários.

Para vídeos, o provedor deve retornar URLs HTTPS de PUT e acesso, permitir CORS e aplicar limites e proteção dos objetos. Veja o contrato completo e os resultados em `CONFORMIDADE_TG_REVISADO.md`.
