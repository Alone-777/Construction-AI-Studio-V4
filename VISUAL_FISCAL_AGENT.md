# Agente Fiscal Visual

O Agente Fiscal Visual remove a dependência obrigatória de enviar cada MP4 ao ChatGPT. Ele recebe o **contact sheet já criado pelo pipeline**, executa duas inspeções visuais independentes e devolve uma decisão estruturada para os escritores guardados existentes.

## Limites de autoridade

- não edita `.firefly`, `state.json`, a fila ou o mundo `OFFICIAL`;
- não libera um JOB diretamente;
- vincula toda decisão a `jobId`, tentativa e SHA-256 do contact sheet;
- `PASS` exige duas análises concordantes, confiança mínima de 0,85, continuidade integral, progresso dentro da tolerância, causalidade física válida, evidência completa e frame terminal reutilizável;
- divergência, provider indisponível ou evidência incerta retorna `REVIEW_REQUIRED`;
- `RETRY` só é emitido quando as duas análises confirmam falha;
- a aplicação de `PASS` ou `RETRY` continua passando pelos gates do Relay/Bridge.

## Providers

O agente é opt-in e permanece desativado enquanto nenhum provider estiver configurado. A prioridade padrão é:

1. Gemini;
2. Custom HTTPS ou HTTP em localhost explicitamente autorizado;
3. OpenAI.

Fallback pago automático fica desligado por padrão. O roteador mantém cache por conteúdo/contexto/modelo, health score e circuit breaker sem persistir chaves ou dados base64 no arquivo de saúde.

As variáveis aceitas estão documentadas em `.env.example`. Chaves reais nunca devem ser commitadas.

## Contrato de execução

```bash
node tools/visual-fiscal-agent.mjs \
  --contact-sheet /caminho/contact-sheet.png \
  --state-dir /caminho/estado-do-agente \
  --context-json '{"jobId":"...","attempt":1,"contactSheetSha256":"...","job":{...}}'
```

Saída única em JSON:

- `PASS`: pode ser convertido em `record_review_pass` após nova validação da identidade viva;
- `RETRY`: pode ser enviado ao escritor estruturado de retry;
- `REVIEW_REQUIRED`: mantém o JOB bloqueado sem mutação canônica.

## Verificação

```bash
npm run test:fiscal-agent
npm test
npm run build
```
