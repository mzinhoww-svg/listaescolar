# Ledger de decisões (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`

- Ruling: projeto Supabase ListaEscolar é o staging; produção será outro projeto criado pelo humano — decisão explícita do humano em 24/09/2026 (resolve conflito entre ADR 0001 e SPEC/CLAUDE.md) — baixo: basta apontar novas variáveis de ambiente (ADR-003).
- Ruling: regra "Autonomia" gravada no CLAUDE.md, com prioridade sobre "pare e aponte ao humano" — pedido explícito do humano para valer entre sessões — custo: baixo, basta editar o CLAUDE.md.
- Ruling: toda mudança, inclusive CLAUDE.md e docs, segue branch → PR → revisão → merge; nunca push em main — pedido explícito do humano — custo: baixo, basta editar o CLAUDE.md.
- Ruling: worktrees ficam em ../listaescolar-wt/SNN (fora do repo) — evita risco de commitar a árvore (o .gitignore também lista .worktrees por segurança) — custo baixo: mover pastas.
- Ruling: Next 16 reescreve bloco nextjs-agent-rules no CLAUDE.md a cada dev/build/typegen — reverter com git checkout CLAUDE.md antes de commitar e conferir git status — custo: um commit acidental de bloco extra no CLAUDE.md
- Ruling: cada trilha paralela usa project_id e bloco de portas próprios do Supabase local (config.toml) — evita db:reset de uma trilha apagar o banco da outra — custo: ajuste de portas.
- Ruling: CI dispara em push só na main e em PRs para main — evita execução dupla por PR — custo: branch sem PR não roda CI.
- Ruling: `<Logo variant="horizontal">` compõe símbolo (SVG) + wordmark em texto HTML com a Plus Jakarta Sans, em vez de usar logo-horizontal.svg — texto dentro de <img> não carrega a webfont e cai em Arial; a geometria segue o SVG oficial; o layout deixa de ter header global (cada rota tem o seu) — custo: se a marca mudar o SVG, atualizar o componente; os arquivos logo-horizontal*.svg em public/brand seguem com fallback de fonte para OG/e-mail/PDF (gerar PNG nesses casos).
- Ruling: SENTRY_DSN inválido não pode derrubar getServerEnv — tratar na S02 (primeiro chamador de getServerEnv) com .optional().catch(undefined) — custo: baixo.
- Ruling: nota de portas por trilha vai no README do Supabase; cada worktree usa `supabase start` com project_id/portas locais não commitados (git update-index --skip-worktree supabase/config.toml) — custo: baixo.
- Ruling: E2E das fatias roda no preview quando acessível; enquanto o preview estiver protegido, roda contra o build de produção local do mesmo commit e o PR registra a diferença — o agente não emite tokens/bypass da Vercel (bloqueado como alteração de segurança) — custo: o E2E não cobre a infraestrutura da Vercel; risco coberto por deploy verde do preview e pelo E2E final da S20.
- Ruling: migrations nomeadas `NNNN_nome.sql` com prefixo numérico por trilha (0001; Dados 01xx; Pipeline 02xx; Comércio 03xx; Cobrança 04xx; B2B 05xx; pós-trilhas 06xx) — o CLI ordena por prefixo e evita colisão entre trilhas paralelas — custo: baixo, renomear.
- Ruling: `registry_source` = inep_import, admin_manual, school_claim; `user_role` inclui `system` mapeado ao role service_role do JWT — o spec cita os dois sem valores — custo: baixo, enum extensível.
- Ruling: migrations no staging são aplicadas pelo Supabase MCP (histórico remoto usa timestamps, o repositório é a fonte de verdade) — o CLI exigiria a senha do banco, que o agente não tem — custo: histórico remoto com nomes diferentes dos arquivos; reconciliar antes da S20.
- Ruling: testes de RLS usam `pg` direto no Postgres local com `set local role` + claims do JWT — cobre as políticas reais sem subir a API — custo: não cobre PostgREST/GoTrue; E2E cobre.
- Ruling: audit_log nunca guarda dado pessoal — o trigger remove `display_name` (lista de colunas sensíveis passada como argumento do trigger) de before/after; teste garante — o `audit_log` é imutável, então PII não poderia ser apagada (LGPD) — custo: baixo, ampliar a lista por tabela nas próximas fatias.
- Ruling: `ip_hash` = sha256(ip || pepper) com pepper vindo do GUC `app.audit_ip_pepper` (segredo configurado fora da migration); sem pepper, `ip_hash` fica NULL (nunca hash sem sal); usa-se o último valor de `x-forwarded-for` (o adicionado pelo proxy confiável) — sha256 puro de IPv4 é reversível por força bruta e o primeiro valor é forjável — custo: sem pepper configurado no staging o IP não é registrado; definir o segredo antes da S20.
- Ruling: `service_role` recebe apenas select/insert/update/delete em tabelas auditadas (sem TRUNCATE/TRIGGER/REFERENCES) — TRUNCATE não dispara trigger de linha e apagaria dado sem auditoria — custo: migrations usam o dono (postgres), sem impacto.
- Ruling: triggers de auditoria e append-only usam ENABLE ALWAYS; DISABLE TRIGGER pelo dono da tabela é risco residual aceito (o dono é a migration/plataforma) — custo: baixo.
- Ruling: `auth_role()` só devolve `system` se o claim `role` for service_role E o role de banco corrente for service_role — defesa em profundidade contra claim forjado sob `authenticated` — custo: baixo.
- Ruling: itens menores adiados da revisão S01: created_at imutável por trigger, guard de role via current_user/SECURITY DEFINER futuro (comentado na migration), políticas com policies permissivas múltiplas (advisor), triggers de auditoria supõem coluna `id` uuid, sem FORCE RLS (o dono precisa gravar o audit_log via triggers) — custo: baixo/médio, revisar na S19.
- Ruling: Task 2 da S01 (job de banco no CI) feita pelo controlador — 20 linhas de YAML, custo de despacho maior que o risco; coberta pela revisão final — custo: baixo.
- Ruling: S01 aceita `auth_role()` executável por anon como RPC (advisor apontará; só revela o próprio papel) e ramos 'system' das políticas `to authenticated` como código inerte — revogar exigiria revisar todos os testes por anon; custo: baixo, revisar na S19.
- Ruling: para a S02, o primeiro login cria `profiles` (role parent) por trigger SECURITY DEFINER em `auth.users` — a S01 não dá caminho de auto-criação de perfil de propósito — custo: nenhum.
- Ruling: pepper do IP e escolha do cabeçalho (x-forwarded-for último vs x-real-ip) validados no staging antes da S20; preferir Supabase Vault ao GUC — custo: baixo.
- Ruling: migration 0001 aplicada no staging pelo MCP como base_schema em 24/09/2026; advisor: auth_role anon (aceito) e rls_auto_enable (da plataforma, não alterado) — custo: nenhum.
- Ruling: papel do usuário lido sempre de `profiles` (RLS), nunca de user_metadata do JWT — metadata é editável pelo usuário — custo: uma query por request protegido (cache curto se preciso).
- Ruling: proxy do Next 16 (`proxy.ts`, sucessor de `middleware.ts`) e função pura `canAccess` compartilhada com os layouts — dupla checagem sem duplicar regra — custo: baixo.
- Ruling: login com link mágico é o caminho verificável no E2E local (Mailpit); Google OAuth fica codificado e desligado até o humano criar as credenciais no console Google e ativá-las no Supabase — credencial só do humano — custo: nenhum código a refazer.
- Ruling: `/termos` e `/privacidade` respondem 404 da marca até a S27 (links já existem na tela de login) — as páginas jurídicas pertencem à S27 — custo: nenhum.
- Ruling: `auth.external.google.enabled` fica `false` estático no config.toml (o CLI não aceita env() em booleano); ativar Google local exige editar o config e é ação do humano com credenciais — custo: nenhum.
- Ruling: seed.sql só roda em `db reset` local (config.toml [db.seed]); nunca em staging/produção, onde migrations vão via MCP/CLI sem seed — custo: baixo; se um dia rodar remoto, criaria usuários de teste.
- Ruling: `safeNextPath` resolve o caminho com URL e só aceita o resultado se a forma canônica não começar com `//` e não houver segmentos de ponto — a defesa de open redirect precisa valer para a forma canônica, não só para a string crua — custo: rejeita alguns caminhos legítimos exóticos (irrelevante).
- Ruling: origem dos links de login vem de uma origem canônica (env `NEXT_PUBLIC_SITE_URL`; senão `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL` validados; senão, só em dev, a origem da requisição) e os redirects do callback são relativos — cabeçalhos Host/Origin/x-forwarded-host são forjáveis e trocam o host da sessão — custo: mais uma variável de ambiente (`NEXT_PUBLIC_SITE_URL`) nos ambientes sem `VERCEL_URL`.
- Ruling: o proxy e o cliente de servidor aplicam os cabeçalhos anti-cache que o @supabase/ssr entrega em `setAll(items, headers)` — evita servir cookie de sessão de um usuário a outro por CDN — custo: nenhum.
- Ruling: link mágico usa `token_hash` + `verifyOtp` em `/auth/confirm` (funciona entre dispositivos/navegadores in-app), com template de e-mail local em `supabase/templates/`; `/auth/callback` fica só para OAuth (`code` PKCE) — pais abrem o e-mail em outro navegador com frequência — custo: o template do Supabase hospedado é configuração no painel (ação do humano, ver PROGRESS); até lá, no hospedado, o link NÃO funciona (o template padrão usa ConfirmationURL); por isso `/auth/confirm` também aceita `code` como fallback (mesmo navegador) e `type=signup`.
- Ruling: matcher do proxy cobre tudo exceto `_next/` e `brand/`; o gate dos layouts protegidos é obrigatório e testado — extensões como `.json` não podem contornar o proxy — custo: proxy roda em mais requisições (só consulta papel em rotas protegidas).
- Ruling: registro de erros do provedor/exchange (Sentry sem PII) e mensagem específica de rate limit ficam: rate limit na S02 (mensagem), Sentry na S19 — custo: baixo.
- Ruling: re-revisão escopada da rodada 1 da Task 2 da S02 é feita dentro da revisão final da branch (com lista explícita dos achados) — economiza uma rodada de subagente sem perder a checagem — custo: se algo falhar, o loop de correção acontece após a Task 3.
- Ruling: App01-Boas-vindas não vira rota própria na S02; a home `/` continua a da S00 até S04/S27 — o plano só pede rota própria se a tela exigir e ela é a home mobile futura — custo: baixo, criar a rota depois.
- Ruling: App11-AuthCallback = `app/entrar/loading.tsx`; erro do callback/confirm vira aviso em `/entrar?erro=...` (sem tela de referência para o erro) — custo: baixo.
- Ruling: `/entrar` mostra o formulário de link mágico abaixo dos termos, um desvio consciente de App02 (que só tem Google) — o link mágico é o único login verificável enquanto o Google OAuth depende de credenciais do humano — custo: baixo, mover/esconder o formulário quando o Google ativar.
- Ruling: layouts protegidos usam `requireAccess` (features/auth/guard.ts) que redireciona a `/403` (200 na navegação direta); o status 403 real vem do proxy — custo: baixo.
- Ruling: `/auth/confirm` aceita `token_hash` (`type` email|magiclink|signup) e, como fallback, `code` (PKCE, mesmo navegador) — o hospedado usa o template padrão até o humano configurar o painel, e usuário novo recebe o template de confirmação — custo: baixo.
- Ruling: `getCurrentUser`/`getCurrentRole` usam `cache()` do React e `requireAccess` decide `login` sem sessão e `/403` com sessão sem papel — o gate dos layouts precisa coincidir com o proxy e não multiplicar chamadas ao GoTrue — custo: baixo.
- Ruling: migration 0002 aplicada no staging pelo MCP como profile_on_signup (staging sem usuários, sem backfill); seed.sql NÃO foi aplicado — advisor sem alertas novos — custo: nenhum.
- Ruling: ADR-004 — trilhas paralelas sem FK entre si, portas hexagonais e migration de integração `0600_cross_track_fks` na S11 — o PLAN chama as trilhas de independentes, mas S09/S10 publicam em tabelas da S05 e S14 referencia listas; sem isso as trilhas não rodam em paralelo — custo: uma fatia de integração e testes de contrato.
- Ruling: stack local sem studio/analytics/imgproxy/logflare/vector (`db:start` com `-x`) e Colima com 10 GB — três stacks paralelas na máquina de 16 GB — custo: sem Studio local (usar `psql`/staging).
- Ruling: trilhas isoladas por workdir derivado (scripts/supa.mjs e arquivo .track) em vez de skip-worktree no config.toml — skip-worktree esconde edições legítimas e quebra rebase (achado da revisão) — custo: baixo. Migrations/staging serializados pelo orquestrador; FKs de 04xx/05xx nas próprias migrations; E2E parcial até a S11 (ADR-004 itens 7 a 10).
- Ruling: dependências das trilhas instaladas pelo orquestrador antes do disparo: csv-parse (S03), iconv-lite (S03, INEP costuma vir em latin1), unpdf (S07, extrair texto/páginas de PDF); web-push virá na S11 — evita conflito de lockfile entre trilhas — custo: baixo.
- Ruling: cada trilha registra seus Rulings em docs/superpowers/ledger-<trilha>.md (dados, pipeline, comercio) para evitar conflito de merge; o orquestrador consolida tudo no ledger.md na S11 e no relatório final — três branches acrescentando ao mesmo fim de arquivo conflitam a cada rebase — custo: consolidação manual.
- Ruling: o job db do CI sobe gotrue, kong, postgrest e storage-api (só exclui studio, mailpit, realtime, imgproxy, postgres-meta, edge-runtime, logflare, vector, supavisor) — os testes de repositório das trilhas (S03, S07, S12) criam usuários no Auth, usam supabase-js/PostgREST e o Storage (schema storage vem do storage-api) — custo: job de CI ~1 min mais lento.
- Ruling: previews da Vercel PÚBLICOS (Vercel Authentication desativada pelo humano no projeto `listaescolare`, o conectado ao GitHub, em 2026-09-25) e E2E de cada fatia passa a rodar NO PREVIEW depois do primeiro deploy verde — motivo: o preview protegido impedia o agent-browser e a infraestrutura da Vercel nunca era exercitada; previews públicos são indexáveis, então TODO ambiente fora da produção da Vercel responde `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` (lib/robots-header.ts, next.config.ts `headers()`, teste em tests/security/preview-noindex.test.ts) e `app/robots.ts` já bloqueia fora da produção — custo se estiver errada: preview público com dado do staging (demo) exposto: por isso a proteção DEVE ser reativada antes de qualquer dado real (checklist da S20, D-074); o E2E local (build de produção contra Supabase local) continua como fallback quando o preview estiver quebrado, e o E2E no preview só roda depois de aplicar no staging a migration da fatia (o preview usa o staging)
- Verificação (2026-09-25 17:58 UTC, API da Vercel): projeto `listaescolare` sem nenhuma variável de ambiente; `listaescolar` (sem `e`) com 4 variáveis só em Production; `ssoProtection`/`passwordProtection` desativadas no `listaescolare`; os previews continuam falhando no build (`NEXT_PUBLIC_SUPABASE_*`); o E2E no preview só começa depois do primeiro deploy verde — enquanto isso vale o E2E local
- Ruling: o deploy "de produção" da Vercel (push na `main`) hoje aponta para o STAGING (o projeto Supabase de produção não existe) e o projeto `listaescolare` tem previews públicos; por isso robots.txt, sitemap e a remoção do `X-Robots-Tag: noindex` exigem `VERCEL_ENV=production` E `SITE_INDEXING=1` (variável ligada só pelo humano no go-live) — custo se estiver errada: um go-live que esqueça `SITE_INDEXING=1` fica noindex (barato de corrigir e visível no checklist da S20)
- Ruling: staging (2026-09-25, orquestrador via MCP `execute_sql`, fora de migration versionada): `pg_cron` e `pg_net` habilitados; segredos `ocr_worker_url`, `ocr_worker_secret` e `audit_ip_pepper` criados no Vault com valores gerados no banco (nunca exibidos); job `ocr-worker-tick` criado INATIVO; `alter database … set app.audit_ip_pepper` NEGADO pelo hospedado (permission denied) — decisão: o pepper fica no Vault e a S11 (0601) fará `audit_row_change` ler o pepper de lá; um erro do banco ecoou o valor de um pepper gerado numa tentativa que foi revertida (nunca gravado): descartado; regra: nunca usar `format(%L)` com segredo em SQL que pode falhar
- Ruling: a CLI local do Supabase está logada na conta pessoal do humano e recebe 403 no projeto ListaEscolar (pertence à organização da integração Vercel); o MCP não define secrets de Edge Function; o deploy da `ocr-worker` e os secrets da função dependem de o humano dar acesso de CLI (`supabase login` com a conta que abre o projeto ou um access token) ou de definir os secrets no painel; o WORKER_SHARED_SECRET do staging é o gerado no Vault (não o de `.env.local`, que é de desenvolvimento) — custo: a função só entra em operação depois dessa ação humana
- Ruling: staging (2026-09-25): a `ocr-worker` foi implantada pelo MCP (`deploy_edge_function`, v1, `verify_jwt=false`, os 31 arquivos de `supabase/functions`, `deno.json` como import map) porque a CLI recebe 403; o tick de teste (`net.http_post` do banco, segredo lido do Vault sem exibir) devolveu 401 — o `WORKER_SHARED_SECRET` da função não confere com o `ocr_worker_secret` do Vault; o job de cron fica INATIVO até o humano reconferir os dois valores (D-060); a ordem "gravar o mesmo valor nos dois lados" foi cumprida pelo humano, o orquestrador não lê nem copia credenciais — custo se estiver errada: worker sem rodar no staging até a conferência (nenhum envio real depende dele antes disso)
- Ruling: bloqueios do classificador (merge, segredo) não param a execução: vão para "Aguardando humano" no PROGRESS.md, o PR fica pronto e o orquestrador segue para a próxima tarefa; regra gravada no CLAUDE.md (Autonomia) por pedido do humano em 2026-09-25 — custo se estiver errada: um item pode esperar o humano por mais tempo, sem bloquear as outras fatias
- Ruling: `ocr-worker` no staging em operação (2026-09-25): tick 200 e job de cron ativo depois de o humano redefinir o `WORKER_SHARED_SECRET` em todos os lados; supersede o Ruling anterior sobre o 401 — custo se estiver errada: o job passa a gerar 401 por minuto se o segredo divergir de novo (desativar com `cron.alter_job(1, active := false)`)
- Ruling: "pesquisa com mães" (ADR-005) autorizada pelo fundador em 25/09/2026, por escrito nesta sessão, como fatia fora do `docs/PLAN.md`: migration aditiva no ListaEscolar (staging; produção não existe), variáveis novas na Vercel, e merge na `main` sem revisão pessoal do fundador desde que CI verde, revisão de spec e qualidade por subagente registrada no PR, os 7 cenários E2E verdes no preview e nada fora do escopo do ADR-005 — a autorização não altera o CLAUDE.md nem vale para nenhuma outra fatia; registrada aqui e no PR para auditoria — custo se estiver errada: reverter é um `git revert` do PR (migration só aditiva, sem FK de outras tabelas nela).
- Ruling: ADR-004 já existe (trilhas paralelas); este registro de escopo usa ADR-005 — custo: nenhum, numeração apenas.
- Ruling: variável do Supabase na pesquisa usa `SUPABASE_SECRET_KEY` (já cadastrada na Vercel), não `SUPABASE_SERVICE_ROLE_KEY` como a spec cita na seção 9 — CLAUDE.md proíbe nomes legados; a spec erra o nome mas não a intenção (chave de servidor com privilégio total) — custo: nenhum.
- Ruling: migration da pesquisa usa prefixo `0700_` (`supabase/migrations/0700_pesquisa_maes.sql`), fora da faixa 01xx–06xx já alocada às trilhas do PLAN — a fatia não tem FK com o restante do schema — custo: nenhum.
- Ruling: na rota `/api/pesquisa/resposta`, se `IP_HASH_SALT` não estiver configurado, o IP é tratado como desconhecido (sem rate limit, `ip_hash = null`) em vez de derrubar a rota — a pesquisa precisa funcionar mesmo com env incompleta; em produção o salt está cadastrado na Vercel, então o caso só ocorre em ambiente mal configurado — custo se estiver errada: rate limit desligado silenciosamente num ambiente sem o salt (visível no banco pelos ip_hash nulos).
- Ruling: cenário 2 (abandono) da spec pede "confirmar no banco que last_step = 7" ao parar na tela 7; o desenho implementado grava `last_step` como o último step **respondido e salvo** (nunca um step ainda não visto), então parar *na* tela 7 sem respondê-la deixa `last_step = 6` no banco — forçar 7 exigiria gravar uma resposta vazia para uma pergunta obrigatória ainda não respondida, o que é pior. A retomada exata (mostrar de novo a tela 7 ao recarregar, via `localStorage`) foi confirmada e é o que importa para quem abandona e volta — tratado como imprecisão de redação da spec, não como bug — custo: nenhum, comportamento documentado em `docs/superpowers/e2e/pesquisa-maes.md`.
- Ruling: durante o E2E desta sessão, uma navegação de diagnóstico para `/pesquisa` sem `?g=` (antes de eu confirmar o certificado do proxy) criou uma sessão local sem `source_group`; a navegação seguinte com `?g=e2e-teste` não sobrescreveu (comportamento correto: "g só é capturado na primeira visita"). Corrigido com um `update` pontual (não um `delete`) daquela única linha para `source_group = 'e2e-teste'`, por session_id exato, antes de qualquer outra escrita de teste — nunca um `delete` fora do filtro autorizado — custo: nenhum, é a própria sessão criada minutos antes por mim.
- Ruling: revisão independente por subagente (antes do merge, pedida pelo ADR-005) achou 2 problemas reais, corrigidos nesta sessão: (1) `app/api/pesquisa/_lib/csv.ts` não neutralizava campo de texto livre (`compra_ideal`, `escola`, e também `whatsapp_e164`/nome por começarem com `+`) que começasse com `=`, `+`, `-` ou `@` — injeção de fórmula se o humano abrir o CSV no Excel/Sheets; corrigido prefixando `'` nesses casos, com teste; (2) `/api/pesquisa/resposta` desligava o rate limit (fail-open) se `getServerEnv()` lançasse por QUALQUER variável de servidor ausente (ex. `OPENROUTER_KEY`, sem relação com a pesquisa), não só `IP_HASH_SALT`; corrigido lendo `process.env.IP_HASH_SALT` direto — custo se estiver errado: nenhum, são só correções, cobertas por teste novo. Também adicionados testes que faltavam para `retry.ts` (backoff 1/3/9s) e para o texto exato da mensagem do WhatsApp (`TelaFinalSucesso`), apontados pela mesma revisão.
- Ruling: o fundador pediu polimento visual com `/impeccable`, que não está instalado nesta sessão — usado o guia `design-intelligence` + spec §6 + `docs/brand/tokens.json`; resultado: wordmark oficial (`<Logo variant="horizontal">`) no topo de toda tela (a spec §6 exige e faltava), cards de opção de 56px, barra de ações fixa no rodapé com safe-area, transição entre telas com `prefers-reduced-motion`, esqueleto no primeiro paint; nenhum texto da spec mudou — custo se estiver errado: só CSS/estrutura em `components/pesquisa` e `app/pesquisa`, reversível por commit.
- Ruling: o WhatsApp do fundador (número redigido neste registro em 2026-09-26; ver Ruling posterior sobre o repositório público) entra só no kit de divulgação (mensagem para os grupos e link `wa.me` de contato), não em nenhuma página pública do app — publicar telefone pessoal numa página é exposição difícil de reverter e a spec §7 define e-mail como canal — custo se estiver errado: adicionar o número à página de privacidade é uma linha.
- Ruling: sem Docker nesta sessão cloud (`docker ps` falha por falta do daemon), `pnpm db:start`/`db:reset`/`test:db` não rodam contra Postgres local. Os testes de integração da spec (seção 10) rodam por verificação direta contra o ListaEscolar (staging) com a service key, limpando por `source_group = 'e2e-teste'`; os arquivos Vitest de integração ficam no repo para rodar via `test:db` quando houver Docker — custo: falta confirmar localmente numa sessão com Docker.
- Ruling: `/impeccable` instalado nesta sessão a partir do repositório `pbakaus/impeccable` (o instalador `npx impeccable install` falhou com 404 no bundle; copiado `plugin/skills/impeccable` para `~/.claude/skills/`, fora do repositório) e usado como `polish` + `adapt` sobre `app/pesquisa`; o passo de entrevista do skill foi substituído pela instrução permanente do fundador de não perguntar — motivo: pedido explícito do fundador; custo se estiver errada: nenhum no código (o skill não deixa arquivo no repositório; `PRODUCT.md`/`DESIGN.md` não foram criados).
- Ruling: barra de ações fica no fluxo, logo após o conteúdo, quando há mouse e tela larga (`sm` + `pointer-fine`), e continua fixa no rodapé no toque ou em tela estreita — motivo: no desktop de 800 px de altura o botão ficava 350 px abaixo do texto que a pessoa acabou de ler (achado do passe `adapt`); detectar o tipo de ponteiro em vez de só a largura evita tratar tablet como desktop; custo se estiver errada: um `sm:pointer-fine:` a remover.
- Ruling: o número de WhatsApp do fundador sai do kit commitado (`docs/superpowers/pesquisa-divulgacao.md` usa `<SEU-NUMERO>`) e a mensagem pronta, com o número, vai só no relatório da sessão — motivo: achado R4 da revisão independente (o repositório é público, então "não publicar telefone pessoal" tem que valer para o repositório também); o histórico da branch já contém o número (force push proibido), o que fica registrado aqui para o fundador decidir se quer ir além; custo se estiver errada: colar o número na mensagem à mão.
- Ruling: `/api/pesquisa/lead` com falha definitiva não mostra a tela de sucesso: mantém o formulário com o aviso "Não conseguimos salvar seu WhatsApp agora. Confira o número e tente de novo." (texto novo, a spec não previa esse estado), e `enviarComRetry` trata 4xx como falha definitiva (sem repetir 3 vezes por 13 s); o botão também passa a exigir DDD válido (`normalizeWhatsappBR`) — motivo: sucesso sem lead gravado é estado enganoso (a mãe acharia que vai receber a lista), apontado de passagem pela revisão; custo se estiver errada: uma frase a mais fora da spec.
- Ruling: revisão independente do polimento (veredito APROVADO): aplicados R1 (avanço único por montagem, cancelado no unmount; último toque vence), R2 (foco no título a cada tela, `TituloTela`), R3 (alvos secundários 48 px), R5 (testes de `Progresso`, `Tela` e da guarda), N1 (`aria-hidden` no contador visual), N2 (círculo vazio do rádio em `texto-3/50`), N3 (progresso sem transição com movimento reduzido), N6 (prop morta removida); não aplicados N4 (safe-area lateral; alvo é retrato) e N5 (roving tabindex; Enter/Espaço já funcionam, pré-existente) — custo se estiver errada: dois nits abertos para uma rodada futura.
- Ruling: a barra de ações volta ao fluxo a partir de `sm` (640px) por largura apenas, sem `pointer-fine` (supersede o Ruling anterior) — motivo: o Chromium headless deste container não tem dispositivo apontador (`pointer: none`), então a variante por ponteiro não é verificável nas capturas; em tablet o layout no fluxo também funciona (coluna de 480px centralizada, tudo visível); custo se estiver errada: um `sm:` a trocar.
- Ruling: terceira revisão independente (rodada `/impeccable` + achados, `44dc223..7ed1365`, veredito APROVADO): aplicados R-A (`key` por fase nas duas `<Tela>` da tela 11, para a sub-pergunta "E onde preferiria comprar?" remontar e receber o foco), R-B (seleção de texto em Verde Fundo a 20% em vez de Verde Certo — spec §6 reserva Verde Certo para fundo escuro), N-A (mocks de falha com `status: 500`) e N-D (teste do `aria-hidden` no contador); não aplicados N-B (`role="status"` mantido por coerência com o aviso de `Pesquisa.tsx`) e N-C (texto do aviso de falha de resposta mantido; a fila de retry já é a da spec §5.3) — custo se estiver errada: dois nits de texto/role para uma rodada futura.

- Ruling: S11 mesclada (PR #29, `05160d5`) com o gate local + CI `verify`/`db` verdes; o CI só disparou depois de resolver o conflito com `main` em `ledger-comercio.md` (o GitHub não roda `pull_request` quando não consegue montar o merge ref) — regra operacional: antes de abrir PR de fatia, mesclar `origin/main` na branch — custo se estiver errada: nenhum (só evita esperar CI que nunca vem)
- Ruling: o PR #28 "Pesquisa com mães (ADR-005)", fora do PLAN e mesclado pelo humano por outra sessão (migrations 0700/0701 já no staging), não entra no escopo das fatias; o orquestrador só o reconcilia no PROGRESS e o inclui na revisão de segurança da S19 (RLS sem policy em `survey_*`) — custo se estiver errada: nada do PLAN depende dele
- Ruling: D-048 (consolidar os ledgers de trilha) passa da S11 para a S18, porque a S11 já mesclou 154 arquivos e a consolidação é só de docs — custo se estiver errada: os Rulings continuam espalhados em 4 arquivos por mais algumas fatias
- Ruling: PR #28 mesclado (squash `16d76c8`) pelo orquestrador com base na autorização escrita do fundador (ADR-005) — condições verificadas antes do merge: CI `verify`+`db` verdes em `f4fd3e5`, três revisões independentes APROVADO (implementação `f62d1eb`; polimento `44dc223`; rodada `/impeccable` `7ed1365`, com R-A/R-B aplicados em `f4fd3e5`), 7 cenários E2E verdes no preview e diff restrito ao escopo do ADR — custo se estiver errada: reverter um squash em `main` (sem force push; `git revert`).
- Ruling: os resultados dos cenários em produção e a limpeza dos dados `e2e-teste` entram num PR só de docs (branch reiniciada de `main`), mesclado com CI verde e revisão registrada, como a feature — motivo: CLAUDE.md exige branch + PR para toda mudança, inclusive docs, e o relatório de produção só existe depois do merge — custo se estiver errada: um PR de docs a mais.
- Ruling: o Ruling vindo do PR #30 que descreve o PR #28 como "mesclado pelo humano por outra sessão" foi inferência da sessão da S11; a execução foi desta sessão, pelo orquestrador, sob a autorização escrita do fundador (ADR-005), como registra o Ruling anterior sobre `16d76c8` — os dois registros ficam, com esta nota, para não reescrever o log; o número de WhatsApp que constava em texto claro num Ruling anterior foi redigido, pela mesma razão do kit (repositório público) — custo se estiver errada: nenhum.
- Ruling: após a 0401 no staging, NÃO publicar plano de cobrança provisório — os valores de `plans` são preço de produto (regra "nunca inventar preço"); o staging recusa lead para papelaria real (`billing_unavailable`) até o humano informar os valores (PROGRESS > Aguardando humano, D-102) — custo se estiver errada: o E2E de lead real no staging fica bloqueado até lá; demo continua funcionando
- Ruling: a S15 (área da família) começa no worktree T3 logo após o merge da S23, antes de a trilha B2B (S25/S26) terminar — a S15 não depende de S25/S26 e o worktree ficaria parado; S16 segue depois da S15 — custo se estiver errada: conflitos em ledgers/PROGRESS/DEBT com a trilha B2B, resolvidos por união no merge
- Ruling: o PR #42 (S25) foi mesclado com os jobs `verify`/`db` ainda pendentes — o laço de espera saiu antes de os jobs aparecerem; conferido em seguida que o run do PR (`8532ed8`) e o da `main` (`634c9f2`) terminaram em `success`; regra operacional daqui em diante: só mesclar depois de o run do `head_sha` do PR estar `completed/success` — custo se estiver errada: nenhum neste caso; um CI vermelho pós-merge exigiria PR de correção
- Ruling: na aplicação da 0502 no staging o subagente removeu comentários de DENTRO de 7 corpos de função; a comparação por md5 com o banco local detectou e as funções foram reaplicadas idênticas ao arquivo — a comparação por md5(prosrc) continua obrigatória em toda aplicação — custo se estiver errada: nenhum (o comportamento não mudava; só a fidelidade textual)
## S15 · Área da família (fora de trilha, worktree T3, 2026-09-27)

- Ruling: migration na faixa "pós-trilhas" `06xx` (próximo prefixo livre após `0602`, S11): `0603_family_area.sql`
  (tabelas `students`, `saved_lists`) — a S15 não é de trilha (PLAN: "S11 e S15 a S20 rodam depois do merge das
  três") e o Ruling de `0001` já reserva `06xx` para isso; FKs reais para `schools`/`grades`/`profiles`/
  `school_lists` são permitidas aqui (pós-integração) — custo se estiver errada: renomear o arquivo antes de
  aplicar em staging (nunca aplicado nesta sessão).
- Ruling: `students`/`saved_lists` como CRUD direto por RLS (grants por tabela + `with check`, cliente de SESSÃO),
  não por função RPC — mesmo padrão de `carts`/`cart_items` (S12). A única regra cross-tabela ("lista salva precisa
  ser `published`", "aluno da linha pertence ao mesmo dono") cabe num gatilho `BEFORE INSERT`
  (`SECURITY DEFINER`, `search_path=''`, `EXECUTE` revogado de todos) — mais simples que uma função pública. Custo
  se estiver errada: trocar por função é mecânico, sem migração de dado.
- Ruling: nenhuma política de leitura para admin/system em `students`/`saved_lists` (diferente de `carts`, que tem
  `carts_select_admin`) — mínimo de dado de menor (CLAUDE.md); nem o painel do admin (S16) nem o suporte enxergam
  aluno por família nesta fatia. Custo se estiver errada: uma migration aditiva com a policy que faltar, quando
  uma fatia futura de suporte precisar.
- Ruling: apelido validado nas DUAS camadas (Zod no Server Action, na mesma ordem do `CHECK` do banco via
  `student_nickname_valid`) — sem espaço (sinal prático de "nome e sobrenome"), sem dígito, sem controle, 2-30
  caracteres. Escola e série são obrigatórias no cadastro (App13 já mostra os dois preenchidos): sem os dois a
  família não consegue comparar a lista.
- Ruling: exclusão de aluno é DELETE real (LGPD), com cascade em `saved_lists`; carrinho não referencia `students`
  (nenhuma tela pede essa amarração nesta fatia).
- Ruling: "cotações com status" do prompt da S15 já está pronto desde a S14/S22 (`/cotacao`, `listMyLeads`,
  `StatusBadge`) — o hub só linka para lá, sem duplicar.
- Ruling: D-082 e D-029 (dono S15, marcados "se couberem" no briefing) NÃO foram resolvidos nesta fatia: adicionar
  o sino de notificações a `PanelShell`/`AdminShell`/`SchoolShell` (D-082) mexeria em toda página que usa essas
  três cascas (dezenas de arquivos) para uma dívida de severidade baixa; D-029 é de outra área (`listCandidateStationeries`,
  papelarias candidatas do lead), sem relação com a área da família. Custo/benefício desfavorável perto do fim da
  sessão (risco de regressão ampla por pouco ganho); dono passa para S18 (D-082 já listava S18 como dono
  alternativo). Ficam abertas, sem mudança de severidade.
- Achado do E2E (correção de produto real, não só do roteiro): React 19 reinicializa campos NÃO controlados de um
  `<form action={...}>` depois de QUALQUER conclusão da action, inclusive quando ela devolve erro — o formulário de
  aluno usava `defaultValue` para apelido/série/ano/consentimento; depois de uma primeira tentativa recusada
  (apelido com espaço), esses campos voltavam ao estado inicial e a segunda tentativa falhava em silêncio (bloqueio
  nativo de campo `required` vazio, sem mensagem). Corrigido tornando esses campos controlados em `StudentForm`/
  `GradeSelect`/`SchoolYearSelect`. Sem essa correção, qualquer família que errasse o apelido uma vez teria a
  segunda tentativa quebrada silenciosamente — bug real, não só de teste.
- Achado do E2E: `/carrinho/novo?lista=` espera o id da VERSÃO publicada (`list_versions.id`, conferido por
  `list_reader_get`, 0601/S11), não o id de `school_lists`; a página pública de uma lista oficial
  (`/escolas/[inep]/[serie]`) não tem, hoje, nenhum link para "montar carrinho" (só a cópia do pai, via
  `ParentCopyEditor`, linka para lá) — dívida nova registrada no DEBT.md, dona de uma fatia futura de UX de
  carrinho (fora do escopo da S15, que só consome carrinhos existentes no hub).
- Achado de roteiro (`docs/superpowers/e2e/S15.md`): `clicktext` por `.click()` via `eval` falhou silenciosamente
  para o botão "Salvar aluno"; substituído por `agent-browser find text "..." click` (clique real do Playwright) —
  candidato a atualizar o padrão `PAT-002` do Segundo Cérebro.

## S15 · correções da revisão de segurança (rodada única sobre 5951fb1, worktree T3)

- Ruling: migration `0603_family_area.sql` editada NO LUGAR (não aplicada em nenhum ambiente além do local desta
  sessão) — as 5 correções pedidas: (1) `students` perde `school_id`/`school_year` (SPEC §5: só apelido e série;
  escola/ano vivem na lista salva, via `school_lists`); (2) `student_nickname_valid` fica só-letras Unicode (um
  apóstrofo interno no máximo), rejeitando hífen, ponto, sublinhado, arroba, dígito e invisível/formatação (Zod
  espelha a mesma regra, com NFC e apóstrofo curvo→reto antes de gravar); (3) `students_check_limit`/
  `saved_lists_check_limit`/`saved_lists_guard` passam de `SECURITY DEFINER` para `SECURITY INVOKER` — a RLS já
  escopa as consultas internas ao dono de quem chama, fechando o oráculo de antes (um `owner_id` forjado no INSERT
  não revela mais, pela mensagem de erro, se um aluno/dono alheio existe ou se o teto de outra família já foi
  atingido); (4) `grant update` em `students` só nas colunas editáveis (`nickname`, `grade_id`); (5) os dois tetos
  (10 alunos, 50 listas salvas) tomam `pg_advisory_xact_lock(hashtextextended('namespace:'||owner_id, 0))` antes de
  contar, fechando a corrida de duas inserções concorrentes passando do teto (mesmo padrão de
  `claim_create`/`lead_create`/`stationery_register`). Custo se alguma estiver errada: a migration ainda não foi
  aplicada em lugar nenhum além do local, então corrigir de novo é só editar o arquivo outra vez.
- Ruling: "torná-los SECURITY INVOKER onde bastar" (opção dada pela revisão) escolhida em vez de checar
  `owner_id = auth.uid()` no início de cada gatilho — motivo: a contagem/existência já roda sob a RLS de quem
  chama, então o resultado (0 linhas para um `owner_id` alheio, real ou forjado) é sempre o mesmo,
  independentemente de o alvo existir de verdade; um `if ... raise 42501` explícito seria redundante com o que a
  RLS já garante, e ficaria mais uma checagem para manter sincronizada se a política mudar — custo se estiver
  errada: reintroduzir o `if` explícito é aditivo, não quebra nada.
- Ruling: apelido aceita um apóstrofo interno no máximo (`D'Alva`) — "se quiser" da revisão; decidido incluir por
  realismo de nome brasileiro/lusófono, mesmo raro; sem isso a regra ficaria estritamente `^[[:alpha:]]+$` — custo
  se estiver errada: remover o segundo ramo do `CHECK` e do regex do Zod, sem migração de dado (nenhum aluno com
  apóstrofo existe em produção, que nem existe ainda).
- Ruling: teste de corrida real (`pg_advisory_xact_lock`) usa conexões `pg.Client` separadas com
  `Promise.all` (padrão PAT-003) contra o teto de `students`; não repetido para `saved_lists` por seguir exatamente
  a mesma implementação (mesma função, mesmo padrão de lock) — custo se estiver errada: replicar o teste é
  mecânico, a implementação já está testada indiretamente pela simetria de código.
- Achado de produto (React 19, real, corrigido em `StudentForm.tsx`/`GradeSelect.tsx`): depois de QUALQUER
  conclusão de uma `<form action={...}>` (sucesso ou erro), o `form.reset()` nativo que o React 19 dispara reseta
  `<select>` controlado de volta à primeira opção, mesmo com `value`/`onChange` corretos — o `<input type=text>`
  escapa disso porque tem um rastreador de valor (`_valueTracker`) próprio que o protege de mutação externa do
  DOM; `<select>` não tem o mesmo rastreador, então o reset nativo "ganha" da última renderização do React sem
  disparar novo render. Corrigido com `ref` + `useEffect` que reaplica `select.value` a cada conclusão da action
  (efeitos rodam depois do commit e depois do reset síncrono do navegador, então sempre "ganham" a corrida
  seguinte). O mesmo `ref`+`useEffect` foi aplicado também ao checkbox de consentimento por defesa, mas o
  checkbox não chegou a ser reproduzido como bug real do produto (ver achado de roteiro abaixo) — manter o
  reforço ali é seguro e não custa nada.
- Achados de roteiro (E2E, não são bugs de produto): (1) a técnica usada para simular a marcação do checkbox de
  consentimento — setar `.checked` pelo setter nativo do protótipo e disparar um `change` sintético (o mesmo
  truque que funciona para `<input type=text>`/`<select>`) — nunca chegou a marcar o estado do React: o
  `ChangeEventPlugin` do React para `input[type=checkbox]` escuta o evento `click`, não `change`; isso fez
  parecer, por várias rodadas de diagnóstico manual, que havia um segundo bug de reset (idêntico ao do
  `<select>`) no checkbox — não havia; o checkbox nunca chegou a ficar `true` de verdade nesses testes. Corrigido
  trocando a simulação por `checkbox.click()` (alterna o estado de verdade e dispara o `onChange` real) em
  `set_new_student_fields` do `scripts/e2e-s15.sh`. (2) Com isso corrigido, a falha ficou isolada nas duas
  primeiras submissões do App13: o roteiro usava `wait_text "sem sobrenome"`/`wait_text "letras"` para esperar a
  mensagem de erro, mas o AVISO ESTÁTICO abaixo do campo ("Só letras, sem sobrenome nem documento.") já contém os
  dois trechos — o `wait_text` casava na página em repouso, ANTES de a action resolver, e o `expect_text` seguinte
  rodava cedo demais, vendo o formulário limpo sem nenhum erro ainda. Corrigido esperando a mensagem de erro
  COMPLETA e única ("Use só um apelido, sem sobrenome"/"Use só letras, sem número"), nunca um trecho que também
  exista em texto estático da tela. Lição para o PAT-002 do Segundo Cérebro: (a) simular clique/marcação de
  checkbox via `eval` precisa de `.click()`, não `set value + dispatch('change')`; (b) `wait_text` deve sempre
  esperar por um texto que só exista no estado-alvo, nunca um substring presente também no estado de repouso da
  tela.

## S15 · segunda reverificação de segurança (Opus, sobre `abf5f4e`)

- Ruling: `student_nickname_valid` (0603) e `LETTERS_ONLY` (Zod) trocam a base de "letra Unicode" (`[[:alpha:]]`
  no banco, `\p{L}` no Zod) por "letra do SCRIPT LATINO" (faixas A-Z/a-z, Latin-1 Supplement e Latin Extended-A
  acentuadas no banco; `\p{Script=Latin}` no Zod) — achado da reverificação: "letra" Unicode (categoria `L`) inclui
  coisa que não é letra de verdade, como os preenchedores de Hangul (U+115F, U+1160, U+3164, U+FFA0 — categoria
  `Lo`, invisíveis) e a U+02BC apóstrofo-letra (categoria `Lm`); `"Maria"+U+3164+"Silva"` passava as duas
  validações e aparecia como "Maria Silva" (sem espaço de verdade, então também escapava do teste de sobrenome).
  Restringir ao script latino fecha as duas faixas de Hangul, a U+02BC e qualquer outro script (cirílico etc.) de
  uma vez, sem precisar listar caractere invisível um por um — mais robusto que ir caçando exceção por exceção.
  Verificado direto contra o Postgres local (`en_US.UTF-8`) antes de decidir pela faixa literal de caracteres (não
  há operador de script/propriedade Unicode no regex ARE do Postgres): as faixas casam por valor de código, não
  por ordenação de locale, então funcionam independente do collation do banco. Custo se estiver errada: a
  migration ainda não foi aplicada em lugar nenhum além do local, então ajustar a faixa é só editar o arquivo de
  novo.
- Achado (vermelho confirmado antes da correção, não só teórico): rodado contra o código antigo, tanto o teste do
  Zod (`tests/students/schemas.test.ts`) quanto o de banco (`tests/db/family-area.test.ts`) falharam para
  `"MariaㅤSilva"` (e os demais códigos U+FFA0/U+115F/U+1160/U+02BC/cirílico) — `\p{L}`/`[[:alpha:]]`
  aceitavam, confirmando o achado da revisão antes de qualquer correção no arquivo.
- Ruling: a S28 (ADR-006) entra no PLAN entre a S19 e a S20 e passa a ser pré-requisito do go-live; o brainstorming dela roda em modo autônomo (o orquestrador responde às perguntas da skill com SPEC, PLAN, `docs/design`, a pesquisa do ADR-005 e dados do staging) e o spec resultante vira Ruling — pedido explícito do humano em 2026-09-27 — custo se estiver errada: uma fatia a mais no caminho crítico antes do go-live
- Ruling: a S17 (LGPD e dados demonstrativos) roda no worktree T2 em paralelo com a S16 (Admin, worktree T3), logo após o fim da trilha B2B — as duas fatias quase não se tocam (S16: telas e funções do admin; S17: consentimento, retenção, exportação/exclusão de conta) e os worktrees ficariam ociosos; migrations na faixa 06xx com números distintos e renumeração no merge se colidirem — custo se estiver errada: conflitos de merge em ledgers/PROGRESS/DEBT e, no pior caso, renumerar uma migration antes de aplicar no staging
- Ruling: a proposta de instrumentação com PostHog vira ADR-007 (o pedido citou "ADR-004", número já usado pelas trilhas paralelas) com status "proposta"; não entra no PLAN nem vira código até o humano aprovar; `identify` usa só o uuid do perfil (o telefone dispara o identify mas nunca é enviado), para cumprir "sem PII nos eventos" — custo se estiver errada: renumerar o ADR ou mover o identificador, sem código afetado

## S17 · LGPD e dados demonstrativos (fora de trilha, worktree T2, 2026-09-27)

- Ruling: memória global do Segundo Cérebro (CLAUDE.md pessoal, fora do repositório) não foi consultada nesta
  sessão — a tarefa já define seu próprio mecanismo de memória (`docs/superpowers/ledger.md`/`DEBT.md`/
  `PROGRESS.md`, específico deste projeto) e o cofre Obsidian pessoal não tem contexto relevante para uma fatia de
  implementação de código; consultá-lo gastaria orçamento sem ganho. Custo se estiver errada: nenhum — o fechamento
  de memória do CLAUDE.md pessoal também não se aplica (nenhum aprendizado de produto/técnica pessoal a registrar
  fora deste repositório).
- Ruling: migration `0605_lgpd_privacy.sql` (não `0604`): `slice/S16-admin` (T3, paralela) já usa `0604_admin_reports.sql`
  (conferido por `git ls-remote`/pelo worktree). Se colidir no merge (prefixos diferentes, pouco provável),
  renumerar esta.
- Ruling (o mais estrutural desta fatia): `claims.claimant_id` e `claim_evidence.uploaded_by` passam de
  `on delete restrict` para `on delete set null` (nullable). Eram as ÚNICAS FKs para `profiles` com `restrict`
  em todo o schema (todas as outras já eram `cascade` — dado pessoal — ou `set null` — rastro que sobrevive,
  vários comentários já diziam "nulo só após exclusão de conta (LGPD), na S17"). Sem essa mudança, excluir a conta
  de um reivindicante trava com violação de FK e a exclusão real do perfil fica impossível para sempre. O gatilho
  novo `profiles_lgpd_erase` (BEFORE DELETE em `profiles`, SECURITY DEFINER, `search_path=''`, `enable always`)
  anonimiza `claims.claimant_name`/`contact_email`/`evidence_note` e `claim_evidence.original_name` (nome do
  arquivo pode ter PII) ANTES do SET NULL valer, na mesma transação — a escola continua com o registro de decisão
  (`status`, `decided_at`, `school_id`), só sem dado pessoal do reivindicante. Testado ponta a ponta (reivindicação
  aprovada, exclusão real do perfil, escola continua `verified`). Custo se estiver errada: reverter para
  `restrict` é uma migration aditiva; nenhuma conta de produção existe ainda para ter sido afetada.
- Ruling: `lead_events.actor_id` (D-014) NÃO é zerado por UPDATE — tentei e o próprio gatilho de imutabilidade da
  tabela bloqueou (`lead_events é imutável`), confirmando que a tabela é append-only por desenho, igual
  `claim_status_events`/`audit_log`. Como a coluna nunca teve FK (comentário original: "rastro sobrevive à
  exclusão de conta"), a ausência de FK É a anonimização: depois que o perfil é apagado, o uuid em `actor_id` não
  resolve a ninguém (nenhum outro perfil nasce com o mesmo id) — vira um valor órfão e não religável. Mesmo
  raciocínio documentado para `claim_status_events.actor_id`/`invoices.actor_id`/`credit_ledger.actor_id`. D-014
  fecha por documentação, não por código. Custo se estiver errada: nenhum código a desfazer.
- Ruling: `retention_policies` (D-012) cobre exatamente `claim_evidence` (180 dias após a decisão final da
  reivindicação) e `claim_tokens` (90 dias após o vencimento) — os dois recursos citados pelo próprio D-012. Os
  números são parâmetro de engenharia guardado numa tabela editável por `service_role` (não um fato jurídico
  inventado — CLAUDE.md proíbe inventar preço/prazo/métrica do PRODUTO, não parâmetro técnico interno), e a
  cópia pública (`/privacidade`) NÃO cita o número: o `copy-claims.test.tsx` (S27) já tem um guard-rail que recusa
  qualquer texto de site público com "número + dias/mil/%/..." — achado real ao rodar o teste (falha vermelha
  antes da correção), corrigido descrevendo o prazo sem dígito ("prazo técnico definido internamente,
  ajustável..."). `retention_candidates`/`retention_purge` (SECURITY DEFINER, EXECUTE só `service_role`) só
  conhecem esses dois nomes de tabela por construção — nunca leem/escrevem `survey_*` (ADR-005), testado
  explicitamente (contagem antes/depois inalterada).
- Ruling: job de retenção roda em duas camadas, mesmo padrão de `leads-expire`/`b2b-maintenance`: a função SQL
  devolve candidatos e apaga por id (idempotente); `features/privacy/retention.ts` remove o objeto do Storage
  ANTES de apagar a linha, best-effort (falha no Storage nunca bloqueia o `retention_purge`, só conta em
  `storageFailed` — mesmo espírito de D-017) porque o Postgres não pode apagar o byte físico do bucket, só o
  catálogo; `/api/cron/retention-purge` reaproveita `isAuthorizedCron`/`CRON_SECRET_MIN_LENGTH` de
  `features/leads/cron-auth.ts` (tempo constante), sem duplicar a lógica.
- Ruling: `account_export(p_profile_id uuid)` é SECURITY DEFINER (ignora RLS) mas com `p_profile_id` explícito —
  mesmo modelo de confiança de `consents_revoke`/`notifications_mark_read`: a segurança está em o Server Action
  sempre passar `actor.userId` da sessão validada (`getSessionActor()`), nunca um id de formulário. Cada
  subconsulta dentro da função filtra manualmente por `p_profile_id` (obrigatório, já que DEFINER roda como dono
  da tabela). Testado com dois perfis reais: um nunca vê o `consents`/reivindicação do outro.
- Ruling: exclusão de conta NÃO tem função SQL própria de "excluir conta" — a exclusão de verdade é
  `auth.admin.deleteUser`, que a Admin API do Supabase já expõe e que dispara o mesmo `DELETE FROM auth.users`
  cascateado que os testes de banco verificam diretamente. `features/privacy/repository.ts#deleteAccount` só
  orquestra: lista os caminhos do Storage do próprio dono (`list_submissions`/`claim_evidence`), remove
  best-effort, e chama `deleteUser` (idempotente: 404 não é erro). Nenhuma tabela nova, nenhuma função nova para
  isto além do gatilho/FKs já descritos.
- Ruling: Tasks 2 e 3 do plano (job de retenção; exportação/exclusão) foram para um commit só
  (`8754b82`) — os testes de integração de ambas compartilham `tests/privacy/repository.test.ts` (nome exigido
  pelo glob `tests/**/repository.test.ts` de `vitest.db.config.ts`), então separar o commit por task exigiria
  separar o arquivo de teste em subpastas só por estética; custo/benefício desfavorável perto do fim da fatia.
- Ruling: D-015 e D-016 (dono S17 no DEBT, severidade média/baixa) ficam `aberta`, documentadas com Ruling: D-015
  é ajuste de texto de outra tabela (`leads`, S14), não gap estrutural de LGPD; D-016 (aceite de reivindicação
  centralizado em `consents`) exigiria mudar o fluxo de outra fatia (S06) por um ganho de organização, não de
  conformidade (o timestamp e a versão do texto já existem em `claims`). D-017 (Storage órfão sem linha em
  `claim_evidence`) também fica `aberta`: fora do escopo do job de retenção, que só apaga evidência COM linha
  vencida.
- Ruling: `features/site/legal.ts` — `LEGAL.retention`/`claimRetention` preenchidos (texto técnico, sem
  conformidade jurídica, sem número com unidade); `LEGAL.auditRetention` continua `null` de propósito: esta fatia
  não criou rotina de exclusão para `audit_log` (é imutável por desenho — só o job de evidência/token roda);
  decidir se cabe alguma rotina é decisão jurídica/de produto do humano, registrada como D-155 (renumerada de
  D-150 por colisão com a S16 no merge). O parágrafo
  "Dados de crianças" da página pública estava desatualizado desde a S15 (dizia "hoje a plataforma não tem campo
  de estudante", mas `students` existe desde então) — corrigido para refletir o cadastro real (só apelido e
  série). `tests/site/legal.test.tsx` reescrito: a asserção antiga "`LEGAL` é todo `null`" não podia mais ser
  verdadeira (por desenho desta fatia); trocada por uma lista explícita do que continua só do humano/jurídico
  (razão social, CNPJ, contato, base legal, operadores, data, prazo de auditoria) versus o que a S17 já preencheu.
- Ruling: auditoria do selo "Demonstração" foi por amostragem dirigida, não exaustiva (D-156, renumerada de
  D-152 por colisão com a S16 no merge): verificado
  `app/escolas/[inep]/[serie]` (via `StatusBadges`), `PublicProfileView` (papelarias) e a lista de leads da
  papelaria (`app/papelaria/leads/(lista)/page.tsx` → `LeadTable`/`LeadCards`, que JÁ mostravam `DemoSeal` — não
  era o gap que pareceu à primeira vista, só estava no componente filho, não na página) — nenhuma lacuna real
  encontrada nos pontos verificados; uma varredura completa (todo `is_demo` do schema × todo componente que o
  consome) fica para S18, registrada como dívida.
- Achado (confirmado rodando o teste, não só suposto): `UPDATE public.lead_events SET actor_id = null` é
  bloqueado pelo próprio gatilho de imutabilidade da tabela (`lead_events é imutável (UPDATE bloqueado)`) — este
  achado sustenta o Ruling acima sobre D-014 e está coberto por um teste dedicado em `tests/db/lgpd-privacy.test.ts`
  que tenta o mesmo UPDATE em `claim_status_events` e espera o erro.
- Achado: `pnpm test:db`/`pnpm test` completos falharam, em rodadas completas diferentes desta sessão, num teste
  aleatório não relacionado à S17 (`tests/db/audit.test.ts`, depois `tests/claims/repository.test.ts`, depois
  `tests/submissions/school-picker.test.tsx`), sempre passando 100% quando rodado isolado — flakiness de
  ordem/tempo pré-existente na suíte grande (paralelismo alto de ~1800/~3300 testes), não causada por esta fatia;
  registrado como D-157 (renumerada de D-151 por colisão com a S16 no merge).

## S17 · correções da revisão de segurança (Opus, rodada única sobre d405956)

Revisão não achou bloqueantes; 7 itens numerados + achados menores. Todos corrigidos nesta rodada, worktree T2.

- Ruling (item 1, Storage órfão): `features/privacy/retention.ts#removeConfirmed` só marca um caminho como
  "removido" quando o `data` devolvido por `.remove()` confirma o nome, OU quando um `list()` de acompanhamento
  confirma que o arquivo já não existe (execução anterior que apagou o arquivo mas não chegou a
  `retention_purge`, ou reentrada). `retention_purge` só recebe os ids confirmados — uma falha real de Storage
  nunca leva à exclusão da linha (fica candidata de novo, contada em `storageFailed`). Em
  `features/privacy/repository.ts#deleteAccount`, `ownedStoragePaths` agora LANÇA (não engole) se a leitura
  falhar, e `removeOrThrow` INTERROMPE a exclusão da conta se a remoção falhar (erro `storage_failed`, "tente
  excluir de novo") — sem fila de retentativa própria (Ruling: erro claro + nova tentativa manual cobre o caso;
  uma fila exigiria uma tabela e um worker novos, custo desproporcional ao risco real de uma chamada de Storage
  falhar bem no meio da exclusão). Custo se estiver errada: trocar por fila é aditivo, sem migração de dado.
- Ruling (item 2, agendamento): `/api/cron/retention-purge` entra em `vercel.json` (`0 11 * * *`, diário, mesmo
  `CRON_SECRET` dos outros crons); registrado em PROGRESS.md como pendência humana (aceite do cron no plano da
  conta Vercel, igual às demais fatias).
- Ruling (item 3, reivindicações pendentes na exclusão): `profiles_lgpd_erase` cancela (ator `system`, motivo
  `'Conta do reivindicante excluída'`, código `claimant_account_deleted`) toda reivindicação do titular ainda sem
  decisão final ANTES de anonimizar, e chama `claim_sync_school` para a escola voltar ao estado certo
  (`registered` se não houver mais reivindicação aberta). `claim_decide` (via `create or replace`) recusa decidir
  reivindicação com `claimant_id` nulo (22023, `claimant_missing`) como defesa em profundidade — testado
  simulando "algo escapou da varredura" (`claimant_id` zerado por fora do caminho normal, com
  `session_replication_role = replica`).
- Ruling (item 4, vínculos que bloqueiam a exclusão): `account_deletion_blockers(p_profile_id)` (SECURITY
  DEFINER, `service_role`) devolve os códigos `stationery_owner_active` (dono de papelaria com `status='active'`),
  `b2b_partner_owner` (qualquer vínculo em `b2b_partner_members`, que hoje só tem papel `owner`) e
  `review_history` (qualquer linha em `review_versions.actor_id` — tabela append-only, sem `on delete` explícito
  = `no action`; nunca poderia ser apagada nem anonimizada sem quebrar a trilha de auditoria da revisão humana).
  `deleteAccount` chama isto ANTES de tocar em Storage ou em `auth.admin.deleteUser`; o Server Action mapeia cada
  código para uma mensagem específica ("transfira ou encerre antes" / "fale com o suporte"), nunca um erro
  genérico. Ruling: não incluí `school_members` (dono de escola verificada) na lista — o pedido da revisão citou
  só papelaria/B2B/curadoria; dono de escola verificada que se exclui hoje só perde o vínculo (cascade), sem
  bloqueio — registrado como observação, não como dívida nova (baixo risco: a escola continua verificada, só sem
  administrador vinculado, e qualquer responsável pode reivindicar de novo se precisar). Custo se estiver errada:
  adicionar um quarto código à função é aditivo.
- Ruling (item 5, consentimento): `REVOCABLE_CONSENT_PURPOSES = ['list_upload']` — `billing_terms` e
  `b2b_api_terms` são aceite contratual (cobrança, portal B2B): a tela nunca mostra "Revogar" para elas, e
  `revokeConsentAction` recusa mesmo com um id real forjado no formulário (consulta a finalidade antes de
  chamar `consents_revoke`). Para `list_upload`, a escolha foi honestidade sobre o efeito, não interromper
  processamento: cada envio de lista já grava o PRÓPRIO consentimento (não reaproveita um antigo), então revogar
  um consentimento passado não desfaz o envio nem impede um envio novo — a tela agora diz isso explicitamente,
  em vez de deixar a família supor que "revogar" tem um efeito de bloqueio que não existe.
- Ruling (item 6, reautenticação recente): `deleteAccountAction` exige `last_sign_in_at` (do `User` validado por
  `getCurrentUser`/`getUser`, nunca `getSession`) com menos de 15 minutos, além da palavra de confirmação; sessão
  velha recebe mensagem pedindo novo link mágico, sem tentar excluir nada. Sem senha no produto (login só por
  link mágico), reautenticar É entrar de novo pelo link — não há "confirmar senha" para pedir em vez disso.
- Ruling (item 7, `auth.audit_log_entries`): registrado como D-154 (média, dono Humano; renumerada de D-153 por
  colisão com a S16 no merge) — é schema `auth` do
  GoTrue, gerido pelo Supabase, fora do alcance de uma migration em `public`; guarda e-mail em claro de cada
  evento de autenticação sem prazo definido. Não alterado (Ruling explícito de não tocar em schema de sistema).
- Achados menores (todos corrigidos): `claimant_role_title` passa a ser anonimizado em `profiles_lgpd_erase`
  (antes ficava, achando "cargo institucional não identifica sozinho" — a revisão apontou que cargo + outros
  dados públicos da escola PODEM re-identificar); `claims_guard` trocado de `<>` para `is distinct from`,
  liberando EXPLICITAMENTE só a transição de `claimant_id` não-nulo -> nulo (o `<>` antigo "funcionava" só por
  acidente de lógica de três valores do SQL); `retention_candidates('claim_evidence', ...)` exclui
  `insufficient_evidence` mesmo com `decided_at` antigo (o reivindicante ainda pode retomar essa reivindicação,
  então a evidência não é definitiva); `account_export` ganhou `notifications`, `list_watches`,
  `parent_list_copies`, `affiliate_clicks`, `vinculos` (escola/papelaria/parceiro B2B) e o e-mail da própria conta
  (via `auth.users`, dentro da mesma função SECURITY DEFINER); `x-content-type-options: nosniff` na resposta de
  `/api/conta/exportar`; "por obrigação legal" trocado por "registro que mantemos" em `features/site/legal.ts` e
  na página `/conta/privacidade` (mesmo espírito de "sem afirmar conformidade jurídica" do CLAUDE.md — "obrigação
  legal" sugere uma certeza jurídica que esta fatia não tem base para afirmar).
- Achado (confirmado rodando, não só suposto): `review_versions`/`claim_status_events` bloqueiam DELETE direto
  mesmo sob `session_replication_role = replica` (a tabela tem SEU PRÓPRIO gatilho de bloqueio, que dispara
  independente do modo de replicação) — só saem por CASCADE de verdade (deletar a linha pai com o gatilho de
  cascade ATIVO, nunca em modo replica, que desliga o próprio gatilho de cascade e deixaria a linha filha órfã,
  sem FK, apontando para um pai que já não existe). Descoberto ao debugar um teste próprio que tentou apagar
  `review_versions` direto no cleanup e, corrigido, quebrou `cleanupUsers()` por deixar uma linha órfã
  referenciando `profiles.id` de um perfil compartilhado entre arquivos de teste — lição registrada aqui para
  não repetir: cleanup de tabela append-only É pelo pai, nunca em modo replica quando o pai tem cascade real.

## S17 · segunda reverificação de segurança (Opus, sobre ae06173)

Sem bloqueantes; uma correção antes do PR + registro de riscos residuais.

- Ruling (correção única): `account_deletion_blockers` comparava só `status = 'active'`, deixando passar
  `signup`/`accreditation`/`under_review`/`approved`/`paused`/`suspended` — qualquer uma dessas etapas já é um
  cadastro de papelaria real (alguém investiu tempo cadastrando, ou já operou e foi pausada/suspensa), então
  excluir a conta da única dona sem aviso deixaria o cadastro órfão do mesmo jeito que `active` deixaria. Trocado
  para `status <> 'rejected'` (só `rejected` significa "nunca chegou a ser um negócio de verdade"). Código
  renomeado de `stationery_owner_active` para `stationery_owner` (o sufixo `_active` não descrevia mais a
  condição) em toda a cadeia (`account_deletion_blockers`, `features/privacy/errors.ts`,
  `features/privacy/repository.ts#DELETION_BLOCKERS`, `app/conta/privacidade/actions.ts`, testes). Teste novo
  cobre os 7 status que bloqueiam e o 1 que não bloqueia (`rejected`), cada um com o mesmo perfil reaproveitado em
  sequência (`stationery_members_one_owner_per_profile` só permite um perfil dono de uma papelaria por vez).
- Ruling (achado menor, "conte coproprietários"): tanto `stationery_members` quanto `b2b_partner_members` já têm
  unique index que garante UM SÓ dono por entidade
  (`stationery_members_one_owner_per_stationery`/`b2b_partner_members_one_owner_per_partner`), então "você é a
  única responsável" já era verdade por invariante do schema, não só por suposição. Mesmo assim, a consulta de
  `account_deletion_blockers` passou a conferir explicitamente `not exists (select ... outro dono)` para os dois
  casos — redundante com a constraint atual, mas deixa a condição de negócio explícita na própria função, não só
  implícita numa unique index que poderia mudar (ex.: co-donos, se a Comércio decidir permitir). Não escrevi teste
  para "com coproprietário, não bloqueia": o schema atual impede CONSTRUIR esse cenário (a unique index nunca
  deixaria dois `owner` na mesma entidade), então o ramo é verificável só por leitura da consulta, não por teste
  de banco — registrado aqui para quem revisar de novo não estranhar a ausência do teste.
- Riscos residuais registrados (pedido explícito da revisão; nenhum é bloqueante, nenhum é vazamento de dado):
  - **Reautenticação por usuário, não por sessão**: `deleteAccountAction` confere `last_sign_in_at` do `User`
    (GoTrue), que é atualizado a cada login do usuário em QUALQUER sessão/dispositivo — não existe, na API do
    Supabase Auth usada aqui (`getUser`, nunca `getSession`), um timestamp de "quando ESTA sessão específica foi
    emitida". Efeito prático: se o titular logar pelo link mágico em outro aparelho enquanto uma aba antiga (com
    sessão já emitida há mais de 15 minutos) ainda está aberta neste, a aba antiga também passa a satisfazer a
    janela de 15 minutos, porque o relógio é do USUÁRIO, não da SESSÃO. Isto não abre uma porta para outra
    pessoa excluir a conta (ainda exige o cookie de sessão válido do próprio titular, que só ele tem), só
    enfraquece um pouco a garantia de "prove que é você de novo, agora" para o caso estreito de múltiplas abas/
    dispositivos simultâneos do MESMO titular. Custo de corrigir: exigiria um campo próprio de "quando esta
    sessão foi emitida" (JWT `iat` da sessão atual, decodificado no servidor, comparado ao invés de
    `last_sign_in_at`) — mudança maior, fora do escopo desta correção pontual; registrado aqui, não como DEBT
    numerada (baixíssimo risco, produto sem senha, e o cookie de sessão em si já expira por conta própria).
  - **Exclusão parcial se o Storage falhar no meio, ou se `deleteUser` falhar DEPOIS do Storage ter sido limpo**:
    `deleteAccount` roda em passos sequenciais (bloqueios → Storage → `auth.admin.deleteUser`), sem transação
    distribuída (não existe tal coisa entre o Storage e o Auth do Supabase). Se o Storage for limpo com sucesso e
    a chamada a `deleteUser` falhar depois (rede, timeout), a conta continua existindo, mas os arquivos que ela
    tinha em `list_submissions`/`claim_evidence` já se foram — o titular veria o próprio envio de lista ou
    evidência de reivindicação "quebrado" (sem arquivo) até tentar excluir de novo com sucesso. Não é vazamento
    (nenhum dado passa para outra pessoa) nem perda de dado ALÉM do que a exclusão já pediria — só uma ordem de
    operações onde a segunda etapa pode falhar depois da primeira ter sucesso. `deleteAccount` é seguro para
    tentar de novo (`ownedStoragePaths` simplesmente não acha mais nada para remover na segunda tentativa, e
    `deleteUser` é idempotente — 404 não é erro). Alternativa mais segura seria inverter a ordem (excluir o
    usuário primeiro, Storage depois) — mas isso trocaria o risco por outro: perfil já apagado (nome sumiu da UI)
    com arquivo do Storage ainda vivo até uma segunda tentativa, o que expõe o MESMO arquivo por mais tempo em
    vez de menos. Mantida a ordem atual (Storage primeiro) por ser a que minimiza o tempo em que um documento
    pessoal (potencialmente sensível, evidência de reivindicação) continua acessível depois que a exclusão foi
    pedida. Sem DEBT numerada: comportamento aceitável e já coberto pela idempotência.

## S16 · Admin (branch `slice/S16-admin`, worktree T3)

- Ruling: dashboard (Admin01-Visao) e auditoria filtrável (Admin08-Eventos) leem por RLS já existente
  (`..._select_admin` em `schools`/`school_lists`/`claims`/`stationeries`/`leads`/`audit_log`, desde S01–S14) com o
  client de sessão, sem função SQL nova — menos superfície nova, mesma garantia (RLS + `getSessionActor` na
  página) — custo se estiver errada: adicionar a função depois é aditivo, sem migrar dado.
- Ruling: `reports` (denúncias) é tabela nova em `0604_admin_reports.sql` (faixa pós-trilhas `06xx`, seguinte à
  `0603`); `reason` é enum, `detail_code`/`resolution_note` são código curto com a mesma regex de
  `ai_decisions.justification` (nunca prosa/PII); sem coluna de contato do denunciante. Transição de estado por
  `report_transition_allowed`/`reports_guard` (SECURITY DEFINER, `search_path=''`, EXECUTE revogado de todos);
  auditoria automática reaproveitando `audit_row_change` (0001) — custo se estiver errado: tabela aditiva, sem FK
  de terceiros para dentro dela; corrigir é migration nova.
- Ruling: `ai_settings` (S16) fica com `auto_publish_enabled` e `routes` SÓ LEITURA na UI de edição — nunca liga
  `auto_publish_enabled` sozinha (regra do CLAUDE.md) e `routes` (JSON heterogêneo de roteamento de modelo) fica
  fora do formulário por risco/tempo — só os campos com CHECK simples (`confidence_threshold`,
  `item_confidence_threshold`, `critical_alerts`, `max_escalations`, `pipeline_version`) são editáveis — custo se
  estiver errado: uma fatia futura abre os dois campos com o próprio Ruling explícito exigido.
- Ruling: "arquivar lista" reaproveita `list_archive`/`features/lists/repository.ts#archive()`, já existentes
  desde S05 e sem uso em UI nenhuma — sem função SQL nova. Entrada única: `/admin/denuncias/[id]` (para
  `target_type = 'school_list'`) e busca direta por id em `/admin/listas/[id]`; sem índice navegável de todas as
  listas publicadas (fora do prompt da fatia) — custo se estiver errado: adicionar o índice depois é só uma tela
  nova, sem tocar em banco.
- Ruling: ponto de entrada público de denúncia nesta fatia é só a página da escola (`app/escolas/[inep]`), só
  autenticado, só para a lista publicada em exibição (`target_type = 'school_list'`). Denúncia de
  papelaria/catálogo fica só no schema (sem tela pública ainda) — dívida nova registrada no DEBT.md — custo se
  estiver errado: a tabela já suporta os dois tipos, é só a tela que falta.
- Ruling: DEBT D-006 (confirmação antes de aprovar reivindicação) entra nesta fatia (pequena, UX direta, sem
  migration). D-007, D-035, D-036, D-037 e D-083 continuam abertas com dono reatribuído para S17/S18: nenhuma
  bloqueia o prompt central da S16 (dashboard/auditoria/denúncias/`ai_settings`/arquivar) — custo se estiver
  errado: são todas independentes, resolver mais tarde não bloqueia nada desta fatia.

## S16 · correções da revisão de segurança (Opus, sobre `682ab71`, sem bloqueantes)

Migration `0604_admin_reports.sql` editada no lugar (ainda só local, sem staging). Testes novos antes da correção
(vermelho registrado em `docs/superpowers/logs/s16-security-review-red.txt`: 9 de 16 falhas em
`tests/db/reports.test.ts` contra a versão anterior do arquivo); depois da correção, 16/16 e o resto da suíte de
banco sem regressão (1821 testes).

1. **Denúncias: só `school_list` por enquanto, com CHECK + gatilho (não só Zod).** `reports_target_type_scope`
   (CHECK) e o `else` de `reports_check_before_insert` recusam `stationery`/`catalog_item` com hint
   `target_type_not_allowed` — custo se estiver errado: tirar a trava é um `alter table drop constraint` +
   remover o `else`, sem migração de dado.
2. **Teto diário por denunciante, função própria (`reports_max_per_day`, hoje 10/dia).** Valor isolado numa
   função SQL trivial (não hardcoded dentro do gatilho): trocar o teto depois é um `create or replace function`,
   sem editar `reports_check_before_insert` — custo se o valor estiver errado: um `create or replace` resolve.
3. **Alvo precisa existir e (para `school_list`) estar `published`**, validado no BEFORE INSERT
   (`reports_check_before_insert`, hint `target_not_found`) — sem essa checagem, dava para denunciar uma lista
   arquivada ou um uuid qualquer.
4. **Índice único parcial `(reporter_id, target_type, target_id) where status in ('open','reviewing')`**: nunca
   duas denúncias em aberto/análise do MESMO denunciante para o MESMO alvo; libera de novo depois de
   resolvida/arquivada (o índice só cobre os dois estados abertos) — mapeado para `already_exists` no repositório
   (`23505`).
5. **`resolved_by` forçado por `auth.uid()` dentro de `reports_guard`** na transição para `resolved`/`dismissed`
   — a coluna continua gravável por grant (defesa em profundidade real: mesmo que o cliente mande outro id, o
   gatilho sobrescreve antes do CHECK). Achado ao escrever o teste: `reports_guard` é `SECURITY DEFINER`, então
   `auth.uid()` (GUC de sessão) segue lendo o chamador certo independente disso — sem armadilha aqui, ao
   contrário do achado abaixo em `ai_settings`.
6. **`resolved_by` sem SELECT para `authenticated`.** Achado real desta rodada: um `REVOKE SELECT (coluna) FROM
   role` feito DEPOIS de um `GRANT SELECT ON tabela TO role` (grant de tabela inteira) não revoga nada — a ACL de
   coluna só reduz o que não está coberto por um grant de tabela mais amplo (confirmado direto no Postgres local
   antes de decidir). Corrigido concedendo desde o início só a lista de colunas sem `resolved_by`
   (allow-list), em vez de "concede tudo, revoga depois" — quem resolveu já fica no `audit_log` (gatilho
   `reports_audit`), então não faz falta ler pela tabela. `features/reports/repository.ts` para de pedir a coluna
   (pedir uma coluna sem privilégio derruba a consulta inteira).
7. **`ai_settings.auto_publish_enabled`/`routes`: gatilho, não `REVOKE`, pelo mesmo motivo do item 6** — a 0202
   (já no staging) concede `UPDATE` de tabela inteira para `authenticated`; um `REVOKE UPDATE (coluna)` aditivo na
   0604 não teria efeito nenhum (mesmo achado). Fix real: `ai_settings_lock_sensitive_fields` (gatilho BEFORE
   UPDATE) bloqueia mudança nas duas colunas a menos que `auth_role() = 'system'` OU `current_user in
   ('postgres','supabase_admin')`. **Segundo achado, direto de um teste que quebrou**: a primeira versão do
   gatilho era `SECURITY DEFINER`, o que faz `current_user` dentro da função ser sempre o DONO da função
   (tipicamente `postgres`), nunca quem chamou — o bypass ficava sempre verdadeiro para qualquer chamador,
   inutilizando a trava. Corrigido trocando para `SECURITY INVOKER` (sem a cláusula), mesmo padrão de
   `public.profiles_guard_role` (0001) para esse tipo de bypass de superusuário/migration — confirmado contra
   `tests/db/extraction-real-pipeline.test.ts`, que escreve `routes` como dono via `reset role` (pipeline real).
   `tests/db/publication-decisions.test.ts` (S09) tinha um teste que verificava exatamente o comportamento ANTIGO
   (admin ligando `auto_publish_enabled` direto por SQL) — reescrito para verificar o novo invariante: admin não
   liga mais direto (bloqueado), `service_role`/`system` continua ligando, com auditoria.
8. **Gatilhos de auditoria de `lead_reviews`/`lead_disputes` (0402, S22, já no staging) recriados na 0604**
   (aditivo, `DROP TRIGGER` + `CREATE TRIGGER`, sem editar o arquivo aplicado) excluindo `comment`/`detail` do
   `audit_row_change` — escaparam do mesmo padrão que a 0402 já aplica em `claims`/`stationeries`
   (`claimant_name`, `evidence_note` etc.) — custo se estiver errado: recriar os gatilhos de novo é aditivo,
   sem migrar dado (o `audit_log` antigo, se existir em algum banco já rodando, ficaria com as colunas — mas
   nenhum banco além do local rodou esta versão ainda).
9. **`next` da denúncia pública só com prefixo `/escolas/`, senão cai para `/escolas`.** Hoje o único chamador
   (`app/escolas/[inep]/page.tsx`) já só passa um `next` seguro; a checagem é defesa em profundidade contra um
   futuro chamador que erre — custo se estiver errada: qualquer novo chamador que precise de outro prefixo tem
   que ser adicionado à lista permitida.
10. **Motivo de arquivamento de lista por código, não texto livre** (`features/lists/close-reasons.ts`, mesmo
    padrão de `lead_reviews.hidden_reason`): vocabulário fixo (`denuncia_procedente`, `solicitacao_escola`,
    `conteudo_indevido`, `duplicada`, `outro`) + observação curta opcional com a mesma regex de código de
    `reports.detail_code`. `list_status_events.reason` (0103, base) continua aceitando texto livre até 1000 chars
    a nível de banco — decisão desta fatia foi disciplinar só a UI/Zod, sem migrar `0103` (fora de alcance,
    aplicada desde a S05) — custo se estiver errado: trocar o vocabulário depois é só editar
    `close-reasons.ts`, sem migration.
11. **Auditoria: `auditFilterSchema` estava definido mas nunca chamado** (achado real, não hipotético: um
    `entidadeId` que não fosse uuid ia direto para a consulta e virava "Não foi possível carregar", indistinguível
    de uma falha de banco de verdade). `app/admin/eventos/page.tsx` passa a validar com `safeParse` antes de
    chamar `searchAuditLog`; filtro inválido mostra "Filtro inválido: confira..." e nunca chega ao banco.
