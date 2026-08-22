# Reconstrução visual — configuração local

## Arquitetura

`React → /api/visual → adapter do servidor → provider externo → schema compartilhado → revisão humana → blueprint → Project Orchestrator`

O frontend nunca recebe API keys. O backend expõe apenas `id`, `name`, `kind`, `configured` e o nome seguro do modelo para cada provider.

## Revisão humana

A resposta normalizada do provider é preservada em `providerOriginal`. Edições, remoções e confirmações são gravadas separadamente em `reviewedInterpretation`, com origem, valor original, valor atual e timestamps. Alterar um claim invalida o blueprint exibido; regenerá-lo usa apenas o Core local e não repete a chamada externa.

Projetos visuais guardam também uma avaliação supervisionada com categoria, provider/modelo, correções, interpretação final, blueprint, operações, resultado do Fiscal, observações e decisão humana. A imagem da avaliação é referenciada somente por metadados; o projeto continua preservando a imagem original em sua área própria.

## Configurar Gemini

1. Copie `.env.example` para `.env`.
2. Preencha somente no arquivo local:

   `GEMINI_API_KEY=sua-chave-real`

3. Ajuste `GEMINI_MODEL` apenas se necessário.
4. Execute `npm run build`.
5. Execute `npm run server`.
6. Abra `http://127.0.0.1:8787`.

O arquivo `.env` está ignorado pelo Git. Nunca use variáveis `VITE_*` para secrets.

O servidor não troca automaticamente um modelo indisponível. Chave inválida, modelo inexistente, quota/limite, timeout, resposta ilegível, schema incompatível e indisponibilidade retornam códigos e mensagens sanitizados.

## Diagnóstico seguro

Defina `VISUAL_DIAGNOSTICS=true` somente durante desenvolvimento. O log inclui provider, modelo, duração, status interno, contagens FACT/HYPOTHESIS/UNKNOWN e falhas de parsing/normalização. Chaves, headers, imagem, base64 e corpo remoto nunca são registrados. O timeout é configurável por `VISUAL_PROVIDER_TIMEOUT_MS`.

## Desenvolvimento

Em um terminal, execute `npm run server`. Em outro, execute `npm run dev`. O Vite encaminha `/api` para o backend local em `127.0.0.1:8787`.

## Providers alternativos

- OpenAI: configure `OPENAI_API_KEY` e opcionalmente `OPENAI_VISUAL_MODEL`.
- Custom: configure um `CUSTOM_VISUAL_ENDPOINT` HTTPS. A resposta deve obedecer ao contrato `construction-ai-studio-visual-v1`.
- Para teste local sem custo, `CUSTOM_VISUAL_ALLOW_HTTP_LOCALHOST=true` libera HTTP exclusivamente para `127.0.0.1`, `localhost` ou `::1`; hosts remotos continuam exigindo HTTPS.

## Limites

- Formatos: JPEG, PNG e WebP.
- Tamanho máximo: 8 MB.
- O backend verifica MIME, tamanho e assinatura binária.
- Claims devem ser classificados como `FACT`, `HYPOTHESIS` ou `UNKNOWN`.
- Respostas inválidas e alegações técnicas exatas são bloqueadas antes do Core.
- Casos supervisionados aprovados podem virar fixtures sanitizadas contendo somente interpretação, revisão e assinatura esperada do blueprint.

Documentação de referência: [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) e [OpenAI image inputs](https://platform.openai.com/docs/guides/images-vision).
