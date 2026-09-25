# Task 2 report (S03, trilha Dados)
Status: DONE.
Entregue: features/schools/{normalize,inep-csv,schemas,ports,import-service,repository,supabase-gateway}.ts; tests/schools/{normalize,inep-csv,import-service,repository}.test.ts, memory-repo.ts; tests/fixtures/inep-demo.csv (8 linhas: 3 inseridas, 2 duplicadas, 3 rejeitadas; INEPs 5199xxxx para não colidir com audit_log dos testes de banco); vitest.config.ts exclui repository.test.ts, vitest.db.config.ts inclui e ganha aliases (@, server-only). 4 Rulings em ledger-dados.md.
TDD: testes escritos antes (falharam por módulos ausentes), depois implementação.
Ajustes do aviso do orquestrador: getErrorRows exclui already_up_to_date; errors lista aberta; is_demo do lote em todas as linhas; chunk <= 500.
Verificação: typecheck, lint limpos; test 206/206; test:db 151/151 (2 execuções seguidas). db:reset rodado uma vez para limpar audit_log poluído por INEPs de uma execução anterior.
Preocupações: (1) totals não separa "sem alteração" de "duplicadas" (o SQL atual devolve 4 contadores; a separação depende da migration revisada, e o serviço/UI precisará de um campo novo); (2) lote preso em processing após queda dura não retoma; (3) audit_log é append-only: testes de banco que usam INEPs fixos (ex.: 51000001 em imports.test) quebram se outro teste auditar o mesmo INEP; (4) supabase-gateway.ts (filtro .or com not.cs no PostgREST) só é exercitado no E2E da Task 3.

## Rodada de correção 2
Status: DONE.
Migration 0101: `import_claim_batch` com claim atômico (`owner`, `is_demo`; lote novo nasce `processing`; `pending`/`failed`/`processing` >10 min retomáveis, mesma natureza demo/real); `import_apply_rows` renova o heartbeat, tem coluna `import_rows.unchanged` + check `import_rows_unchanged_is_duplicate` (substitui o predicado JSON em contadores, filtro PostgREST, gateway pg e MemoryRepo), dedupe nome+município isolado por `is_demo` e tetos de tamanho de raw/normalized/errors.
Serviço: só o dono processa; `finishBatch(id, status)` sem regravar contadores; `ImportResult.resumed`; `demo_flag_mismatch`; row_number = linha do arquivo; raw truncado em 1000 por célula; `countSchools` {real, demo}; `countWarningRows`; sem cast no Zod.
CSV: Windows-1252 (não latin1), C1 removido no cleanText, mojibake/byte indefinido -> `encoding_ambiguous`, `max_record_size` 64 KB, `duplicate_column` só para colunas conhecidas, `lines` por registro.
UI: cartões "Escolas reais"/"Escolas de demonstração"; "Linhas com aviso" no detalhe; erro na action para `demo_flag_mismatch`.
Testes: fixture com INEPs 9900100x; xmin tautológico removido; novos testes (stale/heartbeat, dois importInepFile em paralelo no banco real, unchanged, dedupe demo, tetos, check, encoding, linhas, mismatch). 
Verificação: typecheck/lint limpos; test 234/234 (antes do gate final); test:db 175/175; build ok; E2E refeito (docs/superpowers/e2e/S03.md, screenshots novos). Rulings em docs/superpowers/ledger-dados.md.
Preocupações: E2E suja audit_log (rodar db:reset antes de test:db); testes de banco que envelhecem lote usam `session_replication_role = replica` para driblar o trigger de updated_at; S03-02 mostra a lista após a rodada (o cartão de sucesso aparece em S03-03).
