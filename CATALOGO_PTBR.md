# Catálogo próprio de exercícios em português

O catálogo do FIT TRACK agora é consultado no PostgreSQL da plataforma. As telas não consultam ExerciseDB nem fazem download de JSON externo durante o uso. Os nomes, instruções, categorias, músculos, níveis e equipamentos vêm de uma versão fixada da base traduzida.

## Dados e procedência

- Base: [exercicios-bd-ptbr](https://github.com/gugeldev/exercicios-bd-ptbr), versão completa, commit `6bb9118e46cf8d0ee98b42e0285bae5036d04a19`.
- Conteúdo incluído: 873 registros no JSON original, licença CC0 e manifesto com SHA-256. O seeder verifica o checksum antes de escrever.
- Fotos: origem [free-exercise-db](https://github.com/yuhonas/free-exercise-db), commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`, licença incluída. Os 1.746 caminhos foram conferidos na árvore dessa versão.
- Não foram adicionados arquivos de foto, GIF ou vídeo ao projeto. `media-manifest.json` contém apenas caminhos e referências de origem para a transferência ao armazenamento próprio.

Embora o arquivo seja denominado “full translation”, o campo `force` ainda usa inglês. O importador normaliza `push/pull/static` para `empurrar/puxar/estatico`, além de categorias específicas. Slugs são mantidos estáveis e os filtros recebem rótulos em português.

Cinco registros não têm instruções na origem: `Iron_Cross`, `One-Arm_Kettlebell_Swings`, `Push_Press`, `Side_Bridge` e `Side_Jackknife`. Foram preservados e sinalizados para revisão profissional. Não foram criadas instruções fictícias. As mídias são sequências de fotos, não animações.

## Instalação no PostgreSQL

Com o banco configurado em `.env`:

```sh
npm run migrate
npm run seed:exercises
```

A carga faz validação e UPSERT em uma transação, preserva IDs, atualiza metadados e reconstrói os termos de busca dos registros importados. Repetir a carga não duplica exercícios. Exercícios manuais, fichas, execuções e feedbacks existentes não são removidos. A carga não roda automaticamente em cada inicialização do servidor.

`exercicios_catalogo` contém as propriedades e arrays JSONB. `exercicios_busca` é um índice invertido de palavras normalizadas, com chave `(termo, exercicio_id)` e consulta por prefixo. Há índices também em nome/ID, nível, equipamento e categoria. Não requer instalação de extensões PostgreSQL. A busca cobre nomes, instruções, músculos, categoria e equipamento, desconsiderando acentos e caixa. Os resultados são ordenados por nome/ID, com limite e deslocamento. Não é um corretor ortográfico nem uma busca semântica.

## API e telas

- `GET /api/exercicios/catalogo?busca=abdominal&grupo=abdominais&nivel=iniciante&equipamento=peso-do-corpo&limit=24&offset=0`
- `GET /api/exercicios/filtros`: opções disponíveis em português.
- `GET /api/exercicios/:id`: instruções, grupos, metadados e referências de mídia do exercício.

`X-Total-Count` informa o total filtrado; `X-Catalog-Source` identifica a origem PostgreSQL. Banco indisponível retorna 503. Banco sem carga retorna lista vazia com aviso na interface, sem recorrer a serviço público.

Aluno e personal usam o mesmo componente de busca com filtros e paginação. “Como executar” abre instruções e fotos disponíveis. Ao adicionar um exercício à ficha, o ID permanece estável e as instruções são copiadas para as observações, permitindo manter o treino legível. As fichas anteriores continuam funcionando; o editor continua aceitando exercícios manuais.

## Armazenamento de fotos

1. Obtenha as fotos da versão fixada da origem, fora da pasta de código do aplicativo.
2. Transfira os objetos ao bucket S3, Supabase Storage ou Cloudinary, preservando os caminhos de `data/exercises/media-manifest.json`.
3. Configure uma base pública HTTPS, sem credenciais, query ou fragmento:

```dotenv
EXERCISE_MEDIA_BASE_URL=https://seu-dominio-de-midias/exercicios/
```

Exemplo de objeto esperado: `https://seu-dominio-de-midias/exercicios/3_4_Sit-Up/0.jpg`. Configure corretamente cache e tipo de conteúdo no provedor. Não use prefixos de transformação que descartem os caminhos originais sem adaptar a resolução de URLs.

Até configurar o armazenamento, nomes, filtros e instruções funcionam normalmente e a interface informa que as fotos ainda não estão disponíveis. Não há uso automático de GitHub ou de uma API pública como hospedagem de produção. Nenhum upload em nuvem foi realizado: conta, bucket e credenciais do provedor não foram fornecidos.

## Validação e limites

Os testes verificam integridade do dataset completo, importação repetida, normalização, consultas sem rede, filtros, busca sem acentos, paginação, falhas de banco e resolução segura das URLs. A carga dos 873 registros também foi executada no banco descartável de teste. O tempo de carga desse emulador não é referência de desempenho do PostgreSQL.

Para implantação, ainda é necessário executar migração/carga na instância PostgreSQL de destino e publicar as fotos no armazenamento contratado. Não foi utilizada nem alterada uma base remota do usuário.
