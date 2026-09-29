# S20 · Dry-run de migrations contra o histórico do staging

Data: 2026-09-28. Modo seguro, SOMENTE leitura: nenhuma migration aplicada, nenhuma conexão ao banco.

## Como foi feito

1. Histórico remoto lido com o MCP do Supabase `list_migrations` no projeto de staging `hojbnqkwzsicahzgshne` (a primeira e a segunda chamada falharam por `ECONNRESET`/timeout de rede; a terceira devolveu a lista).
2. Fixture sem segredos (só `version` e `name`): `tests/fixtures/staging-migrations-2026-09-28.json` (27 entradas).
3. Planejamento com o próprio script, offline:
   `node scripts/prod-migrate.mjs --applied-file=tests/fixtures/staging-migrations-2026-09-28.json`

## Resultado

```
Alvo: arquivo tests/fixtures/staging-migrations-2026-09-28.json
Modo: dry-run (nada será alterado)
Locais 27 · já aplicadas 27 · pendentes 0 · drift 0
```

- O staging tem as 27 migrations que existem em `supabase/migrations/` na `main` (`0001` a `0605`, `0700`, `0701`). Nenhuma falta e nenhum nome remoto desconhecido (drift 0).
- O histórico remoto usa versões por timestamp (`20260925003453` ...) e nomes próprios (`base_schema`, `cross_track_fks`, ...); o script casa por NOME, então a diferença de versão não gera pendência nem drift. A ordem remota difere da ordem de arquivo (ex.: `0203` foi aplicada depois da `0202`; `0700` entre `0600` e `0602`): irrelevante para o plano.
- `0606_system_alerts` e `0607_security_advisors` (S19) NÃO existem na `main` ainda (só na branch `slice/S19-seguranca-observabilidade`) e não estão no staging: esperado hoje. Simulação com arquivos vazios de mesmo nome adicionados a uma cópia da pasta: `Locais 29 · já aplicadas 27 · pendentes 2 · drift 0`, listando `0606_system_alerts.sql` e `0607_security_advisors.sql`. Quando a S19 for mesclada, reconferir com um novo `list_migrations`.
- Detecção de drift verificada com histórico falso (`fantasma`): `DRIFT: unknown_remote`, exit 2.
- Guardas verificadas: `DATABASE_URL` com o ref de staging sem `--allow-staging` retorna `RECUSADO` (exit 1); produção sem `--confirm-production=<ref>` igual ao ref é recusada em `--apply` (testes unitários em `tests/scripts/prod-migrate.test.ts`, 13 casos).

## Não coberto

A execução real (`psql --single-transaction`, criação de `supabase_migrations.schema_migrations`, registro) não foi rodada em nenhum banco nesta tarefa (sem banco local livre e sem produção). O primeiro uso real é o dry-run e depois `--apply` na produção (GO-LIVE etapas 6 e 9). Antes disso, o orquestrador deve rodar `--apply` contra um Postgres descartável (por exemplo `pnpm db:start` numa trilha livre, sem as migrations) e conferir `select version, name from supabase_migrations.schema_migrations`.
