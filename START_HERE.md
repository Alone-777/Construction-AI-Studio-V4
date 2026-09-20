# Construction AI Studio — START HERE

Este arquivo é o ponto permanente de retomada do projeto.

## Repositório e branch operacional

- Repositório: `Alone-777/Construction-AI-Studio-V4`
- Branch de trabalho: `feature/v4.2-visual-pipeline`
- Pasta de entrada: `Imagem Inicial/`

## Inicialização fácil

Este projeto é usado no WSL/Ubuntu com Windows. Na primeira vez, na raiz do repositório:

```bash
npm install
npm run instalar-botao
```

O instalador detecta o ambiente. No WSL, cria um atalho **Construction AI Studio** na Área de Trabalho do Windows. Em Ubuntu nativo, cria o launcher Linux.

Depois disso, o uso normal é apenas clicar em **Construction AI Studio**. O botão liga backend + painel e o navegador abre automaticamente quando o painel estiver pronto.

Alternativas de terminal:

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

## Comando de conversa

Em qualquer conversa nova deste projeto, use primeiro:

### `Construction AI: INICIAR`

Esse é o comando mestre. Ao recebê-lo, o ChatGPT deve:
1. ler este `START_HERE.md` na branch operacional;
2. verificar conexão com o GitHub e o estado atual da branch;
3. usar o repositório e o Construction AI como fonte de verdade;
4. identificar pelo contexto se o trabalho é continuação ou projeto novo;
5. só pedir uma escolha entre NOVO ou CONTINUAR se isso realmente não puder ser determinado.

Atalhos opcionais continuam válidos:
- `Construction AI: CONTINUAR`
- `Construction AI: NOVO PROJETO`
- `Construction AI: VERIFICAR`

## Regra de continuidade

O repositório e os arquivos persistidos no Studio são a fonte durável de verdade. Conversas não devem ser usadas como banco de estado do Construction AI. Em retomadas, conferir o repo e o sistema antes de assumir o estado atual.
