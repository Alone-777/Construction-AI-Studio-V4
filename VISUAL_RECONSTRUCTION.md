# Intake visual da Imagem Inicial

## Arquitetura operacional

O fluxo operacional não usa Gemini, OpenAI API, Groq ou provider visual HTTP externo.

A entrada visual passa por:

`Operator Panel → Imagem Inicial → Relay → ChatGPT multimodal → revisão vinculada ao SHA-256 → Construction AI Core`

O Construction AI continua sendo a autoridade de projeto, timeline, blueprint, Physical Execution V2, logística, JOBs e estado OFFICIAL. O ChatGPT interpreta a imagem e devolve uma revisão estruturada; não escreve diretamente em `.firefly`.

## Estados da Imagem Inicial

Uma imagem enviada pelo painel começa como `PENDING_ANALYSIS`.

Ela pode receber somente um destes veredictos:

- `APPROVED`: referência adequada para iniciar o projeto;
- `CORRECTION_REQUIRED`: a imagem precisa ser corrigida antes de qualquer workspace/JOB nascer.

A revisão é vinculada ao SHA-256 exato do arquivo. Trocar a imagem invalida automaticamente a revisão anterior.

## Quando a imagem precisa de correção

A revisão pode apontar, entre outros:

- construção futura já presente cedo demais;
- enquadramento inadequado para continuidade;
- terreno/área de trabalho insuficientemente visível;
- ferramentas, estoque ou logística inicial incompatíveis;
- elementos temporais contraditórios;
- identidade visual que não pode ser preservada de forma plausível.

Nesse caso o ChatGPT registra um `correctionPrompt`. O Operator Panel mostra o motivo e o botão **COPIAR PROMPT DE CORREÇÃO**. Nenhum projeto é criado.

## Quando a imagem é aprovada

A revisão aprovada inclui:

- resumo visual;
- descrição operacional do projeto;
- nome sugerido opcional;
- interpretação estruturada do ambiente, terreno, materiais, câmera e logística relevante.

Somente depois disso `create_project` pode criar o workspace.

O Relay persiste a revisão consumida em:

`.firefly/<workspace>/intake/initial-image-review.json`

Assim, o Construction AI mantém a origem da decisão dentro do próprio projeto.

## Segurança

- upload aceito: JPG/JPEG, PNG ou WebP;
- limite: 10 MB;
- MIME e assinatura binária são validados;
- o painel é loopback;
- a revisão precisa corresponder ao hash atual;
- upload não implica aprovação;
- aprovação não avança estado temporal;
- o estado OFFICIAL do JOB 1 só nasce depois da preparação/revisão da fonte inicial.

## Legado

Os antigos adapters Gemini/OpenAI/Custom podem permanecer temporariamente no histórico do repositório enquanto testes e migrações são estabilizados, mas não são registrados nem usados pelo runtime operacional.
