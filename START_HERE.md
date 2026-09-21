# Construction AI Studio — START HERE

Este arquivo é o ponto permanente de retomada do projeto.

## Repositório e branch operacional

- Repositório: `Alone-777/Construction-AI-Studio-V4`
- Branch de trabalho: `feature/v4.2-visual-pipeline`
- Pasta de entrada: `Imagem Inicial/`

## Inicialização fácil

O uso operacional normal é pelo **Operator Panel**. Antes de um projeto novo:

1. coloque a Imagem Inicial em `/home/marcio/Construction-AI-Studio-V4/Imagem Inicial`;
2. clique no atalho **Construction AI Studio** na Área de Trabalho do Windows;
3. o atalho abre `http://127.0.0.1:8793`.

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

## Imagem Inicial

Coloque preferencialmente uma única JPG, JPEG, PNG ou WebP em:

```text
<raiz-do-repositorio>/Imagem Inicial/
```

O Visual Pipeline também permite selecionar a imagem pelo painel. Quando o pipeline do projeto começa, a referência fica bloqueada para preservar a consistência.

A Imagem Inicial entra como `MANUAL_REFERENCE`. Ela orienta design, proporções, materiais, terreno, ambiente e identidade, mas nunca substitui o estado temporal OFFICIAL e nunca autoriza elementos futuros.

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
3. tratar o trabalho como um projeto novo, sem reutilizar o estado operacional de uma construção anterior;
4. verificar que existe exatamente uma Imagem Inicial;
5. se a descrição do que será construído ainda não estiver disponível, pedir somente essa informação indispensável;
6. enviar pelo repositório privado `Alone-777/Construction-AI-Relay` uma operação guardada `create_project` com `confirm=CREATE_NEW_PROJECT`;
7. aguardar a resposta real do Relay e confirmar o workspace criado;
8. continuar pelo primeiro JOB elegível em ordem temporal;
9. manter o Construction AI como executor e fonte do estado operacional.

Formato operacional do Relay:

```json
{
  "protocol": "construction-ai-relay/0.1",
  "requestId": "<id-unico>",
  "operation": {
    "op": "create_project",
    "description": "<descrição da construção>",
    "name": "<nome opcional>",
    "confirm": "CREATE_NEW_PROJECT"
  }
}
```

O bootstrap cria o workspace legado `.firefly` (nome interno mantido por compatibilidade) e gera os JOBs oficiais de vídeo com **15 segundos cada**. A Imagem Inicial é copiada apenas como `MANUAL_REFERENCE`, nunca como estado temporal. Para o JOB 1, o Construction AI cria um prompt de preparação da imagem `OFFICIAL` do estado inicial; o vídeo só é liberado quando essa fonte temporal existir. Cada JOB seguinte usa o último frame aprovado do anterior. O ChatGPT nunca deve criar ou editar `.firefly` diretamente.

Esses dois comandos substituem o antigo comando genérico `Construction AI: INICIAR`.

## Regra de acesso local

O ChatGPT não deve exigir, sugerir ou inventar dependências como **Desktop Commander**, "dispositivo conectado", agente local externo ou qualquer outro conector que não esteja explicitamente configurado neste projeto.

O ambiente local oficial é o **Construction AI Command rodando no Windows + WSL**. No uso normal, o atalho **Construction AI Studio** abre o Operator Panel `8793` e o runtime persistente mantém Bridge + Relay + Panel conectados. `npm run ligar` fica reservado a desenvolvimento/diagnóstico.

Se a conversa não conseguir inspecionar diretamente o computador local:
- não declarar o dispositivo como offline sem evidência;
- não bloquear `CONTINUAR` ou `CRIAR NOVO PROJETO` por ausência de um conector não configurado;
- usar o GitHub e o `START_HERE.md` para verificar código e regras;
- para estado local realmente indispensável, pedir somente uma confirmação objetiva do usuário, saída de `npm run verificar` ou uma captura do próprio Construction AI Studio;
- quando a Imagem Inicial precisar ser verificada, aceitar a confirmação do painel do Construction AI ou do comando `npm run verificar`; não exigir Desktop Commander.

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
- o ChatGPT analisa e registra PASS ou RETRY pelo Relay;
- em PASS, o último frame aprovado libera o próximo JOB e o painel troca de prompt automaticamente.

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
