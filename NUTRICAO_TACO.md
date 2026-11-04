# Base nutricional TACO e medidas caseiras POF

O FIT TRACK agora consulta alimentos e medidas no PostgreSQL da própria aplicação. Não depende de uma API nutricional pública durante o uso. A refeição pode ser montada com alimentos da TACO, em gramas ou por uma medida caseira vinculada e revisada. O cálculo e a gravação dos nutrientes são realizados no servidor.

## Fonte e versão

- Repositório: [brolesi/taco](https://github.com/brolesi/taco), commit `b800c910dfc9d2e8e6bab45dd42e5b8f5167b466`.
- Composição processada: **597 alimentos**, provenientes da TACO, 4ª edição, NEPA/UNICAMP.
- Medidas: **11.801 registros POF/IBGE**, com alimento, preparo, tipo de medida, massa e descrição da fonte.
- CSVs originais dessa versão, JSON normalizado, licença do repositório e manifesto de checksums estão em `data/nutrition/`.
- Os CSVs complementares de ácidos graxos e aminoácidos foram preservados como referências. O cálculo desta entrega utiliza a composição centesimal, que contém energia, macronutrientes, fibras, minerais e vitaminas disponíveis; os perfis complementares não foram acrescentados aos totais da interface.

O processamento preserva os valores de energia publicados. Eles não são substituídos por uma conta genérica de proteínas/carboidratos/lipídios vezes 4/4/9. O [dicionário da fonte](https://github.com/brolesi/taco/blob/b800c910dfc9d2e8e6bab45dd42e5b8f5167b466/docs/dicionario-dados.md) explica as unidades, as ausências e as particularidades da energia e dos carboidratos.

## TACO e POF não possuem uma chave comum

O próprio projeto de origem esclarece que os códigos IBGE e os IDs TACO são independentes. Não foi feita correspondência automática por código, nome aproximado ou “primeiro resultado”. Variedade e preparo mudam a composição; uma medida de banana cozida não é aplicada à banana crua.

A entrega inclui **12 vínculos específicos iniciais**: oito medidas para arroz integral cozido e quatro para banana prata crua. Foram selecionadas apenas linhas cuja descrição da própria fonte POF explicita essas características. Exemplos: colher de sopa de arroz integral cozido, 20 g; unidade de banana prata crua, 75 g. A justificativa e a evidência textual ficam gravadas em `vinculos_taco_pof`. Essa curadoria técnica não é apresentada como validação clínica de todas as medidas da POF.

Os outros alimentos podem ser registrados por gramas. A administração ganhou um painel para localizar um alimento TACO e uma medida POF, conferir nomes/variedade/preparo e justificar um novo vínculo. A confirmação registra o responsável. A API também permite desativar um vínculo; repetir o seeder não reativa vínculos desativados.

## Instalação

Depois de configurar `DATABASE_URL`:

```sh
npm run migrate
npm run seed:nutrition
```

O seeder confere os checksums, importa em uma transação e atualiza registros pelos IDs estáveis. A carga pode ser repetida sem duplicação. Os registros nutricionais dos alunos e os valores já consumidos não são apagados ou recalculados retroativamente.

Para reproduzir a transformação dos CSVs dessa mesma versão, use `npm run prepare:nutrition`. Alterar os arquivos de origem exige uma atualização deliberada de versão, manifesto e curadoria; a importação recusa arquivos diferentes dos checksums registrados.

## Cálculo

Para um nutriente disponível na composição por 100 g:

```text
nutriente da porção = nutriente por 100 g × gramas consumidos / 100
gramas consumidos = quantidade da medida × massa da medida POF
```

Exemplo conferido: 2,5 colheres de sopa do arroz integral cozido vinculado correspondem a 50 g. Cada nutriente recebe metade do valor tabelado por 100 g. Quantidades fracionárias são aceitas.

A API recebe IDs de alimentos, IDs de medidas e quantidades. Ela resolve os valores no banco, verifica a correspondência da medida e calcula os nutrientes. Calorias ou macros enviados pelo cliente não substituem o cálculo quando a refeição utiliza alimentos TACO. Uma medida não vinculada ao alimento, quantidade negativa/zero, booleanos ou porção fora dos limites retornam erro.

O diário guarda um snapshot dos alimentos, quantidades, massas, valores calculados, qualificadores e versão da composição. Atualizar o catálogo posteriormente não modifica refeições antigas.

## Ausências e traços

- Células não analisadas/não aplicáveis permanecem `null`, com qualificador. Não viram zero.
- A convenção `1e-05` da origem é preservada com o qualificador `traco`; ela representa valor abaixo de quantificação, não uma medição exata.
- Os quatro carboidratos ligeiramente negativos, calculados por diferença na origem, são preservados no CSV original. Para o cálculo de ingestão são tratados como indisponíveis/inconsistentes, sem subtrair nutrientes do total e sem transformá-los em zero conhecido.
- Se faltar um valor em algum alimento, o total desse nutriente fica não informado/parcial. A soma das parcelas conhecidas é mantida separadamente, e a interface sinaliza a limitação.

O registro manual existente foi mantido como opção explícita, por exemplo para rótulos de produtos que não constam da TACO. Valores manuais não são identificados como composição oficial TACO. Refeições manuais antigas, sem informação de vitaminas/minerais, tornam esses totais diários parciais.

## Persistência e água

- `alimentos_taco`: composição por 100 g, qualificadores, categoria, preparo e versão.
- `medidas_pof`: registros independentes de massa, preparo e fonte.
- `vinculos_taco_pof`: correspondências explícitas, evidência e responsável.
- `registros_nutricao`: uma linha por aluno/dia, água em ml, refeições e totais nutricionais.

A refeição é anexada sob bloqueio da linha diária, junto com o recálculo dos totais e a auditoria, dentro da mesma transação. Incrementos de água não são sobrescritos pelo registro da refeição. A massa corporal continua participando da estimativa de meta hídrica já existente no aplicativo; essa estimativa não é atribuída à TACO. Alterar o peso passa a atualizar essa meta. O consumo de água acumulado é independente da meta.

O dia é definido pelo horário do servidor. O dia anterior permanece no histórico; uma nova data começa sem consumo registrado. A tela nutricional atualiza ao recuperar o foco e periodicamente, sem apagar dados antigos.

## API

- `GET /api/nutricao/alimentos?busca=arroz%20integral&limit=24&offset=0`
- `GET /api/nutricao/alimentos/1`: composição e medidas vinculadas.
- `POST /api/nutricao/calcular`: prévia calculada no servidor.
- `POST /api/aluno/refeicoes`: gravação; o corpo pode conter `titulo` e `alimentos`.
- Administração: busca em `/api/nutricao/medidas-pof`, confirmação em `/api/nutricao/vinculos` e desativação pelo par TACO/POF.

Consultas e cálculos exigem sessão. Alterações de correspondência exigem perfil administrador. Consultas usam parâmetros; falhas de banco não produzem valores nutricionais fictícios.

## Verificação e implantação

Foi executada a carga integral de 597 alimentos e 11.801 medidas no banco descartável de teste. Os testes cobrem checksum, parsing, importação repetida, frações, macros/micros, ausências, conversão por medida, incompatibilidade entre alimentos, falta de rede, autorização e preservação de água/auditoria. O navegador foi usado para buscar arroz, selecionar a colher, registrar 2,5 unidades e conferir o diário no celular.

O PostgreSQL de destino ainda precisa receber a migração e a carga. Testes em pg-mem não substituem homologação de concorrência, backup e recuperação em PostgreSQL real. Não foi alterado um banco remoto do usuário.
