# Imagem Inicial

Esta pasta é a entrada local opcional da imagem-base do projeto.

## Como usar

1. Coloque aqui uma imagem `.jpg`, `.jpeg`, `.png` ou `.webp`.
2. Mantenha preferencialmente apenas uma imagem na pasta.
3. Inicie o servidor do Construction AI Studio com `npm run server`.
4. Ao abrir o Visual Pipeline de um projeto que ainda não possui uma Imagem Inicial persistida, o Studio lê esta pasta automaticamente e salva a imagem no projeto.
5. Depois que o pipeline visual do projeto começa, a Imagem Inicial fica bloqueada para preservar a consistência dos prompts já emitidos.

Se houver mais de uma imagem, o backend escolhe a primeira em ordem alfabética e informa um aviso no painel.

A Imagem Inicial é usada como `MANUAL_REFERENCE` para identidade, design, materiais, terreno e ambiente. O estado temporal OFFICIAL sempre tem prioridade; componentes futuros visíveis na imagem de referência não podem ser antecipados nos JOBs.
