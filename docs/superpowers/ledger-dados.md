# Ledger da trilha dados (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`. O orquestrador consolida em ledger.md na S11.


Ruling: S03 T1 — linha com INEP existente e dados idênticos vira `duplicate` com erro `already_up_to_date` (sem UPDATE, `updated_at` intacto) — o enum de ações só tem 4 valores e "updated" seria falso — custo se errada: contador "duplicadas" inclui reimportações sem mudança.
Ruling: S03 T1 — `import_apply_rows` serializa por advisory lock transacional e recalcula contadores do lote a partir de `import_rows` (idempotente por `(batch_id,row_number)`, retorno reflete o gravado) — evita corrida em `unique(inep)` e contadores divergentes num retry — custo se errada: imports concorrentes de lotes diferentes esperam um pelo outro.
Ruling: S03 T1 — a função aceita `raw` e `errors` opcionais por linha (erros de Zod do TypeScript viram `rejected` e são gravados) e revalida INEP/nome/rede/município no banco como defesa — custo se errada: regra duplicada em TS e SQL.
