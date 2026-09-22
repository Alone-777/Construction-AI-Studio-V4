# Logística física no PhysicalExecutionPlan V2

Esta evolução é exclusivamente **SHADOW**. O plano V2 passa a registrar como as ferramentas e materiais chegam ao trabalho, quais trabalhadores/equipamentos são necessários e o que precisaria ser preparado na imagem de origem. Os prompts operacionais, a fila e o mecanismo de avanço de `OFFICIAL` continuam sob as autoridades existentes.

## Integração existente

| Ponto | Responsabilidade |
| --- | --- |
| `WorldState.materials/tools` | Origem, localização, quantidade e disponibilidade; novos metadados opcionais de manuseio/equipamento. |
| `ConstructionBlueprint` | Perfil de carga por operação/material e proposta de pequeno ponto de estoque numa zona existente. |
| `StagesExecutor` → `planPhysicalExecutionV2` | Reutiliza mapa, inventário, operação, duração e `config.workerCount`; anexa `equipmentLogisticsPlan`. |
| `simulatePhysicalExecution` | Emite `logisticsPreflight` separado da validação operacional; verifica revisão e fingerprint completo de `OFFICIAL`. |
| Artefato provider-neutral V2 | Transporta plano e diagnóstico em `logisticsShadow`. |
| Bridge manual / criação de projeto | Persiste diagnóstico, proposta de preparação e preview nos artefatos V2 dos novos JOBs. |
| `StageTransaction` e fiscais | Permanecem como autoridade de commit; não recebem um novo gate de logística nesta fase. |

O contrato filho usa o vocabulário de ações V2 (`APPROACH`, `GRIP`, `LIFT`, `MOVE_MATERIAL`, `POSITION`, `FASTEN`/`PLACE`, `RELEASE`). Não cria outro grafo operacional, scheduler, inventário, cadastro de equipe ou mecanismo de commit. A projeção de logística é simbólica e local ao JOB, sem escrita cumulativa em `OFFICIAL`.

Campos novos são opcionais nos contratos existentes. Planos legados sem logística mantêm o comportamento anterior. Falhas do diagnóstico são capturadas e registradas; não substituem aprovação/rejeição fiscal.

## Regras implementadas

1. **Ferramentas:** devem estar registradas e localizadas, ou já constar em `currentTool`. A ferramenta já carregada não é duplicada. Antes de carregar material/trocar ferramenta, é colocada num apoio. Ferramenta com outro trabalhador exige transferência explicitamente preparada.
2. **Estoque compacto:** `logisticsArea` descreve um ponto organizado dentro de uma zona existente. O blueprint por descrição propõe a borda de `Z1`. Isso não move estoque nem prova que ele aparece na imagem.
3. **Materiais:** origem não vazia, zona registrada, disponibilidade e quantidade suficiente são obrigatórias. Estoques ambíguos com o mesmo identificador exigem resolução. Material em `visualBasis` sem quantidade declarada não é aceito como consumo verificável.
4. **Cadeia física:** aproximação → pegar → levantar → transportar → posicionar com apoio → fixar/assentar → soltar. O validador rejeita etapas ausentes, fora de ordem, retirada em zona errada, destino não autorizado e soltura sem apoio.
5. **Carga/tamanho:** `HandlingProfile` descreve uma peça/lote manuseado. As unidades do blueprint nunca são interpretadas como quilogramas. Peso, tamanho ou altura desconhecidos impedem `READY`; valores inválidos são rejeitados.
6. **Altura:** transporte horizontal e içamento no destino são distintos. O método inicial conservador exige talha/polia, rigging ancorado e plataforma de trabalho para operações elevadas.
7. **Equipe:** reutiliza `workerCount`, aceita mínimos de 1, 2, 3 ou mais e requer evidência de trabalhadores distintos e rotas de chegada. Não cria trabalhadores no mundo.
8. **Equipamentos:** capacidade, alcance, ancoragem, disponibilidade e preparo no ponto de trabalho são verificados. Aumentar o número de pessoas não substitui equipamento para peças pesadas.
9. **Rotas/tempo:** reutiliza `checkAccessibility`; rejeita zonas bloqueadas e permite restrições explícitas de trânsito. Zonas preservadas não são automaticamente intransitáveis. Cadeias longas demais propõem preparação/divisão, sem inserir JOBs.
10. **Imagem de origem:** inventário planejado nunca equivale a evidência visual. Fonte ausente/desconhecida exige observação, retirada ou entrega coerente antes de um futuro uso operacional.

Os limiares de `VISUAL_HANDLING_POLICY` são heurísticas de plausibilidade visual: acima de 15 kg ou peça longa (>2,5 m), exigir equipe; acima de 40 kg, exigir suporte mecânico; a partir de 2 m de instalação, exigir içamento/acesso. Classes declaradas e `minimumWorkers` podem tornar a regra mais conservadora. **Não são limites certificados de carga ou um cálculo de engenharia.**

## Preflight e evidência

| Resultado | Significado no shadow |
| --- | --- |
| `READY` | Dados fornecidos satisfazem as regras simbólicas; não autoriza geração nem commit. |
| `PREP_REQUIRED` | Falta confirmação visual, chegada de trabalhadores ou preparo de equipamento. |
| `WOULD_BLOCK` | Origem/carga/rota/quantidade/equipe/equipamento/cadeia/tempo incompatível ou desconhecido. |

`wouldBlockGeneration` descreve a decisão futura, sem bloquear o fluxo atual. `commitAvailable` é sempre `false`.

Observações entram em `logisticsContext.sourceEvidence` e precisam corresponder a `sourceFrameId`, ao hash SHA-256 esperado em `sourceFrameHash` e à revisão atual de `OFFICIAL`. Cada recurso tem identificador, zona, evidência e visibilidade (`VISIBLE`, `OFFSCREEN_ACCESSIBLE`, `ABSENT`, `UNKNOWN`). Estoque fora do quadro precisa de rota documentada igual à rota de transporte verificada. Equipe precisa de identificadores distintos, incluindo o personagem principal.

O chamador deve obter o hash e as observações da fonte real. Esta implementação **não calcula o hash de pixels, não analisa imagens automaticamente e não possui uma tela de coleta de evidência**. Sem esse contexto, o pipeline normal emite pendências, nunca inventa visibilidade. Alterações no inventário oficial invalidam o diagnóstico anterior.

## Imagem inicial e continuação

`compileLogisticsSourcePreparation` acrescenta uma proposta separada ao compilador de imagens existente:

- Antes de aceitar a primeira fonte: pode descrever um ponto compacto apenas com recursos registrados, disponíveis e já localizados na zona proposta. Preserva terreno, câmera, identidade e progresso zero; não acrescenta estrutura futura.
- Após um frame aprovado: mantém o frame exato e propõe retirada, entrega e montagem de equipamento pelo fluxo revisado existente. Não fornece instrução para pintar novos itens no frame oficial.

Toda proposta tem `requiresReview: true` e `changesOfficial: false`. Esta fase não gera imagens, não substitui o prompt oficial de preparação e não altera arquivos `.firefly` existentes. A Imagem Inicial continua sendo `MANUAL_REFERENCE`, conforme `START_HERE.md`.

## Preview de prompt

`compileLogisticsShadowPrompt` recompõe e valida o diagnóstico antes de emitir um preview explicitamente marcado `SHADOW`. Mantém as cadeias completas, transformação, progresso, proibições e correções de retry. Recusa preview quando há pendências ou quando excederia o orçamento de 1.800 caracteres; não trunca movimentos para caber.

`generationAuthorized` é sempre `false`. O compilador Adobe operacional ignora o campo de diagnóstico e continua gerando o mesmo prompt. Promover essas regras a bloqueio real ou inserir preparações no fluxo requer uma evolução posterior, após observar os resultados do shadow.

## Exemplos e testes

```bash
npm ci
npm run test:logistics
npm run examples:logistics
npm test
npm run build
```

Os exemplos são sintéticos e somente de leitura, sem provider, vídeo, migração ou acesso a workspace ativo.

| Exemplo | Resultado esperado |
| --- | --- |
| Tábua leve, estoque observado e uma pessoa | `READY` |
| Inventário registrado sem observação da fonte | `PREP_REQUIRED` |
| Peça longa com somente uma pessoa | `WOULD_BLOCK` |
| Viga pesada elevada sem equipamentos | `WOULD_BLOCK` |
| Viga já preparada no destino, duas pessoas, carrinho, talha/rigging ancorados e plataforma compatíveis | `READY` |

As regressões verificam também conservação simbólica de estoque, ferramenta já em mãos, perfis inválidos, fontes desatualizadas, rotas, apoio antes da soltura, integridade do prompt, isolamento de exceções e autoridade dos fiscais/rollback. Há testes de persistência em novos JOBs e compatibilidade do script protegido de migração; executar testes não migra o projeto do usuário.

## Limites desta primeira versão

- Um recurso/material é tratado por peça/lote sequencial, sem geometria 3D, distância métrica, ergonomia ou ciclo automático de várias viagens. Lotes fracionáveis devem ter perfil/quantidade coerentes fornecidos pelo chamador.
- O mínimo de um segundo por etapa detecta cadeias obviamente incompatíveis com o clipe; não garante que todo o trabalho caiba realmente em 15 segundos.
- Transporte pesado entre zonas exige plano de carga na origem e descarga no destino. O modelo atual de equipamento fixo recusa esse caso com `LOGISTICS_HEAVY_LOADING_PLAN_REQUIRED`; não usa uma talha distante para carregar a peça magicamente. O exemplo válido começa com a carga já preparada no local registrado.
- Equipamento fora do ponto de trabalho gera proposta de preparação, não uma movimentação fictícia. Observações e metadados declarados precisam de revisão humana ou de um analisador visual futuro.
- Não há migração automática de JOBs em revisão, alteração de tentativas, liberação de próximos JOBs, ativação de provider ou garantia de que um gerador de vídeo respeitará o plano.

