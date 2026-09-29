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

A execução real foi provada depois em Postgres descartável (seção "Apply em Postgres descartável"). Falta apenas o primeiro uso na produção (GO-LIVE etapas 6 e 9).


## Apply em Postgres descartável

Executado em 2026-09-29 contra um container `public.ecr.aws/supabase/postgres:17.6.1.167` (mesma major da stack local), porta 55999, senha aleatória descartada; container parado e removido ao fim (`--rm`). O host não tem `psql`: um shim de PATH (fora do repositório) repassou as chamadas do script ao `psql` de dentro do container (`-f arquivo` virou stdin). O script não foi alterado.

| Passo | Resultado |
|---|---|
| dry-run | exit 0: locais 27, pendentes 27, drift 0. Nota: são 27 arquivos nesta branch; o total 29 só existe depois do merge do PR #55 (`0606_system_alerts`, `0607_security_advisors`). |
| `--apply` | exit 0 após os pré-requisitos abaixo: 27 aplicadas, cada arquivo numa transação junto com seu registro. |
| segunda execução `--apply` | exit 0: já aplicadas 27, pendentes 0 (idempotente). 88 tabelas em `public`, todas com RLS; `schema_migrations` com 27 linhas. |
| drift simulado (`0303` renomeada em `schema_migrations`) | exit 2: `DRIFT: version_name_mismatch versão 0303 nome remoto "renamed_by_drift_test" x local "leads"`; nada aplicado. Linha restaurada; dry-run seguinte com drift 0. |

Guarda de host local: `127.0.0.1:55999` passou sem `--confirm-production` (a guarda já tratava 127.0.0.1 com porta e já tinha teste); nenhuma mudança no script.

Retomada comprovada: duas execuções falharam no meio por falta de pré-requisito (a imagem crua não tem tabelas do storage nem colunas do GoTrue); o `--apply` seguinte retomou do ponto exato (5 aplicadas, depois 20), sem reaplicar nem deixar meia migration.

### Pré-requisitos do Postgres cru (não são da produção)

A imagem do Supabase traz os schemas `auth`, `storage`, `vault`, `extensions` e os papéis `anon/authenticated/service_role`, mas as tabelas vêm dos serviços (storage-api e GoTrue), que não estavam rodando. Foi preciso, como `supabase_admin`: criar `storage.buckets`, `storage.objects` (RLS ligada) e `storage.foldername(text)` mínimos; e adicionar `auth.users.banned_until` e `auth.users.email_change_token_new`. Um projeto Supabase real já tem tudo isso; por isso o teste com Postgres cru prova o mecanismo do script (ordem, transação, registro, idempotência, drift, retomada) e o SQL das 27 migrations, mas a prova final de compatibilidade com o GoTrue hospedado continua sendo o dry-run/apply no projeto de produção.

Ruling: aceitar o Postgres cru com pré-requisitos mínimos como prova do `--apply` — o teste completo exigiria subir storage-api e GoTrue (equivalente ao `supabase start`, banco de outra trilha) — custo se estiver errada: uma diferença de versão do GoTrue/storage só apareceria no apply real, que é transacional por arquivo e retomável.
