# S28 · Consultas lentas (M02)

Gerado por `scripts/s28-consultas.ts` em 2026-09-29, banco local da trilha 2 (`pg_stat_statements` ativo). Carga: 150 chamadas por fluxo (mais 5 de aquecimento), sequenciais, pelo mesmo código do app (PostgREST, RLS). Volume: 50003 escolas no total, 2944 no município habilitado (50 mil sintéticas e 40 municípios sintéticos removidos ao fim) e, para os leads, cópia temporária de 50 mil linhas (2% na papelaria medida, 1000 leads; a cobrança do S21 impede carga em massa na tabela real). Orçamento: p95 <= 100 ms e nenhum Seq Scan em tabela com mais de 10000 linhas sem justificativa.

## Fluxos

| Consulta | Chamadas | Média | p95 | Máximo | Plano | Veredito |
|---|---|---|---|---|---|---|
| Buscar escola | 150 | 16.3 ms | 23.8 ms | 28.3 ms | índice | dentro do orçamento |
| Abrir lista | 150 | 7.8 ms | 9.0 ms | 14.0 ms | índice | dentro do orçamento |
| Criar carrinho | 150 | 3.1 ms | 3.6 ms | 5.4 ms | índice | dentro do orçamento |
| Listar leads da papelaria | 150 | 2.1 ms | 4.7 ms | 6.6 ms | índice | dentro do orçamento |

Notas: **Buscar escola**: `searchSchools` (RPC `search_schools`, trigram) com 50003 escolas (2944 no município); **Abrir lista**: `getPublishedList` (escola, série, lista, versão, itens); **Criar carrinho**: `createCart` (carts + cart_items) como responsável, com RLS; **Listar leads da papelaria**: consulta de `listForStationery` como dono, com RLS (tabela `leads` real, sem volume: ver plano em cópia).

## Veredito e observações

**Nenhuma consulta passou do orçamento** com a distribuição realista (município habilitado com ~3 mil escolas, total nacional de 50 mil). Nenhuma migration `0801` foi necessária.

- Buscar escola usa `schools_municipality_network_idx` para restringir ao município e só então aplica a similaridade (`similarity`/`word_similarity`) às escolas do município; a lista de escolas de uma cidade é o que limita o custo, não o total nacional.
- Observação manual do pior caso, medida na primeira execução deste script em 29/09/2026 com as 50 mil escolas TODAS no município habilitado (não representativo: nenhuma cidade brasileira tem 50 mil escolas): média 187,8 ms e p95 304,0 ms, com a ordenação (`count(*) over ()` + `order by rank`) derramando para disco (`temp read=598 written=442`). Reproduzível com `S28_ALL_IN_ONE=1`. Só passaria a importar com um município de dezenas de milhares de escolas; nesse caso a saída é paginar sem `count(*) over ()` ou aumentar `work_mem`. Registrado como Ruling, sem mudança.
- Criar carrinho e abrir lista ficam abaixo de 10 ms; listar leads da papelaria usa `leads_stationery_status_idx` (bitmap por `stationery_id`, ordenação de 500 linhas em memória).
- Limite da medição: a tabela `leads` real está vazia (a cobrança do S21 impede carga em massa) e o plano vem de uma cópia temporária com os mesmos índices e sem RLS; o custo da política de RLS sobre `leads` não está no plano da cópia, mas está no tempo do fluxo real (2 ms, tabela vazia).

## `pg_stat_statements`: top por tempo total

| Consulta (normalizada) | Chamadas | Média | Máximo | Total |
|---|---|---|---|---|
| `WITH pgrst_source AS (SELECT "pgrst_call".* FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT "p_query", "p_municipality_id", "p_network", ` | 155 | 13.3 ms | 28.1 ms | 2061.7 ms |
| `WITH pgrst_source AS (INSERT INTO "public"."cart_items"("cart_id", "list_item_id", "name", "quantity") SELECT "pgrst_body"."cart_id", "pgrst_body"."li` | 155 | 0.1 ms | 0.4 ms | 22.3 ms |
| `WITH pgrst_source AS (INSERT INTO "public"."carts"("is_demo", "list_id", "list_kind", "owner_id", "strategy") SELECT "pgrst_body"."is_demo", "pgrst_bo` | 155 | 0.0 ms | 0.4 ms | 6.0 ms |
| `WITH pgrst_source AS ( SELECT "public"."list_items"."id", "public"."list_items"."position", "public"."list_items"."original_name", "public"."list_item` | 155 | 0.0 ms | 0.1 ms | 5.7 ms |
| `WITH pgrst_source AS ( SELECT "public"."school_lists"."id", "public"."school_lists"."school_year", "public"."school_lists"."published_at", "public"."s` | 155 | 0.0 ms | 0.0 ms | 2.4 ms |
| `WITH pgrst_source AS ( SELECT "public"."list_versions"."id", "public"."list_versions"."version_number", "public"."list_versions"."status", "public"."l` | 155 | 0.0 ms | 0.0 ms | 2.3 ms |
| `WITH pgrst_source AS ( SELECT "public"."schools"."id" FROM "public"."schools" WHERE "public"."schools"."inep" = $1 LIMIT $2 OFFSET $3 ) SELECT $4::big` | 155 | 0.0 ms | 0.1 ms | 1.6 ms |
| `WITH pgrst_source AS ( SELECT "public"."leads"."id", "public"."leads"."code", "public"."leads"."status", "public"."leads"."list_id", "public"."leads".` | 155 | 0.0 ms | 0.6 ms | 1.6 ms |

## `pg_stat_statements`: top por tempo médio

| Consulta (normalizada) | Chamadas | Média | Máximo | Total |
|---|---|---|---|---|
| `WITH pgrst_source AS (SELECT "pgrst_call".* FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT "p_query", "p_municipality_id", "p_network", ` | 155 | 13.3 ms | 28.1 ms | 2061.7 ms |
| `WITH pgrst_source AS (INSERT INTO "public"."cart_items"("cart_id", "list_item_id", "name", "quantity") SELECT "pgrst_body"."cart_id", "pgrst_body"."li` | 155 | 0.1 ms | 0.4 ms | 22.3 ms |
| `WITH pgrst_source AS (INSERT INTO "public"."carts"("is_demo", "list_id", "list_kind", "owner_id", "strategy") SELECT "pgrst_body"."is_demo", "pgrst_bo` | 155 | 0.0 ms | 0.4 ms | 6.0 ms |
| `WITH pgrst_source AS ( SELECT "public"."list_items"."id", "public"."list_items"."position", "public"."list_items"."original_name", "public"."list_item` | 155 | 0.0 ms | 0.1 ms | 5.7 ms |
| `WITH pgrst_source AS ( SELECT "public"."school_lists"."id", "public"."school_lists"."school_year", "public"."school_lists"."published_at", "public"."s` | 155 | 0.0 ms | 0.0 ms | 2.4 ms |
| `WITH pgrst_source AS ( SELECT "public"."list_versions"."id", "public"."list_versions"."version_number", "public"."list_versions"."status", "public"."l` | 155 | 0.0 ms | 0.0 ms | 2.3 ms |
| `WITH pgrst_source AS ( SELECT "public"."schools"."id" FROM "public"."schools" WHERE "public"."schools"."inep" = $1 LIMIT $2 OFFSET $3 ) SELECT $4::big` | 155 | 0.0 ms | 0.1 ms | 1.6 ms |
| `WITH pgrst_source AS ( SELECT "public"."leads"."id", "public"."leads"."code", "public"."leads"."status", "public"."leads"."list_id", "public"."leads".` | 155 | 0.0 ms | 0.6 ms | 1.6 ms |

## Planos (`EXPLAIN (ANALYZE, BUFFERS)`)

### Buscar escola

Execução: 17.4 ms. `select * from public.search_schools($1, $2::uuid, null, null, 20, 0)`

```
Function Scan on search_schools (actual time=17.393..17.394 rows=20 loops=1)
  Buffers: shared hit=5262
Planning Time: 0.006 ms
Execution Time: 17.402 ms
```

### Buscar escola (consulta interna da função, mesma forma)

Execução: 14.2 ms. `select s.id, s.inep, s.name, s.network, s.neighborhood, s.municipality_id, m.name as municipality_name, s.verification_status, s.is_demo, greatest(extensions.similarity(s.normalized_name, $1), extensions.word_similarity($1, s.normalized_name)) as rank, count(*) over () as total_count from public.schools s join public.municipalities m on m.id = s.municipality_id where (s.normalized_name operator(extensions.%) $1 or $1 operator(extensions.<%) s.normalized_name) and s.municipality_id = $2::uuid order by rank desc, s.name asc, s.id asc limit 20 offset 0`

```
Limit (actual time=14.153..14.154 rows=20 loops=1)
  Buffers: shared hit=2277
  ->  Sort (actual time=14.152..14.153 rows=20 loops=1)
        Sort Key: (GREATEST(similarity(s.normalized_name, 'escola maria'::text), word_similarity('escola maria'::text, s.normalized_name))) DESC, s.name, s.id
        Sort Method: top-N heapsort  Memory: 30kB
        Buffers: shared hit=2277
        ->  WindowAgg (actual time=9.562..13.948 rows=1397 loops=1)
              Buffers: shared hit=2277
              ->  Nested Loop (actual time=0.520..9.365 rows=1397 loops=1)
                    Buffers: shared hit=2277
                    ->  Index Scan using municipalities_pkey on municipalities m (actual time=0.001..0.002 rows=1 loops=1)
                          Index Cond: (id = '4533b920-5b6c-4111-8196-f5f2e07ede9d'::uuid)
                          Buffers: shared hit=2
                    ->  Bitmap Heap Scan on schools s (actual time=0.518..9.263 rows=1397 loops=1)
                          Recheck Cond: (municipality_id = '4533b920-5b6c-4111-8196-f5f2e07ede9d'::uuid)
                          Filter: ((normalized_name % 'escola maria'::text) OR ('escola maria'::text <% normalized_name))
                          Rows Removed by Filter: 1547
                          Heap Blocks: exact=2263
                          Buffers: shared hit=2275
                          ->  Bitmap Index Scan on schools_municipality_network_idx (actual time=0.149..0.149 rows=5885 loops=1)
                                Index Cond: (municipality_id = '4533b920-5b6c-4111-8196-f5f2e07ede9d'::uuid)
                                Buffers: shared hit=12
Planning:
  Buffers: shared hit=15
Planning Time: 0.349 ms
Execution Time: 14.177 ms
```

### Abrir lista (itens da versão)

Execução: 0.0 ms. `select id, position, original_name from public.list_items where version_id = (select current_version_id from public.school_lists where id = $1) order by position`

```
Index Scan using list_items_version_position_key on list_items (actual time=0.007..0.007 rows=8 loops=1)
  Index Cond: (version_id = (InitPlan 1).col1)
  Buffers: shared hit=4
  InitPlan 1
    ->  Index Scan using school_lists_pkey on school_lists (actual time=0.004..0.004 rows=1 loops=1)
          Index Cond: (id = '8c51be58-0f2a-45d5-888e-02b5b44afbda'::uuid)
          Buffers: shared hit=2
Planning Time: 0.031 ms
Execution Time: 0.013 ms
```

### Criar carrinho (insert)

Execução: 0.1 ms. `insert into public.carts (owner_id, list_id, strategy, is_demo, list_kind) values ($1, $2, 'cheapest', false, 'official')`

```
Insert on carts (actual time=0.088..0.088 rows=0 loops=1)
  Buffers: shared hit=40
  ->  Result (actual time=0.021..0.021 rows=1 loops=1)
Planning Time: 0.005 ms
Trigger for constraint carts_owner_id_fkey: time=0.055 calls=1
Execution Time: 0.150 ms
```

### Listar leads da papelaria (cópia com 50 mil linhas)

Execução: 2.6 ms. `select id, code, status, created_at from leads_copy where stationery_id = $1 order by created_at desc limit 501`

```
Limit (actual time=2.530..2.565 rows=501 loops=1)
  Buffers: local hit=8 read=1004 written=989
  ->  Sort (actual time=2.529..2.541 rows=501 loops=1)
        Sort Key: created_at DESC
        Sort Method: quicksort  Memory: 95kB
        Buffers: local hit=8 read=1004 written=989
        ->  Bitmap Heap Scan on leads_copy (actual time=0.148..2.439 rows=1000 loops=1)
              Recheck Cond: (stationery_id = '00000000-0000-4000-8000-0000000014a2'::uuid)
              Heap Blocks: exact=1000
              Buffers: local hit=8 read=1004 written=989
              ->  Bitmap Index Scan on leads_copy_stationery_id_status_created_at_idx (actual time=0.090..0.091 rows=1000 loops=1)
                    Index Cond: (stationery_id = '00000000-0000-4000-8000-0000000014a2'::uuid)
                    Buffers: local hit=3 read=9 written=9
Planning:
  Buffers: shared hit=87, local read=10 written=10
Planning Time: 0.171 ms
Execution Time: 2.590 ms
```
