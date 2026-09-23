# Construction AI Studio — START HERE

Este arquivo é o ponto permanente de retomada do projeto.

## Repositório e branch operacional

- Repositório: `Alone-777/Construction-AI-Studio-V4`
- Branch de trabalho: `feature/v4.2-visual-pipeline`
- Pasta de entrada: `Imagem Inicial/`

## Inicialização fácil

O uso operacional normal é pelo **Operator Panel**.

1. clique no atalho **Construction AI Studio** na Área de Trabalho do Windows;
2. o atalho abre `http://127.0.0.1:8793`;
3. quando não existir projeto ativo, o painel mostra **SEM PROJETO** e permite enviar uma **foto do local** diretamente por upload/arrastar e soltar;
4. no mesmo painel, o operador escolhe uma construção ou deixa o Construction AI sugerir a opção mais plausível e pode acrescentar uma descrição curta.

A pasta `Imagem Inicial/` continua existindo internamente por compatibilidade, mas não é mais o fluxo normal do usuário.

Bridge + Relay + Operator Panel são infraestrutura persistente. Eles ficam habilitados no Windows/WSL e não devem ser reconectados a cada projeto.

Instalação/configuração única, na raiz do Studio:

```bash
npm install
npm run instalar-botao
```

No WSL, `npm run instalar-botao` delega ao Construction AI Relay e:
- habilita os serviços locais;
- instala o runtime oculto no Startup do Windows;
- cria/substitui o atalho **Construction AI Studio**;
- faz o atalho relançar o runtime automaticamente se o WSL estiver dormindo;
- abre somente o Operator Panel em `8793`.

Comandos técnicos, apenas para diagnóstico/desenvolvimento:

```bash
npm run verificar
npm run ligar
```

- `npm run verificar`: verifica raiz, Imagem Inicial, dependências, branch e imagens.
- `npm run ligar`: inicia o Vite/backend de desenvolvimento; não é o fluxo operacional diário.

## Painel operacional preferido

Por enquanto, o painel oficial para uso operacional é o **Construction AI Operator Panel** do repositório `Alone-777/Construction-AI-Relay`:

```text
http://127.0.0.1:8793
```

Abrir pelo Ubuntu/WSL:

```bash
bash ~/Construction-AI-Relay/scripts/open-panel.sh
```

As portas `5173` (Vite/dev) e `8787` (backend do Studio) não devem ser apresentadas ao usuário como painel principal. Elas ficam reservadas para desenvolvimento, API interna e diagnóstico técnico quando necessário.

## Foto do local e Imagem Inicial

No uso normal, envie uma JPG/JPEG, PNG ou WebP diretamente pelo Operator Panel. A imagem
enviada nessa tela é tratada primeiro como **REFERÊNCIA DO LOCAL**. Ela não é automaticamente
o frame temporal inicial da obra.

O painel também persiste a intenção do novo projeto em
`.construction-intake/project-intent.json`: modo `AUTO` para o Construction AI sugerir a
construção ou modo `SELECTED` para avaliar uma escolha do operador, além de uma descrição
opcional.

Regras:
- tamanho máximo: 10 MB;
- upload não cria workspace nem JOB;
- a imagem começa como `PENDING_ANALYSIS`;
- o Relay publica um pacote visual compacto para o ChatGPT;
- o ChatGPT analisa ambiente, terreno, câmera, identidade visual, construção futura, materiais, ferramentas e logística;
- a revisão é vinculada ao SHA-256 exato da imagem;
- `CORRECTION_REQUIRED` mostra no painel o motivo e o prompt de correção;
- `APPROVED` libera a criação do projeto;
- em modo `AUTO`, a análise registra uma construção recomendada, justificativa e alternativas plausíveis;
- em modo `SELECTED`, a análise avalia a construção escolhida contra o terreno e as limitações atuais do pipeline;
- trocar a imagem invalida a revisão anterior.

Para `APPROVED`, a revisão deve conter análise visual estruturada `schemaVersion=1.0.0`. Cada claim usa `FACT`, `HYPOTHESIS` ou `UNKNOWN` e mantém evidência/confiança. O conjunto canônico cobre: tipo de construção, ambiente, terreno, curso d'água, vegetação, componentes visíveis, materiais aparentes, estrutura, fundação, piso, paredes, cobertura, aberturas, áreas externas, caminhos, drenagem, relações espaciais, elementos naturais, itens de preservação e grau aparente de conclusão.

Essa análise estruturada alimenta diretamente o compilador visual do blueprint. A descrição textual é contexto complementar; não é mais a única fonte do mapa da obra.

A referência do local continua sendo `MANUAL_REFERENCE`: orienta design, proporções, materiais,
terreno, ambiente e identidade, mas nunca substitui o estado temporal OFFICIAL e nunca autoriza
elementos futuros. Para o JOB 1, o Construction AI prepara uma imagem OFFICIAL separada, com
**um único trabalhador principal de identidade visual estável**. As ferramentas são governadas
pela operação atual; não ficam congeladas para todo o projeto apenas porque apareceram na primeira
imagem.

O runtime operacional não depende de Gemini, OpenAI API, Groq ou provider visual externo para essa análise.

## Fluxo operacional atual

1. Construction AI determina o próximo JOB pela ordem temporal.
2. Imagem Inicial e referências oficiais alimentam os prompts.
3. Apenas um JOB de vídeo fica ativo por vez.
4. A plataforma manual é **Adobe Firefly**; o modelo selecionado para o JOB é registrado separadamente (atualmente `KLING_3_0`).
5. O vídeo tem 15 segundos.
6. O usuário gera o vídeo manualmente no Adobe Firefly com o modelo indicado pelo JOB.
7. O vídeo volta para validação.
8. O Construction AI decide o estado operacional do JOB e libera correção ou próximo JOB.
9. O ChatGPT atua como orquestrador; o Construction AI continua sendo o sistema executor e a fonte do estado operacional.

## Bootstrap obrigatório via Relay em conversas novas

O fato de `.firefly/` e `.construction-intake/` serem ignorados pelo Git **não** significa que o ChatGPT não possa verificar o estado local. O caminho oficial para isso é:

```text
ChatGPT -> GitHub Relay (inbox/outbox) -> Relay local -> Construction Bridge -> Construction AI Studio
```

Antes de pedir captura de tela, `npm run verificar` ou qualquer confirmação manual de estado, o ChatGPT **deve tentar o Relay primeiro**.

Sequência mínima obrigatória:

1. criar uma solicitação única em `Alone-777/Construction-AI-Relay/inbox/<requestId>.json`;
2. aguardar e ler `outbox/<requestId>.json`;
3. usar `overview` para confirmar branch, commit, workspaces e disponibilidade do estado local;
4. se estiver em `NO_PROJECT`, ler `.construction-intake/project-intent.json` com `read_file` quando existir e usar `initial_image_packet` para obter a foto atual e seu SHA-256;
5. se existir workspace ativo, usar `supervisor_bundle` para identificar JOB, status, tentativa, prompt e próxima ação;
6. só usar fallback manual se houver **falha real do Relay/Bridge após uma tentativa explícita**.

Regras de fallback:
- não responder “não consigo verificar o estado local daqui” antes de tentar o Relay;
- não inferir que o estado local é inacessível apenas porque ele não está versionado no GitHub;
- não pedir captura de tela como primeira opção;
- se o Relay falhar, relatar objetivamente a falha observada e então pedir apenas uma confirmação do painel, `npm run verificar` ou uma captura do Construction AI Studio;
- uma resposta válida do Relay é suficiente para tratar o estado retornado como fonte operacional atual, sem exigir confirmação visual redundante do usuário.

Exemplo mínimo de consulta inicial:

```json
{
  "protocol": "construction-ai-relay/0.1",
  "requestId": "<id-unico>",
  "operation": {
    "op": "overview"
  }
}
```

Em `CRIAR NOVO PROJETO`, depois de confirmar `NO_PROJECT`, o ChatGPT deve continuar pelo Relay com `read_file` do intent e `initial_image_packet`; em `CONTINUAR`, se houver workspace, deve usar `supervisor_bundle`. Captura de tela é contingência, não bootstrap normal.

## Comandos de conversa

Em qualquer conversa nova deste projeto, use exatamente um destes comandos em maiúsculas:

### `CONTINUAR`

Significa: retomar o projeto em andamento.

Ao receber `CONTINUAR`, o ChatGPT deve:
1. ler este `START_HERE.md` na branch operacional;
2. verificar a conexão com o GitHub e o estado atual da branch;
3. usar o repositório e o Construction AI como fonte de verdade;
4. identificar o último estado operacional disponível do projeto;
5. continuar do ponto correto sem criar um novo projeto e sem reconstruir decisões antigas apenas pela memória da conversa;
6. fazer perguntas somente se faltar uma informação indispensável para prosseguir.

### `CRIAR NOVO PROJETO`

Significa: iniciar uma nova construção do zero.

Ao receber `CRIAR NOVO PROJETO`, o ChatGPT deve:
1. ler este `START_HERE.md`;
2. verificar GitHub, branch operacional e funcionamento básico do sistema;
3. confirmar que o sistema está em `NO_PROJECT`; se houver projeto ativo e a intenção for zerar, usar somente o reset guardado com backup;
4. ler, quando existir, `.construction-intake/project-intent.json` pelo Relay para recuperar a intenção salva no painel;
5. solicitar ao Relay `initial_image_packet` e analisar a foto atual junto com essa intenção;
6. se a imagem ou a construção pretendida forem inadequadas, registrar `record_initial_image_review` com `CORRECTION_REQUIRED`, motivo e `correctionPrompt`; não criar workspace/JOB;
7. se forem adequadas, registrar `record_initial_image_review` com `APPROVED`, descrição operacional, nome opcional, `constructionType`, justificativa/alternativas e análise visual estruturada;
8. somente após a aprovação vinculada ao hash atual, enviar `create_project` com `confirm=CREATE_NEW_PROJECT`;
9. aguardar a resposta real do Relay e confirmar o workspace criado;
10. continuar pelo primeiro JOB elegível em ordem temporal;
11. manter o Construction AI como executor e fonte do estado operacional.

Formato final de criação no Relay, depois da análise aprovada:

```json
{
  "protocol": "construction-ai-relay/0.1",
  "requestId": "<id-unico>",
  "operation": {
    "op": "create_project",
    "confirm": "CREATE_NEW_PROJECT"
  }
}
```

A descrição e o nome podem vir diretamente da revisão aprovada da Imagem Inicial; o usuário não precisa repeti-los.

O bootstrap cria o workspace legado `.firefly` (nome interno mantido por compatibilidade) e gera os JOBs oficiais de vídeo com **15 segundos cada**. A foto do local é copiada apenas como `MANUAL_REFERENCE`, nunca como estado temporal. Para o JOB 1, o Construction AI cria um prompt de preparação da imagem `OFFICIAL` do estado inicial com um trabalhador principal consistente; o vídeo só é liberado quando essa fonte temporal existir. O Operator Panel aceita a imagem gerada em **JPG, JPEG, PNG ou WebP** dentro da pasta indicada e normaliza automaticamente para o arquivo canônico `job-001-source.png`; o usuário não deve precisar converter formato manualmente. Cada JOB seguinte usa o último frame aprovado do anterior. O ChatGPT nunca deve criar ou editar `.firefly` diretamente.

Para **novos projetos**, a ordem física canônica começa por:

1. **MARCAÇÃO DA IMPLANTAÇÃO** — medir o perímetro, posicionar estacas visíveis e tensionar corda;
2. **LIMPEZA SELETIVA DA ÁREA MARCADA** — remover apenas vegetação/obstáculos dentro do perímetro, preservando marcação e área externa;
3. fundação/apoios, base e demais operações dependentes.

Workspaces já existentes não são reescritos automaticamente por essa regra.

Esses dois comandos substituem o antigo comando genérico `Construction AI: INICIAR`.

## Regra de acesso local

O ChatGPT não deve exigir, sugerir ou inventar dependências como **Desktop Commander**, "dispositivo conectado", agente local externo ou qualquer outro conector que não esteja explicitamente configurado neste projeto.

O ambiente local oficial é o **Construction AI Command rodando no Windows + WSL**. No uso normal, o atalho **Construction AI Studio** abre o Operator Panel `8793` e o runtime persistente mantém Bridge + Relay + Panel conectados. `npm run ligar` fica reservado a desenvolvimento/diagnóstico.

Se a conversa não conseguir inspecionar diretamente o computador local:
- não declarar o dispositivo como offline sem evidência;
- não bloquear `CONTINUAR` ou `CRIAR NOVO PROJETO` por ausência de um conector não configurado;
- usar o GitHub e o `START_HERE.md` para verificar código e regras;
- **tentar primeiro o GitHub Relay/inbox-outbox e aguardar uma resposta real do Relay local**;
- considerar `.firefly/` e `.construction-intake/` acessíveis indiretamente pelo Relay quando o runtime estiver respondendo;
- somente após falha real dessa tentativa, pedir uma confirmação objetiva do usuário, saída de `npm run verificar` ou uma captura do próprio Construction AI Studio;
- quando a Imagem Inicial precisar ser verificada, preferir `initial_image_packet`; se o Relay estiver indisponível, aceitar a confirmação do painel do Construction AI ou do comando `npm run verificar`; não exigir Desktop Commander.

## Regra de continuidade

O repositório e os arquivos persistidos no Studio são a fonte durável de verdade. Conversas não devem ser usadas como banco de estado do Construction AI. Em retomadas, conferir o repo e o sistema antes de assumir o estado atual.


## Operator Panel como interface principal

Durante a produção, use o painel local:

`http://127.0.0.1:8793`

como console principal do operador.

Regras:
- o painel mostra o prompt atual em destaque;
- existe botão direto `COPIAR PROMPT`;
- o estado do JOB é consultado automaticamente a cada 5 segundos;
- após um PASS registrado pelo ChatGPT via Relay, o JOB atual vira `COMPLETE`, o último frame é extraído e o próximo JOB é liberado;
- o painel troca automaticamente para o próximo prompt;
- em RETRY, permanece no mesmo JOB e mostra o retry prompt;
- o usuário não deve precisar clicar em Atualizar entre JOBs;
- o ChatGPT só deve responder `APROVADO` depois que a decisão correspondente tiver sido confirmada pelo sistema.


## Downloads de vídeo

A pasta operacional fixa para downloads de vídeo do Kling é:

```text
/home/marcio/Construction-AI-Downloads
```

No uso normal, configure o navegador/Adobe Firefly para baixar os MP4 diretamente nessa pasta.

O Operator Panel `8793` monitora essa pasta automaticamente. Quando houver um único JOB atual elegível e um novo MP4 terminar de baixar:
- o vídeo é associado ao JOB atual;
- o sistema cria a tentativa canônica no workspace;
- o JOB passa para `REVIEW_REQUIRED`;
- o vídeo original permanece intacto na pasta de downloads;
- o usuário envia o mesmo vídeo no ChatGPT;
- o Agente Fiscal Visual analisa e registra PASS ou RETRY pelo Relay quando houver provider configurado;
- sem provider ou em qualquer incerteza, o JOB permanece em `REVIEW_REQUIRED` para análise manual no ChatGPT;
- em PASS, o último frame aprovado libera o próximo JOB e o painel troca de prompt automaticamente.

### Agente Fiscal Visual autônomo

O núcleo opt-in do Agente Fiscal Visual está documentado em [VISUAL_FISCAL_AGENT.md](VISUAL_FISCAL_AGENT.md). Ele analisa o contact sheet em duas rodadas independentes e devolve `PASS`, `RETRY` ou `REVIEW_REQUIRED`, sempre vinculado ao JOB, tentativa e SHA-256 da evidência. O agente não escreve diretamente no estado canônico: decisões aprováveis continuam passando pelos gates existentes do Relay/Bridge. Sem provider configurado ou diante de divergência, o fluxo permanece bloqueado em `REVIEW_REQUIRED`.

Não mover manualmente os vídeos para dentro do repositório salvo em caso de diagnóstico.


## Política de vídeo atual — Adobe Firefly + modelo por JOB

A política operacional vigente para novos JOBs e workspaces migrados é:

- plataforma manual: `ADOBE_FIREFLY`;
- campo legado de compatibilidade: `provider = KLING_3_0_MANUAL`;
- modelo atual: `KLING_3_0`;
- limite de prompt da interface Adobe Firefly: **1800 caracteres**;
- duração canônica por JOB: **15 segundos**;
- imagem-para-vídeo em 16:9;
- um único JOB ativo por vez;
- o frame final aprovado continua sendo a fonte temporal OFFICIAL do JOB seguinte;
- IDs de JOBs legados que começam com `firefly:` não são renomeados durante migração, para preservar integridade e histórico;
- o diretório interno `.firefly` é mantido por compatibilidade histórica; neste fluxo ele coincide com a plataforma Adobe Firefly, mas não deve ser usado como fonte de verdade para identificar modelo;
- plataforma e modelo são conceitos separados: Adobe Firefly hospeda a geração; `modelId` identifica o modelo selecionado para o JOB.

Para migrar um workspace existente, use o script protegido `tools/migrate-video-provider-to-kling30.mjs`. Ele cria backup antes de alterar manifest, fila, prompts, checklist e estado de retry.

## Logística física V2 — shadow mode

O `PhysicalExecutionPlan V2` inclui um `equipmentLogisticsPlan` de diagnóstico: origem de ferramentas/materiais, transporte, peso/tamanho, trabalhadores, içamento e preparação visual da fonte. O simulador emite `logisticsPreflight` com `READY`, `PREP_REQUIRED` ou `WOULD_BLOCK`.

Nesta fase, o diagnóstico não bloqueia a geração, não troca os prompts operacionais e não avança `OFFICIAL`. `StageTransaction` e os fiscais continuam sendo a autoridade. Novos JOBs persistem os diagnósticos V2; workspaces existentes não são migrados automaticamente. Inventário não comprova visibilidade: sem observações vinculadas à fonte atual, o sistema registra pendências.

Documentação, limites e exemplos: [PHYSICAL_LOGISTICS_SHADOW.md](PHYSICAL_LOGISTICS_SHADOW.md).

```bash
npm run test:logistics
npm run examples:logistics
```
