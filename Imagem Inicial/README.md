# Imagem Inicial

Esta pasta existe como entrada local de compatibilidade. No uso normal, o operador não precisa copiar arquivos manualmente para cá.

## Fluxo recomendado

1. Abra o **Construction AI Operator Panel** em `http://127.0.0.1:8793`.
2. Quando o sistema estiver em `NO_PROJECT`, envie uma única imagem JPG/JPEG, PNG ou WebP pelo painel.
3. O Relay valida o arquivo, calcula o SHA-256 e publica o pacote de análise.
4. O ChatGPT analisa a referência e devolve uma revisão visual estruturada.
5. Se a revisão for `CORRECTION_REQUIRED`, o painel mostra o motivo e o prompt de correção. Nenhum workspace/JOB é criado.
6. Se a revisão for `APPROVED`, o Construction AI usa os fatos visuais aprovados para montar o blueprint/mapa, preparar a fonte temporal inicial e então liberar o primeiro JOB elegível.

A imagem permanece `MANUAL_REFERENCE`: orienta design, proporções, materiais, terreno, ambiente e identidade visual, mas nunca substitui o estado temporal `OFFICIAL` nem autoriza componentes futuros.

## Compatibilidade local

A pasta pode continuar sendo usada por ferramentas técnicas e diagnóstico. Ela não é a interface principal do operador e não faz análise automática por provider externo.
