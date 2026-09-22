# Intake visual da Imagem Inicial

## Arquitetura operacional

O fluxo visual operacional é:

`Operator Panel → Imagem Inicial → Relay → ChatGPT multimodal → revisão SHA-256 → Construction AI Core`

Não existe provider visual HTTP externo no runtime operacional.

O Construction AI é a autoridade de projeto, blueprint/mapa, timeline, Physical Execution V2, logística, JOBs e estado `OFFICIAL`. O ChatGPT interpreta a imagem e devolve dados estruturados; não escreve diretamente em `.firefly`.

## Estados da Imagem Inicial

A imagem começa como `PENDING_ANALYSIS` e pode receber:

- `APPROVED`: referência adequada para iniciar;
- `CORRECTION_REQUIRED`: a referência precisa ser corrigida antes de criar workspace/JOB.

A revisão é vinculada ao SHA-256 exato. Trocar a imagem invalida a revisão anterior.

## Revisão estruturada

Uma aprovação precisa conter `schemaVersion=1.0.0` e claims classificados como `FACT`, `HYPOTHESIS` ou `UNKNOWN`, com evidência e confiança.

A análise cobre, entre outros:

- construção e grau aparente de conclusão;
- ambiente, terreno, vegetação e elementos naturais;
- materiais, estrutura, fundação, piso, paredes, cobertura e aberturas;
- relações espaciais, caminhos e drenagem;
- itens que devem ser preservados.

Esses dados alimentam diretamente o compilador visual do blueprint. A descrição textual é apenas contexto complementar.

## Preparação da fonte inicial

Depois da aprovação, o Construction AI prepara o prompt da imagem `START` usando:

- fatos visuais aprovados;
- elementos que precisam ser preservados;
- remoção de componentes futuros incompatíveis com o início temporal;
- câmera/ambiente coerentes;
- somente ferramentas, materiais e logística necessários para o primeiro trabalho elegível.

A referência inicial continua sendo `MANUAL_REFERENCE`. O estado `OFFICIAL` só nasce após a preparação e revisão da fonte temporal inicial.

## Segurança

- JPG/JPEG, PNG ou WebP;
- até 10 MB;
- MIME e assinatura binária validados;
- painel e bridge em loopback;
- revisão vinculada ao hash atual;
- upload não implica aprovação;
- aprovação não avança a timeline;
- nenhum projeto/JOB é criado quando a imagem exige correção.
