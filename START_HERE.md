# Construction AI Studio — START HERE

Este arquivo é o ponto permanente de retomada do projeto.

## Repositório e branch operacional

- Repositório: `Alone-777/Construction-AI-Studio-V4`
- Branch de trabalho: `feature/v4.2-visual-pipeline`
- Pasta de entrada: `Imagem Inicial/`

## Comandos locais

Na raiz do repositório:

```bash
npm run verificar
npm run ligar
```

- `npm run verificar`: mostra a raiz absoluta do Studio, o caminho absoluto da pasta Imagem Inicial, verifica dependências, .env, branch e imagens encontradas.
- `npm run ligar`: inicia backend e painel Vite juntos. Ctrl+C encerra os dois.

Na primeira instalação ou depois de trocar dependências:

```bash
npm install
```

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
3. Apenas um JOB Firefly de vídeo fica ativo por vez.
4. O vídeo tem 8 segundos.
5. O usuário gera o vídeo manualmente no Adobe Firefly.
6. O vídeo volta para validação.
7. O Construction AI decide o estado operacional do JOB e libera correção ou próximo JOB.
8. O ChatGPT atua como orquestrador; o Construction AI continua sendo o sistema executor e a fonte do estado operacional.

## Comandos de conversa

Em uma conversa nova deste projeto, use uma destas frases:

### `Construction AI: CONTINUAR`

Objetivo: retomar o sistema existente. O primeiro passo é ler este `START_HERE.md`, verificar o GitHub Relay e a branch operacional, e então continuar do estado atual sem reconstruir decisões antigas por memória da conversa.

### `Construction AI: NOVO PROJETO`

Objetivo: começar uma construção do zero. Primeiro verificar conexão com o repo e o funcionamento local; depois confirmar/usar a Imagem Inicial e iniciar a sequência temporal desde o primeiro JOB elegível.

### `Construction AI: VERIFICAR`

Objetivo: auditar conexão GitHub, branch atual, arquivos essenciais e estrutura do fluxo antes de modificar qualquer coisa.

## Regra de continuidade

O repositório e os arquivos persistidos no Studio são a fonte durável de verdade. Conversas não devem ser usadas como banco de estado do Construction AI. Em retomadas, conferir o repo e o sistema antes de assumir o estado atual.
