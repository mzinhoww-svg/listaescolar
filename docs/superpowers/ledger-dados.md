# Ledger da trilha dados (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`. O orquestrador consolida em ledger.md na S11.


Ruling: S03 T1 — linha com INEP existente e dados idênticos vira `duplicate` com erro `already_up_to_date` (sem UPDATE, `updated_at` intacto) — o enum de ações só tem 4 valores e "updated" seria falso — custo se errada: contador "duplicadas" inclui reimportações sem mudança.
Ruling: S03 T1 — `import_apply_rows` serializa por advisory lock transacional e recalcula contadores do lote a partir de `import_rows` (idempotente por `(batch_id,row_number)`, retorno reflete o gravado) — evita corrida em `unique(inep)` e contadores divergentes num retry — custo se errada: imports concorrentes de lotes diferentes esperam um pelo outro.
Ruling: S03 T1 — a função aceita `raw` e `errors` opcionais por linha (erros de Zod do TypeScript viram `rejected` e são gravados) e revalida INEP/nome/rede/município no banco como defesa — custo se errada: regra duplicada em TS e SQL.
Ruling: S03 T2 — o serviço retoma lote existente com status `failed`/`pending` (o banco pula linhas já gravadas e devolve os totais reais) e devolve sem reprocessar lote `completed`/`processing`; `alreadyExisted` fica true em todos esses casos — evita reprocesso concorrente e permite recuperar falha parcial — custo se errada: lote preso em `processing` após queda dura do processo não é retomado automaticamente.
Ruling: S03 T2 — o CSV é decodificado e parseado inteiro (csv-parse/sync), mas normalização, `raw` e envio ao banco acontecem em fatias de até 500 linhas; `chunkSize` é limitado a 500 — arquivo de 25 MB cabe em memória e o payload por chamada fica pequeno — custo se errada: arquivos muito maiores exigem parse em streaming.
Ruling: S03 T2 — `getErrorRows` devolve só `rejected` e `duplicate` diferente de `already_up_to_date`; `errors` é lista aberta `{code, message}` (Zod sem enum de códigos) — alinhado ao aviso do orquestrador — custo se errada: código de erro novo aparece sem tradução na UI.
Ruling: S03 T2 — o repositório usa a porta `AdminGateway` (supabase-js em produção, `pg` como service_role nos testes de banco) — testa grants e funções reais sem depender da API HTTP local — custo se errada: a fina camada supabase-js (`supabase-gateway.ts`) só é exercitada no E2E da Task 3.
