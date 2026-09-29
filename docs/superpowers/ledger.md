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

## S18 · Estados e acessibilidade (fora de trilha, worktree T3, 2026-09-27)

Plano em `docs/superpowers/plans/2026-09-27-s18-estados-a11y.md`. Rulings de escopo completos lá; resumo abaixo
para quem só consulta o ledger.

- Ruling: memória global do Segundo Cérebro (CLAUDE.md pessoal, fora do repositório) não consultada nesta sessão
  pelo mesmo motivo já registrado na S17 — a tarefa já tem seu próprio mecanismo de memória de projeto (ledger/
  DEBT/PROGRESS) e o cofre Obsidian pessoal não guarda contexto de implementação de código desta fatia — custo se
  estiver errada: nenhum aprendizado de produto/técnica pessoal fica sem registrar fora deste repositório.
- Ruling: o aceite do PLAN cita literalmente "nenhum arquivo de D-057 acima de 250 linhas" — o refactor desta
  fatia cobre só os 10 arquivos DE D-057 (conferidos de novo: todos ainda acima de 250 linhas). Uma varredura
  ampla do repositório achou MAIS 7 arquivos acima de 250 linhas nascidos depois de D-057 ter sido escrito
  (S21–S26: `features/billing/repository.ts` 603, `features/b2b/api/handler.ts` 549, `features/payouts/
  repository.ts` 533, `features/conversion/repository.ts` 496, `features/b2b/repository.ts` 411, `features/
  billing/service.ts` 334, `features/campaigns/repository.ts` 320) — todos já passaram por revisão de segurança
  dedicada (Opus) nas próprias fatias de cobrança/B2B; reabri-los para um split de legibilidade, sem relação com
  o objetivo desta fatia e sem uma nova rodada de revisão de segurança dedicada, é risco desproporcional ao
  ganho. Registrados como dívida nova (ver DEBT.md, D-158) com dono numa fatia futura de manutenção — custo se
  estiver errada: mais uma fatia de refactor puro; nenhum comportamento muda enquanto isso.
- Ruling: estratégia de split dos 10 arquivos de D-057 é extrair funções/métodos para arquivos-irmãos por
  responsabilidade e manter o arquivo original como barrel fino (`export * from "./x-parte"`) — nenhum import de
  chamador muda, `pnpm typecheck` garante que nenhum call site quebrou. Em `features/claims/repository.ts` (única
  fábrica com estado fechado por closures), os métodos extraídos viram sub-fábricas que recebem o client/deps/
  helpers compartilhados e a fábrica principal compõe o objeto por spread — comportamento runtime idêntico.
- Ruling: estados de rota (loading/sucesso/erro/vazio/retry) e a11y são tratados por auditoria + correção
  sistêmica (primitivos compartilhados, CSS de foco visível global, skip-link) em vez de edição manual de cada
  uma das ~90 rotas — mesmo espírito arquitetural do D-057. Cobertura é documentada no relatório E2E
  (`docs/superpowers/e2e/S18.md`), nunca alegada 100% sem verificação.
- Ruling (D-048): consolidação dos ledgers de trilha em `ledger.md` é movimentação fiel — o texto de
  `ledger-dados.md`/`ledger-pipeline.md`/`ledger-comercio.md` entra sob um cabeçalho "## Trilha <nome>
  (consolidado de ledger-<trilha>.md)" sem reescrever nenhuma frase; cada arquivo de trilha fica com um ponteiro
  de uma linha. Motivo: preservar a redação original (evidência da decisão tomada em cada fatia) e cumprir a
  instrução literal da tarefa. Feito nesta sessão (ver seções abaixo).
- Ruling: dívidas S18 de severidade baixa que exigiriam tocar dezenas de arquivos para um ganho pequeno (D-082:
  sino de notificação em `PanelShell`/`AdminShell`/`SchoolShell`) mantidas `aberta` com Ruling de adiamento —
  já revisitadas e adiadas nas S15/S16 pelo mesmo motivo (risco de regressão ampla por pouco ganho). As demais
  dívidas S18 foram triadas uma a uma (ver DEBT.md para o resultado de cada uma).
- Ruling: nenhuma migration nova nesta fatia — D-057, estados e a11y não tocam schema; nenhum achado de
  severidade alta apareceu que exigisse uma.
- Ruling: `tests/publication/decide-guards.test.ts` ("varreduras da Task 2", S09) precisou de ajuste ao dividir
  `decide.ts` em `decide.ts` + `decide-publish-stage.ts` (D-057) — duas asserções liam o texto-fonte de `decide.ts`
  esperando "só este arquivo chama `.publish()`" e "só este arquivo nunca instancia memória"; a etapa de
  publicação (lease -> porta -> registro, incl. a única chamada a `.publish()`) mudou de arquivo. O INVARIANTE
  ("só um lugar no serviço chama a porta; nenhum instancia memória fora da composição") continua verdadeiro — só
  o nome do arquivo mudou. Ajustado para checar `decide.ts` (0 chamadas) + `decide-publish-stage.ts` (1 chamada)
  e para incluir `decide-publish-stage.ts` na lista de arquivos sem literal decimal/memória direta. Nenhuma
  asserção de comportamento RUNTIME mudou (os 4 outros testes do arquivo, que exercitam `decideListPublication`/
  `resumePublication` de verdade, passam sem alteração) — custo se estiver errada: reverter os dois `expect` é uma
  linha cada.
- Ruling: D-124 (venda demo confirmada pela papelaria sem gravar validação, `payout_admin_validate_sale`,
  0403_repasses.sql) mantida `aberta`, sem tentativa de correção nesta fatia — a função é `SECURITY DEFINER` já
  revisada em rodada de segurança dedicada da S23 ("correção funcional (revisão de segurança, rodada 2)" no
  próprio comentário da migration); a regra desta fatia (Global Constraints do plano) proíbe alterar lógica de
  segurança já revisada além de mover código de posição, e D-124 exige mudança de LÓGICA (gravar a validação),
  não só reposicionamento. Severidade baixa: custo de adiar é baixo (a fila do Admin13 continua "aguardando
  validação" para esse caso específico, sem efeito de segurança ou de dinheiro); custo se a correção for feita
  errada numa fatia futura sem revisão de segurança dedicada seria alto (função toca repasse/dinheiro).
- Ruling: D-031 (tela de status decide "leitura indisponível" pelo `pipelineAvailable` calculado do AMBIENTE —
  `isPipelineAvailable()`/`getExtractionPipeline()`, `features/submissions/status.ts` — e não pelas rotas
  configuradas em `ai_settings`) mantida `aberta` — corrigir de verdade exigiria reimplementar, na tela de
  status, a mesma avaliação de disponibilidade de rota que `ai/router.ts#resolveRoute` já faz (provider
  configurado, `fake` só fora de produção, etc.), duplicando ou expondo lógica do roteador de IA (área revisada
  em rodada de segurança dedicada da S08/S09) fora do adapter único (`lib/ai/providers/*`, regra do CLAUDE.md).
  Severidade média, mas risco de regressão numa área sensível > ganho de precisão no texto de um estado
  transitório de tela — custo se estiver errada: o texto "leitura indisponível" pode aparecer numa janela em que
  a rota está tecnicamente configurada mas o processo Node não tem a chave (caso raro: só ocorre com
  configuração incoerente entre `ai_settings` e variáveis de ambiente do mesmo processo).
- Ruling: D-072 (build do CI depende de `next/font/google` para a Plus Jakarta Sans; hospedar localmente) mantida
  `aberta`, dono principal S19 — a S27 já commitou `assets/fonts` para a OG image (fonte estática já existe no
  repo), então o trabalho restante é trocar `next/font/google` por `next/font/local` no layout raiz e conferir
  que nenhuma tela depende do CDN do Google em runtime; é uma mudança de configuração de build que toca TODA
  página (qualquer regressão de carregamento de fonte é visível em produção) e está fora do escopo desta fatia
  (D-057 + estados/a11y) — custo se estiver errada: falha rara e intermitente do `pnpm build` no CI (já teve
  rerun verde uma vez, PR #20), sem efeito em produção fora do momento do build.
- Ruling: D-039 (cinco achados pequenos e não relacionados entre si, agrupados num só ID: `createLeadAction`
  perde papelaria/bairro no redirect de erro; `/cotacao` aberta a papéis que não criam lead; cartão mobile "valor
  enviado: indisponível"; item em falta como "fora do subtotal (em falta)"; tabela e cartões duplicados no HTML)
  mantida `aberta` — cada um exigiria abrir e testar um fluxo de comércio (leads/cotação) diferente; combinados,
  o custo de investigação e teste de regressão é desproporcional para 5 itens de severidade baixa numa fatia cujo
  objetivo central é D-057 + estados/a11y, não comércio. Sugestão para quem pegar o item: separar em 5 dívidas
  próprias antes de corrigir, uma por vez, com teste dedicado — custo se estiver errada: nenhum (só readabilidade
  do backlog).
- Ruling: D-052 (reenvio por `add_file` no E2E da S06 não confirma o fim do upload; flakiness do roteiro, não do
  produto) mantida `aberta` — é dívida de ROTEIRO de E2E (script `scripts/e2e-s06.sh`), não de produto; a Task 5
  desta fatia escreve um E2E NOVO (`scripts/e2e-s18.sh`) que não reusa esse trecho do S06, então corrigir o
  roteiro antigo não bloqueia nada desta fatia — custo se estiver errada: flakiness ocasional ao re-rodar o E2E
  da S06 isoladamente (não é rodado como gate desta fatia).
- Ruling: D-067 (o array `calls` do `MemoryListPublisher`, singleton em memória por processo, cresce sem limite)
  mantida `aberta` — é um FAKE de teste/E2E local ("aparato de teste/E2E local", comentário do próprio arquivo,
  `supabase/functions/_shared/publication/memory.ts`), nunca usado em produção real (só pipeline demo); capar o
  array quebraria as asserções existentes que dependem do histórico completo (`tests/publication/decide.test.ts`
  usa `calls[0]`, `calls.map(...)`, `calls` como contagem exata) — mudaria testes de comportamento sem necessidade
  real (o crescimento é limitado na prática pelo volume de envios demo, pequeno por desenho) — custo se estiver
  errada: uso de memória cresce devagar num processo Edge Function de vida muito longa com muitíssimos envios
  demo, cenário que não ocorre no piloto.
- Ruling: D-082 (sino de notificação ausente em `PanelShell`/`AdminShell`/`SchoolShell`) mantida `aberta`,
  terceira vez adiada (já revisitada e adiada nas S15 e S16 pelo mesmo motivo: mexeria em dezenas de páginas que
  usam essas três cascas, para uma dívida de severidade baixa) — nesta fatia as três cascas JÁ foram tocadas para
  skip-link/foco visível (ver Rulings acima), então o custo marginal de acrescentar o sino caiu, mas ainda exige
  uma consulta de contagem de não lidas plugada em cada casca (server-side, cache) e não é um ajuste de estados/
  a11y no sentido do prompt desta fatia — mantido fora do escopo, registrado para não se perder de vista: uma
  fatia futura de UX de notificação pode reaproveitar o mesmo `id="conteudo"`/`SkipLink` já presente nas três
  cascas como ponto de referência de onde entra o sino.
- Ruling: D-151 (sem índice navegável de listas publicadas para o admin arquivar; só por id direto) mantida
  `aberta` — corrigir de verdade exige uma tela nova (`/admin/listas`, com busca/paginação sobre potencialmente
  milhares de listas publicadas), não um ajuste pontual; é a única dívida S18 restante que pede uma FUNCIONALIDADE
  nova de admin, não um ajuste de estado/a11y ou um split de arquivo — desproporcional para severidade baixa
  dentro desta fatia — custo se estiver errada: o admin continua alcançando a lista só pela fila de denúncias (o
  único caminho de entrada hoje), sem índice de navegação direta.
- Ruling: D-091 (helpers de E2E duplicados em ~40 linhas por script) resolvida SÓ PARA A FRENTE — criado
  `scripts/e2e-lib.sh` (ab/sql/ok/bad/eq/has/lacks/expect_text/absent_text/wait_text/wait_ok/shot/login/
  clicktext), fonte a partir do padrão já usado nos scripts existentes (com o achado da S16 sobre `sleep 1` após
  `open` incorporado); `scripts/e2e-s18.sh` (Task 5 desta fatia) já nasce usando-o via `source`. Os 17 roteiros
  já executados (S06 a S27) NÃO foram retrofitados: cada um já rodou com sucesso para a própria fatia, nenhum é
  reexecutado em CI ou faz parte de um gate contínuo, e o risco de introduzir uma regressão mecânica ao editar um
  script arquivístico (17 arquivos) supera o ganho de legibilidade de uma dívida de severidade baixa — custo se
  estiver errada: continuar copiando o bloco de helpers em scripts futuros até alguém decidir migrar os antigos.
- Ruling: D-092 (`NotificationBell` sem atualização periódica) mantida `aberta` — a correção exigiria uma rota
  nova (`GET /api/notifications/unread-count`, autenticada, só leitura) e converter o componente (hoje Server
  Component puro, só usado em `app/conta/layout.tsx`) num Client Component com `useEffect`/polling de 60 s;
  moderado (2-3 arquivos + testes de rota e de componente), sem risco de segurança, mas o tempo desta fatia foi
  para D-057 (10 arquivos) e os demais itens de estados/a11y/dívida — custo se estiver errada: o contador de não
  lidas só atualiza ao navegar entre páginas, não em tempo real (o dado em si nunca é o errado).
- Achado do E2E da S18 (roteiro, não produto): o cenário de D-153 reabria a MESMA URL
  (`/admin/denuncias/[id]`) depois do clique em "Colocar em análise" para conferir que o `<select>` de resolução
  ficava habilitado — reabrir a URL idêntica é um no-op (o navegador/roteador não refaz a navegação), então a
  releitura via `eval` ainda via o DOM de antes do clique (`disabled: true`). Confirmado que era só do roteiro
  antes de "corrigir" qualquer coisa: `select status from reports` no banco já mostrava `reviewing`, e uma
  sessão nova/isolada, com login genuíno na mesma página, já mostrava `disabled === false`. Corrigido trocando a
  releitura por `location.reload()` (força um GET de verdade) em `scripts/e2e-s18.sh`. Candidato a lição para o
  PAT-002 do Segundo Cérebro (mesma classe dos achados de "wait_text"/checkbox de sessões anteriores: reabrir a
  MESMA URL não é reload) — custo se estiver errada: nenhum, é só o roteiro.
- Ruling: E2E final da S18 (`scripts/e2e-s18.sh`, build de produção local, porta 3003, banco `t3`): 18 PASS, 0
  FAIL, cobrindo D-034 (agrupamento por categoria), D-140 (link "Montar carrinho" com o id da versão publicada),
  foco visível/skip-link por teclado no `AdminShell` (novo nesta fatia) e D-153 (campos de resolução desabilitados
  com status `open`, habilitados após "Colocar em análise"), mais um passe axe-core (CDN, sem dependência nova)
  em 3 rotas sem violação séria/crítica. Os demais itens de D-057 (refatoração sem UI) e de dívida resolvida por
  texto/lógica sem tela própria (D-029, D-038, D-080, D-083, D-084, D-090, D-091, D-092) ficam cobertos pelos
  testes automatizados, não repetidos no E2E manual — custo se estiver errada: nenhuma tela nova ficaria sem
  cobertura de E2E (D-080/`PushOptIn` é melhor testado por mock de `pushManager` do que por agent-browser sem
  hardware de push real).

## Trilha Dados (consolidado de ledger-dados.md, D-048, S18)

> Movido de `docs/superpowers/ledger-dados.md` nesta fatia (D-048); conteúdo abaixo é o arquivo original,
> sem reescrever nenhuma frase (só o cabeçalho "## Trilha Dados" é novo, para navegação dentro deste arquivo).

# Ledger da trilha dados (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`. O orquestrador consolida em ledger.md na S11.


Ruling: S03 T1 — linha com INEP existente e dados idênticos vira `duplicate` com erro `already_up_to_date` (sem UPDATE, `updated_at` intacto) — o enum de ações só tem 4 valores e "updated" seria falso — custo se errada: contador "duplicadas" inclui reimportações sem mudança.
Ruling: S03 T1 — `import_apply_rows` serializa por advisory lock transacional e recalcula contadores do lote a partir de `import_rows` (idempotente por `(batch_id,row_number)`, retorno reflete o gravado) — evita corrida em `unique(inep)` e contadores divergentes num retry — custo se errada: imports concorrentes de lotes diferentes esperam um pelo outro.
Ruling: S03 T1 — a função aceita `raw` e `errors` opcionais por linha (erros de Zod do TypeScript viram `rejected` e são gravados) e revalida INEP/nome/rede/município no banco como defesa — custo se errada: regra duplicada em TS e SQL.
Ruling: S03 T2 — o serviço retoma lote existente com status `failed`/`pending` (o banco pula linhas já gravadas e devolve os totais reais) e devolve sem reprocessar lote `completed`/`processing`; `alreadyExisted` fica true em todos esses casos — evita reprocesso concorrente e permite recuperar falha parcial — custo se errada: lote preso em `processing` após queda dura do processo não é retomado automaticamente.
Ruling: S03 T2 — o CSV é decodificado e parseado inteiro (csv-parse/sync), mas normalização, `raw` e envio ao banco acontecem em fatias de até 500 linhas; `chunkSize` é limitado a 500 — arquivo de 25 MB cabe em memória e o payload por chamada fica pequeno — custo se errada: arquivos muito maiores exigem parse em streaming.
Ruling: S03 T2 — `getErrorRows` devolve só `rejected` e `duplicate` diferente de `already_up_to_date`; `errors` é lista aberta `{code, message}` (Zod sem enum de códigos) — alinhado ao aviso do orquestrador — custo se errada: código de erro novo aparece sem tradução na UI.
Ruling: S03 T2 — o repositório usa a porta `AdminGateway` (supabase-js em produção, `pg` como service_role nos testes de banco) — testa grants e funções reais sem depender da API HTTP local — custo se errada: a fina camada supabase-js (`supabase-gateway.ts`) só é exercitada no E2E da Task 3.
Ruling: S03 T1 rodada 1 — reimport de escola `claimed`/`verified`/`suspended` preserva `municipality_id`, `email` e `phone` e só atualiza identificação (name, normalized_name, network, address, neighborhood, cep), com aviso `municipality_change_ignored` em `errors` quando o município do arquivo difere; `registered` pode mudar de município habilitado (aviso `municipality_changed`); update/mover reexecuta a checagem nome normalizado + município (→ `duplicate_name_municipality`) — o INEP não pode sobrescrever dado que a escola ou a equipe já controla — custo se errada: escola verificada que realmente mudou de município exige correção manual.
Ruling: S03 T1 rodada 1 — isolamento demo/real: `v_demo = is_demo do lote OR is_demo da linha`; se diferir do `is_demo` da escola existente a linha é `rejected` com `demo_real_conflict` (nunca atualiza) e lote demo nunca cria escola real — demonstração nunca contamina dado real e vice-versa — custo se errada: reimportar arquivo real sobre escola demo exige apagar a demo antes.
Ruling: S03 T1 rodada 1 — "sem alteração" continua gravado como `duplicate` + `already_up_to_date` (enum fixo) mas é contado em `import_batches.unchanged_count` / chave `unchanged` e sai de `duplicate` — reimportação idêntica não parece problema — custo se errada: consumidores que somavam `duplicate` para "sem alteração" precisam ler `unchanged`.
Ruling: S03 T1 rodada 1 — `import_apply_rows` aceita no máximo 1000 linhas/chamada, rejeita lote `completed` (22023), rejeita campos acima de 300 caracteres (`field_too_long`), guarda em `normalized` só as chaves da whitelist e usa advisory lock de duas chaves constantes (101, 1) — limita abuso e colisão de lock — custo se errada: lotes maiores exigem novo fatiamento.
Ruling: S03 T3 — casca `AdminShell` (barra lateral + conteúdo) só nas páginas de importações, com apenas os links que existem (Visão geral, Importações); `app/admin/page.tsx` ganha só um link — o admin completo é de fatia posterior — custo se errada: refatorar a casca quando o admin ganhar mais telas.
Ruling: S03 T3 — Server Action e Route Handler exigem `getCurrentRole() === 'admin'` (papel em `profiles`) e usam a chave secreta só no servidor via `supabase-gateway`; o relatório de erros usa `;`, BOM e neutraliza `= + - @ \t \r` com prefixo `'` (inclusive mensagens) — custo se errada: valores legítimos que começam com `-` aparecem com apóstrofo.
Ruling: S03 T3 — E2E injeta o arquivo via `DataTransfer` no `eval`, pois `agent-browser upload` congelou a aba no submit (o servidor nunca recebeu a requisição) — custo se errada: o caminho do seletor de arquivo real não é exercitado pelo agent-browser.
Ruling: S03 T2 rodada 2 — claim atômico do lote: `import_claim_batch` devolve `owner`; lote novo nasce `processing`; só `pending`/`failed` (mesma natureza demo/real) ou `processing` com `updated_at` > 10 min viram do chamador; `import_apply_rows` renova `updated_at` (heartbeat) e `finishBatch` só troca status/finished_at `where status <> 'completed'`, sem regravar contadores — dois uploads simultâneos do mesmo arquivo nunca processam em dobro nem um lote preso trava para sempre — custo se errada: lote realmente lento (>10 min sem chunk) pode ser retomado por outro upload (as linhas já gravadas são puladas, então só há trabalho repetido).
Ruling: S03 T2 rodada 2 — `import_rows.unchanged boolean` + check (`not unchanged or action = 'duplicate'`) substitui o predicado JSON `already_up_to_date` em contadores, filtro de erros e MemoryRepo — filtro indexável e sem depender do texto do erro — custo se errada: coluna extra em tabela de linhas.
Ruling: S03 T2 rodada 2 — dedupe nome+município é isolado por `is_demo` (demo e real com o mesmo nome coexistem); `raw`/`normalized`/`errors` têm teto por linha (20 000 caracteres; `errors` acima de 20 itens vira um erro genérico; `raw` vira `{"truncated": true}`) e o serviço trunca cada célula de `raw` em 1000 caracteres — importação não infla o banco com lixo — custo se errada: diagnóstico de linha gigante perde o raw.
Ruling: S03 T2 rodada 2 — codificação: fallback é Windows-1252 (não latin1); CSV com mojibake (`Ã§`, `â€`) ou byte indefinido (C1/U+FFFD) é `encoding_ambiguous` e falha o arquivo; `max_record_size` 64 KB; `row_number` é a linha do arquivo (cabeçalho = 1, fim do registro multilinha) — evita gravar nome corrompido e permite achar a linha no Excel — custo se errada: arquivo legítimo com esses caracteres é recusado até ser reexportado.
Ruling: S03 T2 rodada 2 — mesmo hash com `is_demo` diferente do lote gravado não reprocessa: devolve o lote existente com `demo_flag_mismatch` (a Server Action mostra erro); `ImportResult.resumed` indica retomada; `countSchools` devolve real e demo separados e a UI exibe as duas contagens e "Linhas com aviso" no detalhe do lote — nada de demonstração passando por real — custo se errada: reenviar o arquivo com outra marcação exige alterar o conteúdo.
Ruling: S03 T2 rodada 2 — fixture demo usa INEPs 9900100x (fora da faixa de INEP reais de MT, 51xxxxxx) — custo se errada: nenhum.
Ruling: S03 onda final — limite real do upload web é 4 MB: `experimental.serverActions.bodySizeLimit = '4mb'` (o padrão do Next é 1 MB e derrubava arquivos acima disso antes da action rodar), `MAX_UPLOAD_BYTES = 4_000_000` (4 MB decimais, sobra sob 4 MiB para o multipart) e a UI/Server Action dizem "4 MB"; o tamanho é checado no cliente e na action antes de ler o arquivo. Arquivos maiores (CSV oficial do INEP, S20) entram pelo script `pnpm import:inep <arquivo.csv> [--demo]` (mesmo `importInepFile` com o gateway admin; `SUPABASE_SECRET_KEY` e `NEXT_PUBLIC_SUPABASE_URL` do ambiente; recusa qualquer alvo que não seja loopback ou o ref de staging sem `--i-know-this-is-production`; `server-only` é neutralizado por `--conditions=react-server`) — custo se errada: arquivos entre 4 MB e o teto antigo de 25 MB deixam de subir pela tela.
Ruling: S03 onda final — exceção à regra "orquestrador instala dependências": `tsx` entrou como devDependency nesta onda (única forma de rodar o script TypeScript com o alias `@/` e sem build); `esbuild` marcado `false` em `allowBuilds` (o binário vem do pacote de plataforma, sem script de instalação) — custo se errada: remover `tsx` e reescrever o script em `.mjs`.
Ruling: S03 onda final — limite de tempo: `maxDuration = 60` na página de importações (a Server Action de upload herda) e na rota `erros.csv`; o processamento é síncrono e em fatias de 500 linhas, sem `after()`/fila — 4 MB cabem folgados em 60 s; se a plataforma cortar no meio, o lote fica `processing` e é retomável após 10 min (claim "stale") ou vira `failed` e é retomado pelo botão "Tentar novamente" — custo se errada: uploads perto de 4 MB em banco lento podem exigir `after()` ou o script.
Ruling: S03 onda final — erros do arquivo persistem em `import_batches.file_errors jsonb` (gravado ao fechar o lote como `failed`, limpo ao retomar/concluir), aparecem no detalhe do lote e como linhas "Arquivo" no `erros.csv`; a mensagem `processing_failed` não ecoa o erro técnico — o resultado sobrevive ao recarregamento e nada do banco vaza para a tela — custo se errada: diagnóstico técnico só nos logs do servidor.
Ruling: S03 onda final — o formulário de upload não usa `action={...}` (React 19 zera o formulário ao fim da action e o retry perdia o arquivo): o submit é interceptado, o `File` e a marcação demo ficam em memória e tanto o envio quanto "Tentar novamente" chamam `startTransition(() => formAction(FormData))` — retry funciona sem reselecionar — custo se errada: sem JS o formulário não envia (tela de admin interna, aceitável).
Ruling: S04 T1 — `search_schools` normaliza só acento/caixa/pontuação (unaccent + `[^a-z0-9]`); a expansão de abreviações (`emeb`, `prof.`) é da aplicação (`normalizeName`, Task 2), que deve passar a consulta já normalizada; sem a expansão, a função ainda casa prefixos por `word_similarity` — custo se errada: abreviações raras não casam até a app expandir.
Ruling: S04 T1 — `q`/bairro informados mas com menos de 2 caracteres após normalização (`%`, `_`, espaços) retornam zero linhas (nunca "listar tudo"); `q` nulo lista por filtros — custo se errada: consulta de 1 letra não devolve nada (a UI já exige 2+).
Ruling: S04 T1 — extensão `unaccent` (schema `extensions`) adicionada com wrapper IMMUTABLE `public.immutable_unaccent` para indexar bairro; helpers com EXECUTE para anon/authenticated/service_role (inofensivos, puros) — custo se errada: revogar o EXECUTE dos helpers.
Ruling: S04 T2 — `parseSearchParams` nunca lança: arrays valem pelo primeiro item, `q`/`bairro` são cortados em 100 caracteres, vazio (`q=`) vira null (lista por filtros) e texto com <2 caracteres normalizados vira `q: null` + `qTooShort` (a busca devolve vazio, nunca "tudo"); a consulta ao banco é SEMPRE `normalizeName(q)` — custo se errada: consulta de 1 letra não devolve nada.
Ruling: S04 T2 — `pagina > 1` com 0 linhas devolve `{kind: "page_out_of_range"}` (o rpc não dá total além do fim); a UI trata como página inválida (redireciona à página 1) e não como "nenhuma escola" — custo se errada: uma página vazia legítima no meio não existe (o total é contínuo), sem custo real.
Ruling: S04 T2 — consultas usam `lib/supabase/public.ts` (chave publicável, sem sessão, `server-only`) e o repositório seleciona colunas explícitas (sem e-mail/CEP); o `grant select on schools to anon` da S03 é de tabela inteira, então o e-mail só fica protegido por não ser pedido — custo se errada: um grant por coluna (ou view pública) reforçaria a barreira num ajuste futuro de migration.
Ruling: S04 T2 — SEO: indexável só `claimed`/`verified` não demo; `suspended` também não segue links; busca indexável só na página 1 sem filtros (canonical `/escolas`); município padrão = primeiro habilitado por nome (consulta sob RLS, sem hardcode) — custo se errada: com vários municípios habilitados a busca sem `municipio` fica restrita ao primeiro.
Ruling: S04 T1 rodada 1 — privacidade: `revoke select on public.schools from anon, authenticated` + `grant select (id, inep, name, normalized_name, network, neighborhood, address, cep, phone, municipality_id, verification_status, registry_source, is_demo, created_at, updated_at)` na 0102 (a 0101 já está no staging/main e não é editada); sem `email` e sem `source_batch_id`; `select *` por anon/authenticated dá 42501; RLS e grants de escrita intactos; service_role (gateway admin da S03) e `search_schools` (INVOKER, só colunas seguras) seguem funcionando — custo se errada: leitura de e-mail por um authenticated (ex.: papel admin via API) exige passar pelo servidor com a chave secreta.
Ruling: S04 T1 rodada 1 — plano sob RLS: `explain (analyze)` de `search_schools('escola teste 1a2b')` como `anon` com 5.000 escolas, sem `enable_seqscan=off`, dá Function Scan de ~66 ms; a consulta interna cai em Seq Scan (~41 ms) porque os operadores `%`/`<%` do pg_trgm não são leakproof e o planner avalia a política (`municipality_id in municípios habilitados`) antes do filtro trigram. Mantém INVOKER (a RLS precisa decidir as linhas). Aceito na escala do piloto (Cuiabá, milhares de escolas); reavaliar antes de escala nacional (~200 mil): view materializada pública (só município habilitado, colunas seguras, com o GIN) ou wrapper leakproof. O teste de plano sem promessa de tempo agora se chama "índice trigram é utilizável" (planner forçado) — custo se errada: busca pública O(n) na tabela inteira em escala nacional.
Ruling: S04 T1 rodada 1 — normalização do bairro usa `public.search_normalize` nos dois lados (índice GIN e consulta: `left(...,100)` na entrada, unaccent antes do regexp, `[^a-z0-9]`), sem depender de locale nem de classe `[:alnum:]`; helpers com EXECUTE para anon/authenticated/service_role e `public` sem EXECUTE (comentário da migration corrigido) — custo se errada: trocar a expressão do índice exige recriá-lo.
Nota S04 T1 — custo do GIN em importações em massa: os dois índices GIN trigram (nome e bairro) encarecem INSERT/UPDATE de `schools`; para cargas grandes (CSV nacional, S20) considerar `drop index`/recriar ou `fastupdate` do GIN após a carga; no piloto (milhares de linhas) o custo é desprezível.
Ruling: S04 T3 — home `/` é a App03 em versão pública mobile: busca primeiro, chips de rede (links) e atalhos (todas as escolas, conta); sem bloco "escolas em destaque" e sem contagens (não há fonte confiável nesta fatia; um destaque de escolas verificadas pode entrar depois) — custo se errada: adicionar uma consulta `listFeaturedSchools` e um bloco.
Ruling: S04 T3 — perfil segue App14 (cabeçalho escuro) e não a App10 (visão administrativa da escola); "Listas disponíveis" vira o seletor série/ano + bloco "lista não publicada" (a S05 troca o bloco por dados reais) — custo se errada: ajustar o layout do bloco na S05.
Ruling: S04 T3 — seletor série/ano é um `<form method="get">` (funciona sem JS; `<noscript>` traz o botão) e, com JS, `history.replaceState` atualiza `?serie=&ano=` sem chamada de rede; o texto da seleção vive no próprio Client Component, porque o servidor não re-renderiza com `replaceState` — custo se errada: quando a S05 trouxer listas reais, trocar por `router.replace` (uma ida ao servidor por seleção).
Ruling: S04 T3 (corrigida na onda final) — o `loading.tsx` do perfil (`app/escolas/[inep]/loading.tsx`) foi REMOVIDO: era um esqueleto enganoso. Diagnóstico corrigido: o Next 16 faz streaming de página dinâmica sempre; o 404 HTTP real de `notFound()` exige remover TAMBÉM o `app/loading.tsx` raiz e os loadings de `/escolas` (o raiz envolve toda a árvore em Suspense e o status 200 já foi enviado). Nesta onda só o do perfil saiu; na prática `/escolas/[inep]` inexistente ainda responde 200 com `noindex` enquanto os outros existirem — custo se errada: página "não encontrada" indexável por engano (mitigado pelo `noindex`). **[resolvido em chore/soft-404: loadings raiz, de /escolas e de /entrar removidos; os de leads e importações foram para route groups (lista); 404 real provado em docs/superpowers/e2e/soft-404.md]**
Dívida S04: correção estrutural do loading (loading por área + route group da busca, sem `app/loading.tsx` raiz) = PR `chore/` do orquestrador depois desta fatia — custo se não feita: 404/redirect com HTTP 200 em `/escolas*`. **[resolvido em chore/soft-404: loadings raiz, de /escolas e de /entrar removidos; os de leads e importações foram para route groups (lista); 404 real provado em docs/superpowers/e2e/soft-404.md]**
Ruling: S04 onda final — ano letivo padrão do seletor: a partir de agosto (mês 8, fuso America/Cuiaba, não UTC) pré-seleciona o ano seguinte; antes disso o corrente. `academicYears`/`defaultAcademicYear` derivam do fuso de Cuiabá (virada 31/12 23:30 em Cuiabá ainda é o ano velho); URL válida continua prevalecendo — custo se errada: trocar `DEFAULT_YEAR_CUTOFF_MONTH` (uma constante).
Ruling: S04 onda final — aviso de perfil suspenso e de demonstração ficam logo abaixo do cabeçalho (primeira dobra, `ProfileNotices`); `ClaimBlock` some para escola `isDemo` (não há administrador a reivindicar em dado fictício) — custo se errada: reexibir o CTA de demo.
Ruling: S04 onda final — cores de estado (aviso, erro, demo, tracejado) viraram tokens em `app/globals.css` e `stateColors` em `lib/brand/tokens.ts`, com teste de drift e teste de "sem hex solto" em `components/schools` — custo se errada: nenhum.
Ruling: S04 onda final — `siteBase()` devolve null quando há `VERCEL_ENV` e `getSiteOrigin` lança: omite `metadataBase` e o `url` do JSON-LD (nunca publica localhost em deploy); fora de deploy mantém localhost (E2E local) — custo se errada: canonical relativo sem base em deploy mal configurado.
Ruling: S04 onda final — busca por bairro na UI: campo opcional "Bairro" no `<form method="get">` de `/escolas` (sem JS funciona); `bairro` deixou de ser hidden — custo se errada: voltar ao hidden.
Nota S06 (e-mail da escola): ler `schools.email` só no servidor com service role ou com `.select` de colunas explícitas — desde a 0102 `anon`/`authenticated` têm grant por coluna sem `email`, então `select *` falha com 42501.
Nota S06 (App14b): para escola `verified` a reivindicação deve mostrar o estado 2 do App14b ("já tem administrador · Pedir acesso"), e não o formulário de primeira reivindicação; hoje `ClaimBlock` só tem o texto de aviso.
Ruling: S04 T3 — origem de canonical/JSON-LD por `lib/site-base.ts` (usa `getSiteOrigin`, cai em localhost sem lançar); `metadataBase` no layout raiz — custo se errada: sem `NEXT_PUBLIC_SITE_URL` em produção os canonicals apontam para localhost (o `.env.example` já exige a variável).
Ruling: S04 T3 — `error.tsx` faz `router.refresh()` + `reset()` (só `reset()` não refaz a consulta do Server Component); mensagem fixa e log só com `code` — custo se errada: retry não recuperaria após a queda do banco.
Ruling: S04 T3 — selo `verified` = "Escola verificada" (SPEC §4); selo Demonstração em amarelo (legível no cabeçalho escuro e nos cards); `buildSchoolJsonLd` devolve null para escola demo/não indexável e a descrição/título de demo mencionam "Demonstração"; `noindex` em `/escolas` com qualquer parâmetro cru de busca (`hasRawParams`) — custo se errada: ajustar `isIndexableSchool`/`isFilteredSearch`.
Ruling: S05 T1 — `list_publish_version` aceita lista `approved` (primeira publicação) ou `published` (troca da versão atual por uma candidata nova; a antiga vira `superseded`); qualquer outro estado dá 23514. Sem isso o reenvio de lista publicada (que mantém a versão antiga visível) nunca poderia publicar, já que a matriz não tem `published -> approved` — custo se errada: exigir aprovação da lista para trocar versão obrigaria uma transição extra na matriz.
Ruling: S05 T1 — `list_transition` cobre toda a matriz, exceto `-> published` (22023, "use list_publish_version": exige a versão) e delega `published -> archived` a `list_archive`. O teste 10x10 distingue par inválido (23514) de par válido que exige a função própria (22023); a matriz TS (Task 2) compara igual — custo se errada: expor uma segunda porta de publicação.
Ruling: S05 T1 — `p_actor_id` obrigatório (22023) em `approved`, `rejected` e `list_publish_version`; opcional em `list_archive` e demais estados (o brief lista só os três); o par inválido tem precedência sobre o ator ausente — custo se errada: exigir ator no arquivamento (uma linha).
Ruling: S05 T1 — privacidade por coluna (padrão da 0102): anon/authenticated não leem `alerts`/`confidence` de itens nem `submission_id`/`created_by`/`source` de versões; `select *` em list_items dá 42501; admin lê esses campos só pelo servidor (service role) — custo se errada: liberar colunas ao admin autenticado exige policy/grant novo.
Ruling: S05 T1 — escrita: service_role só insere rascunho (`school_id, grade_id, school_year, is_demo`) e altera itens (gatilho só deixa versão `candidate`); estado, versão atual, versões e eventos só pelas funções (grants por coluna, sem UPDATE/DELETE) — custo se errada: o repositório da Task 2 não pode atualizar metadados da lista sem nova função.
Ruling: S05 T1 — `current_version_id` consistente por FK composta `(current_version_id, id) -> list_versions(id, list_id)` deferrable + check `(status='published') = (current_version_id is not null)` + constraint trigger deferred exigindo a versão `published`; a verificação roda no commit (testes usam `set constraints all immediate`) — custo se errada: erro só aparece no fim da transação.
Ruling: S05 T1 — `list_status_events.actor_id` sem FK (histórico sobrevive ao perfil) e `created_at` com `clock_timestamp()` (ordem dentro da transação); versões numeradas por lock `for no key update` da lista — custo se errada: FK depois exige tratar remoção de perfil.
Ruling: S05 T2 — consulta pública (`features/lists/queries.ts`) usa só o cliente publicável, com colunas explícitas e Zod que descarta qualquer coluna interna; `getPublishedList`/`listVersionHistory` aceitam `{client}` injetável e devolvem `null`/`[]` para escola, série ou ano inexistentes (nunca lançam por "não achei") — custo se errada: a página trataria erro de banco e "não publicada" igual (hoje erro de banco lança).
Ruling: S05 T2 — repositório de escrita (`features/lists/repository.ts`) é injetável por cliente service role (`createListsRepository(client)`), exige `actorId` uuid em toda mudança de estado, valida itens com Zod antes do banco (quantidade "12,5" vira 12.5; "12,5x", 0, negativa e >2 casas são recusadas; nome normalizado derivado sem acento/ordinais), aplica `assertTransition` no TS antes do RPC e recusa `-> published` em `transition` (só `publishVersion`) — custo se errada: uma porta de publicação a mais.
Ruling: S05 T2 — testes de repositório fazem commit real e limpam por INEP (`cleanupCommitted`); como `profiles` dos usuários de teste só existem dentro de transações, `createdBy` fica nulo nesses testes (actor_id não tem FK) — custo se errada: nenhum.
Ruling: S05 rodada de correções — aprovação ligada à versão: `list_versions.approved_by/approved_at` (par, sem FK), `list_approve_version` (só candidate da própria lista, ator obrigatório) e `list_publish_version` exige versão aprovada e `item_count > 0` (23514); published/superseded exigem aprovação por check; approved_* imutáveis pelo guard; `list_transition -> approved` segue valendo para a lista — custo se errada: um passo a mais (approveVersion) no fluxo das portas S09-S11.
Ruling: S05 rodada de correções — troca de versão numa lista já `published` grava evento com `from_status = null` e reason "troca de versão" (a coluna já era anulável), sem o par inválido published -> published — custo se errada: consumidores do histórico precisam tratar from_status nulo.
Ruling: S05 rodada de correções — `list_items_guard` usa `for no key update` (era `for share`, que dava deadlock 40P01 em dois escritores multilinha: ambos seguravam share e ambos esperavam o update de item_count); continua conflitando com o `for update` da publicação. `list_transition_allowed` deixou de ser SECURITY DEFINER (função pura; o teste de `prosecdef` tem exceção comentada) — custo se errada: nenhum.
Dívida S05: `list_items_sync_count` recalcula count(*) por linha (O(n²) em inserts grandes) e `list_status_events` não passa por audit_row_change; aceitos no piloto (listas com dezenas de itens) — custo se não tratada: cargas de milhares de itens ficam lentas; revisar na S20.
Ruling: S05 T3 — a página `/escolas/[inep]/[serie]?ano=` devolve 404 (notFound) para INEP inexistente, série fora do catálogo ou `ano` presente e inválido; lista não publicada (inexistente, aprovada, arquivada) é a própria página com o estado "lista não publicada" (200 e `noindex`), como no perfil — custo se errada: tratar "não publicada" como 404 é uma linha (`notFound()` no lugar do `UnpublishedState`).
Ruling: S05 T3 — sem `app/escolas/[inep]/[serie]/loading.tsx` (o brief o listava): evita agravar a dívida do 404 com status 200; `not-found.tsx` e `error.tsx` criados — custo se errada: esqueleto de carregamento a mais. **[resolvido em chore/soft-404: loadings raiz, de /escolas e de /entrar removidos; os de leads e importações foram para route groups (lista); 404 real provado em docs/superpowers/e2e/soft-404.md]**
Ruling: S05 T3 — a página da lista é sempre `noindex, follow` nesta fatia (listas ainda são demo); o título traz "(Demonstração)" — custo se errada: liberar `index` para lista real de escola indexável (uma condição em `generateMetadata`).
Ruling: S05 T3 — `GradeYearPicker` passou de `history.replaceState` para `router.replace` (uma ida ao servidor por seleção) para mostrar o estado real da lista (publicada com versão/itens + link "Ver lista", ou não publicada), como previsto na Ruling S04 T3 — custo se errada: voltar ao replaceState e perder o estado real no perfil.
Ruling: S05 T3 — da App05 só entram o que tem fonte: cabeçalho, chips (itens, versão, data), itens e histórico; checkboxes "já tenho", "lojas", preço e "Montar carrinho" ficam de fora (S12 e sem fonte de preço: texto "indisponível"); status "Validada pela escola" não é usado, pois publicar não é validação da escola (texto "Lista publicada") — custo se errada: adicionar os blocos quando S12 ligar a lista ao carrinho.
Ruling: S05 T3 — `seed:demo-lists` cria 3 listas demo no ano letivo padrão (publicada v1; publicada v2 sobre v1; aprovada não pública), idempotente por escola/série/ano (existente é ignorada, nunca atualizada), ator fixo `DEMO_ACTOR_ID`, mesmo guard de alvo do `import:inep` — custo se errada: mudar o plano em `scripts/seed-demo-lists-lib.ts`.
Ruling: S05 correção final — `GradeYearPicker` só mostra `published`/"indisponível" quando a seleção local é a que veio do servidor; caso contrário "Consultando…" (`useTransition`); falha de `getPublishedList` no perfil vira "lista indisponível" no bloco, sem derrubar o perfil — custo se errada: nenhum.
Ruling: S05 correção final — `seed:demo-lists` perdeu a flag de produção (só loopback ou staging `hojbnqkwzsicahzgshne`); lista existente é conferida (status e nº de versões do plano) e diverge = erro claro, não "já existia" — custo se errada: exige apagar a lista demo divergente à mão.
Ruling: S05 correção final — `listVersionHistory` aceita `{listId}` (da lista já lida por `getPublishedList`), evitando reconsultas; `formatQuantity(null, unidade)` = "não informada" (unidade sem quantidade não é dado).
Dívida S05: página da lista e perfil sempre `noindex`; liberar indexação de lista de escola `claimed|verified` (não demo) quando houver lista real — custo se não tratada: sem tráfego orgânico das listas.
Dívida S05: itens não são agrupados por categoria (a App05 agrupa; hoje lista plana com a categoria em cada item) — custo se não tratada: divergência visual com a tela de referência.
Dívida S05: `addItems` concorrente na mesma versão pode falhar com 23505 (posição duplicada); o repositório propaga como erro e o chamador deve repetir/serializar — documentar no fluxo de importação (S09-S11).
Ruling: S06 plano — aprovação de reivindicação é sempre humana (admin); token de e-mail/WhatsApp confirmado é evidência (`channel_confirmed_at`), não decisão, e aprovar por token exige canal confirmado, por documentos exige ≥1 arquivo — SPEC: cadastro INEP não é verificação e reivindicação não é verificação; evita decisão automatizada sem `ai_decisions` — custo se errada: fila manual mais lenta; ligar aprovação automática depois exige registro em `ai_decisions`.
Ruling: S06 plano — token vai só ao contato registrado no INEP (`schools.email`; `schools.phone` se celular BR), nunca a endereço/número digitado; sem verificação por domínio de e-mail; o contato nunca é exibido, nem mascarado — e-mails do INEP costumam ser de provedores genéricos (domínio não prova nada) e o e-mail da escola é privado desde a 0102 — custo se errada: escola com contato desatualizado no INEP só consegue por documentos.
Ruling: S06 plano — máquina de estados por ator (`claimant`, `admin`, `system`), 6×6×3 triplas em `features/claims/state.ts` e em `claim_transition_allowed`, comparadas por teste; `approved`/`rejected` terminais e "reivindicar de novo" cria nova reivindicação; `insufficient_evidence` entra na fila do Admin04 como "Pedir mais evidências" — o spec traz o estado e a tela só tem aprovar/recusar — custo se errada: ajustar a matriz nos dois lados e o teste.
Ruling: S06 plano — `claimed` = escola com ≥1 reivindicação em `awaiting_verification|insufficient_evidence|token_expired` (volta a `registered` quando não resta nenhuma); `verified` só pela aprovação; gatilho `schools_guard_verification` só deixa pôr/tirar `claimed`/`verified` com `current_user` dono (funções SECURITY DEFINER/migrations), bloqueando admin via PostgREST e `service_role` direto; `suspended` fica livre para S16 — custo se errada: selo "reivindicada" aparece por pedidos que depois são recusados (transitório).
Ruling: S06 plano — ao aprovar, as demais reivindicações abertas da escola viram `rejected` (ator `system`, `decision_code = school_verified_by_other_claim`) e escola `verified`/`suspended` recusa nova reivindicação; App14b estado 2 mostra o texto sem botão "Pedir acesso" — convites de co-admin (Escola05/Escola06) não estão no prompt da S06 — custo se errada: colega legítimo precisa esperar o fluxo de convite.
Ruling: S06 plano — telas adiadas: Escola04 (indicadores sem fonte), Escola05/Escola06 (convites), Escola12 (rede); Escola01 perde o passo "Endereço/CEP" (reivindicação não edita dado do INEP) e ganha o passo "Método"; `/escola` vira a Escola03 — custo se errada: uma fatia posterior (S15/S16) monta essas telas sobre `school_members`.
Ruling: S06 plano — `school_members` (owner único por escola; `co_admin` reservado) nasce na 0104 como o vínculo escola↔administrador que a S05 adiou; aprovação promove `parent → school_member`; só `parent` e `school_member` reivindicam (admin, `stationery_member` e `system` não) — custo se errada: liberar outro papel é uma linha na função e no TS.
Ruling: S06 plano — rotas do reivindicante em `/escolas/[inep]/reivindicar` (o link do `ClaimBlock` já existe) e `/escolas/[inep]/reivindicar/confirmar`, com sessão exigida na página/action, sem editar `features/auth/access.ts` (mesmo padrão do `/cadastrar-papelaria` da S13); link do e-mail não consome no GET (botão + Server Action) por causa de scanners — custo se errada: mover rotas exige atualizar o link do e-mail.
Ruling: S06 plano — entrega de token atrás da porta `ClaimTokenSender`; sem provedor real nesta fatia, e-mail/WhatsApp aparecem "indisponível no momento" em ambientes implantados; sender de console só com `DEMO_CLAIM_DELIVERY=1` + `APP_ENV` local/development + escola demo; provedor de e-mail na S11, WhatsApp depende de credencial do humano (PROGRESS) — custo se errada: fluxo por token só testado localmente até a S11.
Ruling: S06 plano — evidências no bucket privado `claim-evidence` (PDF/JPEG/PNG, 4 MB por arquivo pelo limite da Server Action, um por requisição, até 5), upload e leitura só pelo servidor com service role, sem política em `storage.objects` para `authenticated`; admin abre por URL assinada de 60 s; retenção é da S17 — custo se errada: documentos grandes precisam de upload assinado direto ao Storage.
Ruling: S06 plano — expiração de token preguiçosa (`claim_expire_tokens` chamada ao abrir status, fila e antes de confirmar), sem cron nesta fatia; tokens: e-mail 24 h, WhatsApp 15 min, 5 tentativas, 60 s entre emissões, 5 por 24 h; uma aberta por escola×usuário e até 3 abertas por usuário — custo se errada: `token_expired` só aparece quando alguém olha (sem efeito externo).
Ruling: S06 plano — dados do reivindicante: nome e cargo digitados + `contact_email` copiado da sessão (não digitado), fora do `audit_log`; aceite de privacidade em `claims.privacy_ack_at/privacy_text_version` (não usa `consents` da Pipeline, ADR-004); reivindicante vê o motivo da decisão mas não `decided_by`/`actor_id` (grant por coluna) — custo se errada: migrar para `consents` na S17.
Ruling: S06 plano — `ClaimBlock` volta a aparecer para escola demo (revoga essa parte da Ruling S04 onda final) e a reivindicação herda `is_demo` da escola, para o E2E do PLAN rodar com dado demonstrativo; `seed:demo-claims` nunca aprova — custo se errada: testadores reivindicam escolas demo no staging (inofensivo, marcado demo).
Ruling: S06 plano — `SessionActor` ganha cópia em `features/auth/actor.ts` (mesma implementação de marca) em vez de importar `features/stationeries/actor.ts` da trilha Comércio (ADR-004); a unificação (stationeries reexportando de auth) fica para a S11 — custo se errada: duas cópias idênticas até lá.
Ruling: S06 plano — textos sem prazo ("[prazo]" da Escola02 some) e sem "avisamos por e-mail" antes da S11 ("acompanhe o status nesta página"); a Escola01 diz "encontrada no cadastro do INEP", nunca "confirmada" — nada inventado e INEP não é verificação — custo se errada: ajustar textos quando a S11 ligar notificações.
Dívida S06: exclusão/retenção de evidências e tokens (S17); cron de expiração (S11/S17); convites de co-admin e telas Escola04/05/06/12; unificação do `SessionActor` (S11).
Ruling: S06 T1 — errcodes das funções de reivindicação: 23514 regra/estado (mensagem estável), 42501 papel/ator errado, 22023 argumento inválido, P0002 não encontrado; `claim_confirm_token` nunca levanta por token errado (devolve `confirmed|expired|invalid|locked|already_confirmed`, senão a tentativa errada seria desfeita pelo rollback) — custo se errada: o repositório da Task 2 mapearia exceções em vez de texto.
Ruling: S06 T1 — o gatilho `schools_guard_verification` só age quando `verification_status` muda (INSERT com claimed/verified, ou UPDATE que entra/sai de claimed/verified) e só deixa `current_user in (postgres, supabase_admin)`; edição de outros campos de escola verified/claimed e a importação INEP seguem livres; `verified -> suspended` por admin também fica bloqueado (a S16 precisa de uma função de suspensão) — custo se errada: mudar o gatilho para aceitar `verified -> suspended` é uma condição.
Ruling: S06 T1 — testes que semeavam `claimed`/`verified` como service_role (imports.test.ts) passam a usar o helper `asOwner` (superuser dentro da transação), sem afrouxar o gatilho — custo se errada: nenhum.
Ruling: S06 T1 — `claim_submit_for_review` ganhou 3º parâmetro opcional `p_evidence_note` (o brief traz 2): é a única forma de "evidence_note alterada" contar como novidade no reenvio de `insufficient_evidence` (nenhuma outra função edita a nota) — custo se errada: remover o parâmetro e exigir só evidência nova.
Ruling: S06 T1 — travas sempre escola -> reivindicação (`claim_lock`); `claim_create` toma antes um advisory lock por reivindicante (limite de 3 abertas sem corrida entre escolas) que `claim_decide` não usa (sem ciclo) — custo se errada: dois creates paralelos do mesmo usuário em escolas diferentes poderiam passar de 3.
Ruling: S06 T1 — `claim_evidence.created_at` e `decided_at` usam `clock_timestamp()` (a "novidade" do reenvio vale dentro da mesma transação); `claim_tokens` usa `now()` (intervalos de 60 s e 5/24 h testados recuando `created_at`) — custo se errada: nenhum.
Ruling: S06 T1 — `claims.contact_email` é `not null` (3 a 254): usuário sem e-mail na sessão não reivindica nesta fatia — custo se errada: tornar nulo e a fila mostrar "sem e-mail".
Ruling: S06 T1 — WhatsApp sem `p_claim_id` em `claim_confirm_token` devolve `invalid` (não levanta); o hash do código é `sha256("<claim_id>:<código>")` e nunca é procurado sem a reivindicação — custo se errada: nenhum.
Ruling: S06 T1 revisão — teto de emissão de token também por escola: 10 nas últimas 24 h somando todas as reivindicações da escola (sob a trava da escola de `claim_lock`), 23514 "limite de 10 tokens em 24 horas para esta escola"; não há reemissão idempotente a excluir (hash repetido dá 23505) — contas descartáveis na mesma escola multiplicariam mensagens ao contato oficial e palpites de código — custo se errada: escola legítima com muita disputa espera a janela de 24 h (o admin ainda decide por documentos).
Ruling: S06 T1 revisão — `claim_expire_tokens` filtra na própria query só as candidatas com o último token vencido e ordena por (school_id, id), a mesma ordem de trava escola -> reivindicação: varreduras concorrentes não dão 40P01 e não esperam por escolas sem token vencido — custo se errada: nenhum.
Ruling: S06 T1 revisão — `claim_apply` limpa `decided_at`/`decided_by`/`decision_reason`/`decision_code` ao voltar a `awaiting_verification`, e aprovar grava o motivo da aprovação (nulo se não houver) em vez de manter o de `insufficient_evidence` — motivo velho enganaria o reivindicante e a fila — custo se errada: nenhum.
Ruling: S06 T1 revisão — `claim_create` perdeu o parâmetro `p_contact_email` (agora 7 argumentos): o e-mail vem de `auth.users` dentro da função, validado (formato básico, ≤ 254), senão 23514 "e-mail da conta ausente ou inválido"; a Task 2 chama sem e-mail — parâmetro digitável permitiria falsear o snapshot — custo se errada: voltar o parâmetro exige nova migration.
Ruling: S06 T1 revisão — depois de criada, `claim_submit_for_review`, `claim_issue_token` e `claim_add_evidence` recusam (23514) escola `suspended` ou município desabilitado via `claim_assert_school_open`; `claim_decide` não usa (o admin deve poder recusar) e `claim_remove_evidence` também não — custo se errada: reivindicante espera a S16 reabrir a escola.
Ruling: S06 T1 revisão — o gatilho `schools_guard_verification` também bloqueia `claimed|verified -> suspended` por admin/service_role; a S16 precisa de uma função de suspensão (SECURITY DEFINER do dono). Funções SECURITY DEFINER futuras que escrevam `schools.verification_status` passam pelo gatilho por serem do dono (alerta no cabeçalho da 0104) — custo se errada: a S16 descobre o bloqueio só ao testar.
Dívida S06 (Task 2): o repositório deve mapear o 23505 raro de `claim_tokens_hash_key` (reemissão do mesmo código de WhatsApp, colisão de 6 dígitos ou hash repetido) com nova tentativa de código, sem tratá-lo como erro fatal.
Ruling: S06 T2 — falha na entrega do token (sender lança) devolve `delivery_failed` e o token já emitido fica sem uso; o reivindicante pede outro depois do intervalo de 60 s (não há função de revogação nem de reemissão idempotente) — custo se errada: um token órfão até vencer, sem efeito externo.
Ruling: S06 T2 — sem entregador para o canal (`sender` nulo) o repositório NÃO emite token (`delivery_unavailable`), para não gastar o teto de 5/24 h nem o da escola sem enviar nada — custo se errada: nenhum.
Ruling: S06 T2 — 23505 em `claim_tokens_hash_key` refaz com novo segredo até 3 tentativas (dívida da Task 1 atendida); depois vira `database` — custo se errada: um erro genérico na terceira colisão (probabilidade desprezível).
Ruling: S06 T2 — o entregador é resolvido pela escola da própria reivindicação (`sender` aceita função de `{isDemo}` e a action usa `envSenderFor`), nunca pelo `inep` do formulário — custo se errada: um `inep` forjado escolheria o console de demo (só loga, só local).
Ruling: S06 T2 — o repositório mapeia 23514 por texto estável só para classificar (`school_closed`, `wait`, `limit`, `invalid_state`); a mensagem do banco nunca é exibida, só o texto fixo de `messages.ts` — custo se errada: classe genérica `invalid_state` se a mensagem mudar.
Ruling: S06 T2 — `expireTokens(actor, claimId?)`: varredura só admin; com `claimId`, só a própria (ou admin); `getClaimStatusView`, `listClaimQueue` e `getClaimForAdmin` expiram antes de ler; `confirmToken` não pré-expira porque `claim_confirm_token` já move `token_expired` sozinha — custo se errada: nenhum.
Ruling: S06 T2 — consultas do reivindicante recebem o `SessionActor` (filtro explícito `claimant_id` além do RLS, porque admin via `authenticated` também lê todas as claims); a fila e a visão do admin usam service role depois de `role === 'admin'` e nunca devolvem `decided_by`, `actor_id`, `storage_path`, e-mail/telefone da escola — custo se errada: nenhum.
Ruling: S06 T2 — escola de município desabilitado ou inexistente: `getSchoolClaimContext` devolve `null` (a página responde 404); `verified`/`suspended` devolvem `blockedReason` (mensagem fixa) e a página mostra o motivo em vez do formulário — custo se errada: ajuste de texto.
Ruling: S06 T3 — `/escola` (Escola03) continua exigindo `school_member`/`admin` (`features/auth/access.ts` intocado): o parent com pedido em aberto acompanha em `/escolas/[inep]/reivindicar` e vê a escola em `/escola` só depois da aprovação (que promove o papel) — custo se errada: liberar `/escola` para `parent` é uma linha em `access.ts` (fora da trilha).
Ruling: S06 T3 — passo a passo do responsável em três etapas (Pedido, Verificação, Análise) em vez dos três da Escola01 (Escola, Endereço, Responsável): o passo "Endereço" não existe (reivindicação não edita dado do INEP) e "Escola" virou o cartão fixo no topo — custo se errada: ajuste visual.
Ruling: S06 T3 — a fila do admin traz as abas Pendentes (`awaiting_verification`), Evidência pedida, Aprovadas e Recusadas com contagem por consulta (limite 100 por aba); `submitted` e `token_expired` (ainda sem análise) não têm aba — custo se errada: pedido parado sem ninguém ver; o admin ainda os abre pelo link se necessário.
Ruling: S06 T3 — `QueueRow` ganhou `evidenceNote` e `school.verificationStatus` (selo com/sem admin e N/500 no cartão); `listClaimQueue` seleciona só essas colunas a mais, sem contato da escola — custo se errada: nenhum.
Ruling: S06 T3 — `ClaimBlock` recebe o resumo da reivindicação do próprio usuário (nunca `isDemo`, que deixou de esconder o bloco); reivindicação `approved` mostra "Você administra esta escola"; escola `verified` sem vínculo próprio mostra o estado 2 sem botão — custo se errada: ajuste de texto.
Ruling: S06 T3 — o `upload` do agent-browser trava o renderer no input de evidência; o E2E injeta o arquivo por `DataTransfer` (mesma solução da S03 T3) — custo se errada: nenhum.
Dívida S06 (Task 2, revisão): `features/claims/repository.ts` e `queries.ts` passam de 250 linhas (o corte de `errors.ts` ajudou, mas não basta); dividir depois (ex.: `repository-evidence.ts`, `repository-tokens.ts`, `queries-admin.ts`) — custo se adiada: só legibilidade.
Ruling: S06 T2 revisão — `addEvidence` chama `ownClaim` e confere estado e contagem (<= 5) ANTES de gravar no Storage (o banco confere de novo); falha ao limpar o objeto vira `console.error` com texto fixo; `errorMessage` passou a aceitar qualquer objeto com `code` (antes objetos simples caíam no texto genérico) — custo se errada: um round-trip a mais ao banco por upload.
Ruling: S06 revisão final — o rótulo "Estado N" da prancha não é conteúdo: o bloco do perfil usa o eyebrow "Página da escola" e guarda o estado só em `data-claim-state`; o estado 2 não promete convite a co-admin (não existe); o estado 3 com `submitted` diz "Pedido em preparo" — custo se errada: ajuste de texto.
Ruling: S06 revisão final — no fluxo por token o passo do stepper e o painel dependem do canal (`claimStep` em `features/claims/steps.ts`): passo 2 até `channelConfirmedAt`, e a tela mostra "Canal: aguardando confirmação/confirmado" — custo se errada: ajuste de texto.
Ruling: S06 revisão final — motivo "a escola não tem celular registrado" revela que a escola não tem contato de WhatsApp (aceito: é dado do cadastro público do INEP e sem ele o método não funciona) — custo se errada: trocar por texto genérico "indisponível".
Ruling: S06 revisão final — o token do link de e-mail vai na query da URL e aparece em logs de acesso (aceito: uso único, expira, exige a sessão da mesma conta e o GET não o consome) — custo se errada: mover o token para fragmento/POST.
Dívida S06 (revisão final): aprovar é terminal e imediato, sem passo de confirmação; a tela de confirmação da decisão fica para a S16 — custo se adiada: um clique errado do admin exige correção manual no banco.
Dívida S06 (revisão final): se `claim_add_evidence` falhar depois do upload, sobra um objeto órfão no Storage (limpeza best-effort com log); rotina de varredura fica para a S17 — custo se adiada: armazenamento desperdiçado, sem exposição (bucket privado).
Dívida S06 (revisão final): o reenvio por `add_file` do E2E não confirma que o upload terminou antes de enviar (o roteiro repete a injeção e checa o contador "Arquivos (0/5)") — custo se adiada: flakiness do E2E, não do produto.

Ruling: chore/soft-404 — removidos `app/loading.tsx`, `app/escolas/loading.tsx` e `app/entrar/loading.tsx`; `app/papelaria/leads/loading.tsx` e `app/admin/importacoes/loading.tsx` movidos para route groups `(lista)` ao lado das respectivas `page.tsx` (não envolvem mais `[code]` nem `[batchId]`); `papelaria/catalogo/loading.tsx` mantido (área autenticada sem `notFound()` abaixo) — custo se errada: perde-se o esqueleto de carregamento nas rotas públicas; o 404/307 passa a ser HTTP real.

## Trilha Pipeline (consolidado de ledger-pipeline.md, D-048, S18)

> Movido de `docs/superpowers/ledger-pipeline.md` nesta fatia (D-048); conteúdo abaixo é o arquivo original,
> sem reescrever nenhuma frase.

# Ledger da trilha pipeline (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`. O orquestrador consolida em ledger.md na S11.


## S07 · Task 1 (migration 0201)
- Ruling: pgmq entra por `create extension if not exists pgmq` (schema próprio `pgmq`, versão 1.5.1 no local; disponível no hospedado), sem `pgmq_public`; o app e o worker falam com a fila só por `public.jobs_enqueue/claim/complete/fail/read/ack/set_vt` (SECURITY DEFINER, EXECUTE só service_role); schema pgmq sem USAGE para anon/authenticated e RLS ligada nas tabelas das filas — pgmq não vira API pública e o worker não precisa de grants no schema — custo se errada: trocar por `pgmq_public` exige nova migration.
- Ruling: o bucket `list-uploads` é criado/atualizado pela própria migration (upsert em `storage.buckets`) e também declarado em `config.toml` — o staging recebe migrations pelo MCP, sem config.toml; o limite (4 MB decimais) e os tipos são aplicados pela Storage API (verificado com 413/415 no local), o banco só guarda a configuração — custo se errada: bucket criado à mão no hospedado.
- Ruling: estados coerentes no envio: job `dead` ou tentativas esgotadas por crash → `list_submissions.status = 'rejected'` (único valor de erro do enum usado pela S07); `jobs_complete` → `review_needed`; só transiciona a partir de `submitted/processing/processing_async` — não sobrescreve estados adiante — custo se errada: trocar para `human_review` numa migration.
- Ruling: `jobs_claim` reivindica `running` com `locked_at` > 5 min (crash do worker) e respeita `run_after` para `retrying`; `running` antigo sem tentativas restantes vira `dead` — evita job preso para sempre — custo se errada: ajustar a janela de 5 min.
- Ruling: `jobs_fail` devolve o novo `job_status` (`retrying`/`dead`) e é no-op se o job não estiver `running`; `jobs_complete` idem — idempotência contra mensagem duplicada e crash antes do ack — custo se errada: baixo.
- Ruling: `[functions.ocr-worker]` NÃO entra no config.toml nesta task (a pasta da função só nasce na Task 2; declarar antes arrisca quebrar `db:start`); a Task 2 adiciona; pg_cron/pg_net do agendamento do worker também ficam para a Task 2 — custo se errada: nenhum.
- Ruling: consentimento é exigido também no banco (política de INSERT em `list_submissions` exige `consents` próprio, `list_upload` e não revogado); dono só revoga (`revoked_at`) — defesa em profundidade além da Server Action — custo se errada: relaxar a política.
- Ruling: `jobs` sem INSERT/DELETE para authenticated; dono só edita `notify_channel/notify_target` (grant de coluna + política); `ocr_jobs` só leitura para dono/admin; `audit_log` recebe consents e list_submissions (sem `file_name`); jobs não são auditados (alto volume e `notify_target` é PII) — custo se errada: adicionar trigger depois.

## S07 · Task 2 (serviço de envio, worker, Edge Function)
- Ruling: `submitList` marca `processing_async` ANTES de enfileirar; o pipeline é cancelado por `AbortSignal` ao estourar e qualquer resultado tardio é descartado (a corrida é decidida uma vez) — o worker nunca é sobrescrito e não há dois resultados por envio — custo se errada: baixo (reordenar). **[SUPERSEDIDO: o job nasce `running` com o envio; a marca `processing_async` ocorre atomicamente na `jobs_defer` ao estourar o orçamento, não antes de enfileirar (ver Task 2, rodada 1)]**
- Ruling: sem pipeline configurado (`pipeline: null`), o envio grava, enfileira e devolve `processing_async` com `pipelineAvailable: false` (a tela mostra "leitura automática indisponível"); a Edge Function também não lê a fila sem pipeline — nunca inventa itens — custo se errada: nenhum.
- Ruling: resultado dentro do orçamento é persistido como job `succeeded` (chave `sync:<envio>`, sem mensagem pgmq) + `ocr_jobs` + envio `review_needed`, para o status consultável devolver o resultado; não usa `jobs_enqueue` para não deixar um worker pegar o job — custo se errada: trocar por coluna de resultado no envio. **[SUPERSEDIDO: sem chave `sync:<envio>`; a chave de idempotência é o id do envio e o resultado síncrono é `submissions_record_sync_result` (ver Task 2, rodada 1)]**
- Ruling: `worker-core.ts` é autocontido (sem imports, sem Deno) e é a fonte única de `detectMime`; `features/` importa dele, nunca o contrário; `index.ts` (Deno) e `demo-pipeline.ts` (sem imports) são os únicos arquivos carregados pelo Deno — custo se errada: mover para pacote compartilhado.
- Ruling: falhas do worker são retry com backoff 30 s x2 (teto 900 s, jitter <= 20%, aplicado só com `random` injetado); arquivo armazenado com assinatura divergente é falha permanente (`invalid_file`): o worker-core pede `permanent`, mas `jobs_fail` da 0201 não tem esse parâmetro, então o adaptador RPC segue o retry normal e o job vira `dead` ao esgotar as tentativas (5 tentativas, ~8 min) até a migration ganhar `p_permanent`; teto de extração 90 s < lease de 5 min — custo se errada: ajustar constantes.
- Ruling: erro de validação do envio é `SubmissionError(code)` (nada gravado); erros do pipeline nunca vazam texto ao usuário (`reason` é código fixo) e `last_error` passa por `sanitizeError` (sem e-mail/números longos, 300 chars) — custo se errada: baixo.
- Ruling: nomes de arquivo são ASCII (NFD sem acentos, resto vira `_`) para o caminho do Storage — custo se errada: perde acentos no nome exibido.
- Ruling: DEMO_PIPELINE=1 com NODE_ENV=production sem ALLOW_DEMO_IN_PRODUCTION é erro de validação em `getPipelineFlags`/`getServerEnv`; a Edge Function aplica a mesma regra via `APP_ENV`/`NODE_ENV` — custo se errada: baixo. **[SUPERSEDIDO: trava por `APP_ENV` explícito; `ALLOW_DEMO_IN_PRODUCTION` foi removida; agora também `VERCEL_ENV=production` trava (ver Task 2, rodada 1 e onda final)]**
- Ruling: o agendamento pg_cron/pg_net NÃO entra em migration (URL e segredo do worker dependem do ambiente e não podem ir em SQL versionado): documentado com Vault em `supabase/functions/ocr-worker/README.md` — custo se errada: criar o job à mão em cada ambiente.

## S07 · Task 1, rodada de correção 1 (migration 0201)
- Ruling: consentimento é imutável e a revogação é irreversível — sem UPDATE para `authenticated`; única via `public.consents_revoke(consent, profile)` (service_role, idempotente, só o dono); trigger BEFORE UPDATE rejeita mudança de `profile_id/purpose/text_version/granted_at/id` e qualquer alteração de `revoked_at` já preenchido, valendo até para service_role/owner — evita restaurar consentimento revogado — custo se errada: nova migration para permitir novo aceite (que deve ser uma linha nova).
- Ruling: `jobs_claim` devolve `text` (`claimed`/`busy`/`not_due`/`finished`) com `SELECT ... FOR UPDATE`; lease de 5 min (o worker deve rodar abaixo dela); job a reclamar sem tentativas restantes vira `dead` (DLQ + envio rejected) e devolve `finished` — o worker distingue "outro está com ele" de "acabou" — custo se errada: mudar o contrato (worker da Task 2 já usa os quatro valores).
- Ruling: `jobs_requeue_stale()` (service_role) re-envia mensagens de jobs `running` com lease vencido e `queued/retrying` vencidos sem mensagem em `q_ocr_jobs`, e marca `dead` os sem tentativas; idempotente — rede de segurança para mensagem perdida/crash antes do ack; o agendador (Task 2) a chama — custo se errada: baixo.
- Ruling: menor privilégio — `authenticated` só lê (consents, list_submissions, storage); INSERT em `consents`, `list_submissions` e `storage.objects` só pelo servidor com service_role. As regras antes em política de INSERT (papel de envio, `source='school'`, status `submitted`, consentimento próprio/`list_upload`/não revogado) viraram o trigger `list_submissions_check_insert`, que vale também para service_role (RLS não se aplica a ele) — custo se errada: relaxar o trigger.
- Ruling: política de leitura do storage rejeita `..` no path e exige UUID no 2º segmento (`{uid}/{uuid do envio}/...`) — custo se errada: objetos legados fora do padrão ficam ilegíveis ao usuário.
- Ruling: `jobs_fail` faz uma checagem (FOR UPDATE) e uma atualização; o UPDATE redundante antes de `jobs_mark_dead` foi removido — custo se errada: nenhum.
- Ruling: `jobs_fail(..., p_permanent boolean default false)`; permanente leva direto a `dead` (DLQ + envio rejected) — arquivo armazenado inválido não deve gastar tentativas; assinatura de 3 args deixa de existir (a migration só existe nesta branch) e a chamada de 3 args continua válida pelo default — custo se errada: baixo.

Ruling: demo-pipeline.ts passa a viver em supabase/functions/_shared e features/submissions/demo-pipeline.ts só o reexporta — o `functions serve` só resolve imports dentro de supabase/functions (falhou com `../../../features/...`) — custo se errada: baixo, mover de volta exigiria duplicar o arquivo.
Ruling: envio nasce `submitted` e o store o move a `processing` em seguida (trigger list_submissions_check_insert exige `submitted`), com desfazimento completo (linha, objeto, consentimento) em qualquer falha — motivo: contrato da 0201 revisada — custo se errada: uma escrita extra por envio.
Ruling: teste E2E da Edge Function (tests/submissions/edge-function.e2e.test.ts) fica versionado e é ignorado sem WORKER_URL/WORKER_SHARED_SECRET — motivo: repetível sem depender de Deno no CI — custo se errada: nenhum.

## S07 · Task 3 (telas, status e E2E)
- Ruling: `/enviar-lista` entra em `features/auth/access.ts` como prefixo protegido (parent, school_member, admin; papel lido de `profiles`), e a Server Action usa `requireAccess` — não reimplementa sessão/papel — custo se errada: ajustar a matriz de acesso.
- Ruling: status do envio lido com o cliente DO USUÁRIO (RLS) e 404 idêntico para inexistente e alheio; a escrita do envio usa o cliente de serviço só depois de `requireAccess` e do tamanho (`checkUploadSize` antes de ler os bytes); `serverActions.bodySizeLimit = 11mb`, `maxDuration = 30` nas páginas com a action — custo se errada: baixo. **[SUPERSEDIDO: `bodySizeLimit` 11mb; vale o teto único de 4 MB da onda final]**
- Ruling: o campo de foto e o de galeria têm o mesmo `name="file"`; o servidor escolhe o `File` com conteúdo (o Next nomeia o vazio "blob") — custo se errada: baixo.
- Ruling: canal de aviso registrado com o cliente do usuário (grant de coluna da 0201); "navegador" só grava a preferência, o Web Push é da S11 — custo se errada: nenhum.
- Ruling: as telas de referência App15/App20 mostram edição de itens e "montando carrinhos" (fatias S10/S12); a S07 reaproveita layout, tokens e etapas reais do envio, sem tempo ou contagem inventados — custo se errada: retocar textos.
- Observação: quando um worker COM pipeline processa um envio feito por um app SEM pipeline (só no E2E local com o segredo compartilhado), `list_submissions.is_demo` fica falso mas o resultado é de demonstração; em produção o pipeline real não é demonstração — para a Task 2 avaliar se o worker deve marcar `is_demo`.

## S07 · Task 2, rodada de correção 1
- Ruling: a saída do pipeline é validada pelo `extractionResultSchema` (Zod, fonte única em `supabase/functions/_shared/extraction-schema.ts`, re-exportado por `features/submissions/schemas.ts`) ANTES de `jobs_complete`; o `worker-core` (sem imports) recebe o schema por injeção (`WorkerDeps.resultSchema`, obrigatório) e a Edge Function o importa via `ocr-worker/deno.json` (`zod`); resultado inválido = falha com retry (não permanente) e o que chega ao banco é o dado parseado (sem campos extras) — custo se errada: baixo.
- Ruling: o job do envio nasce junto com o envio (`running`, `attempts=1`, `locked_at=now()`, `idempotency_key = id do envio`); sucesso síncrono = `submissions_record_sync_result` (UMA função SQL: job succeeded + ocr_jobs + envio review_needed); timeout = `jobs_defer` (job vira `queued` com tentativas zeradas, mensagem pgmq e envio `processing_async`, atômico; a chave `sync:<id>` deixou de existir); falha antes de haver worker = `submissions_reject` (job `dead` sem DLQ + envio `rejected`); envio órfão (processo morreu com o job `running`) é recolocado por `jobs_requeue_stale` depois da lease de 5 min — custo se errada: baixo (uma função SQL a mais).
- Ruling: falha ao gravar o resultado síncrono NÃO rejeita o envio: cai no caminho assíncrono (`enqueue`), para o worker refazer a leitura em vez de perder o envio — custo se errada: leitura repetida.
- Ruling: `jobs_complete` e `jobs_fail` recebem a tentativa reivindicada (`p_attempts`, token de fencing) e viram no-op se o job já estiver em outra tentativa; `jobs_complete` recebe `p_is_demo`; ambos com default nulo/falso (chamadas antigas seguem válidas) — custo se errada: baixo.
- Ruling: o worker com pipeline demo marca `list_submissions.is_demo = true` no `jobs_complete` (responde à observação da Task 3); pipeline real nunca marca — custo se errada: nenhum.
- Ruling: prazo do tick 100 s (`TICK_DEADLINE_MS`), lote 3, sem reivindicar mensagem nova com menos de 15 s de prazo; as lidas e não processadas voltam à fila em 5 s (`setVt`) sem gastar tentativa; o teto de cada extração é `min(90 s, prazo restante)` (extração cortada pelo prazo conta como falha e vai a retry) — custo se errada: tentativa gasta em extração cortada.
- Ruling: falha de `requeueStale` não aborta o tick (conta em `errors`); erros de infra do tick são reportados a `onError` já passados por `sanitizeError` (e-mail, JWT, Bearer, URL com query, chaves longas e números longos removidos; controle primeiro) e a Edge Function os loga em JSON — custo se errada: baixo.
- Ruling: trava do demo = `DEMO_PIPELINE=1` E `APP_ENV` explícito em {local, development, preview, staging}; `APP_ENV` ausente ou outro (inclusive `production`) = desligado; `NODE_ENV` não conta; `ALLOW_DEMO_IN_PRODUCTION` foi removida. Regra única em `supabase/functions/_shared/demo-lock.ts`, usada na Edge Function (Deno) e em `lib/pipeline-env.ts` (Node); `instrumentation.register()` lança no boot se o demo foi pedido em ambiente não permitido; o modo por nome de arquivo (lento/falha) só existe porque `DemoExtractionPipeline` só é instanciado com a trava aberta — custo se errada: ambientes de preview/staging precisam definir APP_ENV.
- Ruling: `DEMO_SLOW_MS` passa por `parseSlowMs` (não finito ou negativo = 15000; teto 120000) — custo se errada: nenhum.
- Ruling: a extensão do arquivo armazenado é forçada pelo tipo detectado no conteúdo (`lista.exe` com PDF vira `lista.pdf`; jpg/jpeg e heic/heif aceitos como estão) — custo se errada: nome exibido pode mudar.
- Ruling: `list_submissions` ganha trigger BEFORE UPDATE que torna imutáveis `id`, `submitted_by`, `consent_id`, `source` e `storage_path` (vale até para service_role) — o consentimento que sustentou o envio não pode ser trocado — custo se errada: relaxar o trigger.
- Ruling: `pnpm test:db` roda a Edge Function real (Deno) contra o banco da trilha quando `WORKER_URL`/`WORKER_SHARED_SECRET` existem; o E2E do navegador do script usa sessões `t2s07-*` e encerra só o servidor da porta 3002 (nunca `pkill` por nome) — custo se errada: nenhum.
- Ruling: literais com formato de chave (ex.: sk_live_...) em testes de redação são montados em tempo de execução — o push protection do GitHub bloqueia o padrão estático mesmo sendo dado de teste; não usamos o link de exceção — custo: nenhum.


## S07 · Onda final da revisão (opus)
- Ruling: teto de upload web = 4 MB decimais (`MAX_UPLOAD_BYTES = 4_000_000`; `bodySizeLimit` único "4mb" em next.config.ts, também para o CSV do INEP da S03) porque a Vercel limita o corpo da requisição a 4,5 MB; a UI diz "até 4 MB". Fotos acima de 3 MB são reduzidas no navegador (canvas, JPEG 0,85, lado máximo 2400 px) antes do envio; HEIC/imagem que o navegador não decodifica e PDF acima de 4 MB recebem mensagem clara — custo se errada: fotos muito grandes que não decodificam no navegador precisam ser reenviadas em JPG/PNG.
- Dívida técnica: upload direto ao Storage por signed upload URL (arquivo vai do navegador ao bucket, a Server Action só recebe o caminho) elimina o teto de 4 MB e a compressão obrigatória; adiar até a S11/S20 — custo de adiar: PDFs escaneados grandes precisam ser comprimidos pelo usuário.
- Ruling: criação do envio atômica pela função SQL `submissions_create` (service_role): consentimento + envio `processing` + job `running` com lease numa transação; o servidor sobe o arquivo antes e o remove se a função falhar — substitui a sequência de inserts com desfazimento manual — custo se errada: nenhum.
- Ruling: `notify_target` tem CHECK de formato (e-mail simples ou telefone E.164) além do Zod da borda; `list_submissions_guard_update` e `consents_guard_update` passam a ter `set search_path = ''`.
- Ruling: removido o "kick" do worker (1,5 s no caminho do usuário); o pg_cron por minuto cobre o acionamento — custo se errada: até 1 min de latência para envios assíncronos.
- Ruling: trava do demo também exige `VERCEL_ENV !== "production"` (Node) e apara os valores de forma idêntica no Node e no Deno — custo se errada: baixo.
- Ruling: `school_id` do envio de escola vem de `profiles.role = school_member` sem verificação de vínculo (não existe tabela `school_members` ainda); o vínculo é amarrado na S11/S13 e a revisão humana antes de publicar cobre o intervalo — custo se errada: escola pode enviar em nome de outra até a S11/S13, mas nada é publicado sem revisão.
## S07 · Ajuste final (WhatsApp E.164, imagem, teto)
- Ruling: o Zod `notifyInputSchema` normaliza WhatsApp para E.164 brasileiro (`toE164`: DDD + 8/9 dígitos ganha +55; `55`+DDD+número ganha `+`; entrada com `+` mantém e exige `[1-9]` + 7 a 14 dígitos); o CHECK de `jobs.notify_target` continua exigindo E.164 ou e-mail; `tests/db/notify-zod-check.test.ts` prova que cada saída válida do schema é aceita pelo banco via cliente do usuário — custo se errada: números fixos/exteriores sem `+` são recusados no formulário.
- Ruling: `prepareUpload` pinta o fundo de branco antes do `drawImage` (PNG transparente não vira preto) e decodifica com `imageOrientation: "from-image"`, com fallback sem a opção — custo se errada: nenhum.
- Ruling: teto alinhado em todas as camadas: `size_bytes` (CHECK da 0201), bucket `list-uploads` e `config.toml` = 4 MB decimais, igual a `MAX_UPLOAD_BYTES`; sem conflito com testes existentes (ajustados) — custo se errada: subir o teto exige migration nova e alterar as três camadas.

## S08 · Task 1 (migration 0202)
- Ruling: leitura de `ai_settings` e do prompt ativo por funções `ai_get_settings()` e `ai_get_active_prompt(p_key)` (STABLE, SECURITY DEFINER, EXECUTE só service_role) em vez de SELECT direto — falham fechadas (P0002) sem linha/prompt ativo e não dependem de RLS — custo se errada: trocar por leitura direta é trivial.
- Ruling: `ai_record_decision` rejeita chave fora da lista de colunas e restringe `alerts` a códigos (`^[a-z][a-z0-9_]{0,63}$`, ou `{code,item_index}`) e `item_scores` a números em [0,1]; assim nenhum texto do documento cabe na decisão — custo se errada: alertas com detalhe exigem migration.
- Ruling: `prompt_registry` não permite DELETE/TRUNCATE nem edição de key/version/text/schema (só `is_active` alterna); `ai_settings` sem DELETE para ninguém; ambos com auditoria em `audit_log` — custo se errada: nenhum.
- Ruling: validadores puros (`ai_routes_valid` etc.) ficam com EXECUTE padrão porque CHECK roda com os privilégios de quem escreve — custo: nenhum (não leem dados).

## S08 · Task 2 (núcleo de IA compartilhado)
- Ruling: fonte única em `supabase/functions/_shared/ai/*.ts` (TypeScript puro: só `zod`, `fetch`, `AbortController`, sem `node:*`), com imports relativos `./x.ts` (exigidos pelo Deno); `tsconfig` ganha `allowImportingTsExtensions` (noEmit) e `lib/ai/**` só re-exporta — custo se errada: remover a flag e tirar as extensões.
- Ruling: o PDF vai ao OpenRouter como parte `{type:"file", file:{filename, file_data:"data:application/pdf;base64,..."}}` e imagem como `image_url` data URL (formato documentado do OpenRouter, sem plugin de parser); só JPEG/PNG/WebP/GIF/PDF, o resto é erro permanente `unsupported_mime` sem rede; não foi possível confirmar sem gastar — `scripts/ai-smoke.ts` fica para o humano — custo se errada: ajustar `partToWire`.
- Ruling: falha fechada em tudo — settings/prompt ausentes, inválidos ou com erro de banco viram `ai_not_configured` (sem eco do erro), sem defaults e sem chamada; rota sem chave/modelo idem (`vision_model_missing` para visão), sem decisão gravada (não houve tentativa) — custo se errada: baixo.
- Ruling: escalada só por erro transitório (Zod inválido, confiança baixa, timeout, 408/425/429/5xx, rede, resposta estranha); 4xx (401/402/403/400/404), config e `aborted` são permanentes. A cadeia tem 2 rotas (`cheap|vision` → `strong`), então `max_escalations` > 1 não gera mais tentativas; a escalada exige orçamento restante > 0 — custo se errada: ajustar tabela de transitoriedade.
- Ruling: cancelamento pelo `AbortSignal` externo lança `aborted` e NÃO grava decisão (não é decisão do sistema); timeout próprio (min(timeout da rota, orçamento restante)) grava `provider_timeout`; o timer e o listener são sempre limpos e o `complete` é corrido contra o abort (um provedor que ignora o sinal não trava o roteador) — custo se errada: baixo.
- Ruling: confiança baixa na última tentativa devolve o resultado (já validado pelo Zod) com `lowConfidence=true` e decisão `accepted` (justificativa `low_confidence`), porque a revisão humana é obrigatória e perder a leitura seria pior; a Task 3 transforma isso em alerta/aviso — custo se errada: trocar por `failed` e `low_confidence` lançado.
- Ruling: decisões só carregam ids, códigos, scores em [0,1] arredondados a 3 casas (até 2000 itens), alertas que casam `^[a-z][a-z0-9_]{0,63}$` (até 200), `justification` = código e o nome do modelo efetivo do provedor; `AiError` tem mensagem fixa por código (+ `detail` opcional restrito a `[a-z0-9_:.-]{1,60}`) e o adapter nunca repassa corpo/cabeçalho/`e.message` — custo se errada: baixo.
- Ruling: `SettingsProvider`/`PromptRegistry` guardam só sucesso em cache de 30 s (relógio injetado) e leem por `ai_get_settings()`/`ai_get_active_prompt(key)` via `RpcClient` mínimo (compatível com supabase-js service role); o recorder chama `ai_record_decision` com a whitelist em snake_case e erro vira `provider_error/decision_record_failed` — custo se errada: baixo.

## S08 · Rodada de correções (Task 1 e 2)
- Ruling: `ai_decisions.justification` restrita por CHECK a `^[a-z][a-z0-9_:.-]{0,59}$` e `model` a `^[A-Za-z0-9._:/@-]{1,200}$` — a garantia de "sem texto de documento" vale no banco, não só no recorder — custo se errada: rótulos de modelo com outros caracteres exigem migration.
- Ruling: `ai_settings` ganha guard (`id` e `scope` imutáveis, até para o dono/replica); `prompt_registry_guard` também compara `created_at`; auditoria do `prompt_registry` exclui `text`/`schema` (argumentos de `audit_row_change`); validadores puros sem EXECUTE para public/anon (authenticated e service_role mantêm: os CHECKs de `ai_settings` rodam com o privilégio de quem escreve) — custo se errada: baixo. Substitui o Ruling anterior sobre EXECUTE padrão dos validadores.
- Dívida técnica (revisão Task 1): M1 vira S16; M7 e M8 ficam como dívida menor.
- Ruling: o roteador resolve TODOS os provedores da cadeia (`chain[0..maxAttempts)`) antes da 1ª tentativa e falha fechado (`ai_not_configured`, sem rede nem decisão) se algum faltar — evita `escalated` órfão e perda de resultado pago; consequência: strong sem modelo bloqueia até um cheap que aceitaria (só com `max_escalations >= 1`) — custo se errada: trocar por `canEscalate=false`.
- Ruling: o provedor `fake` só existe com `allowFake: true` explícito no roteador (default false: `ai_not_configured` sem rede) e `NODE_ENV=production` recusa sempre; a composição de produção nunca passa `allowFake` — custo se errada: nenhum.
- Ruling: exceção que não é `AiError` (bug em buildRequest/evaluate/provedor) vira `provider_error` permanente (`unexpected`), sem escalar e sem eco; alertas só passam se estiverem nos 7 códigos do SPEC; `RunResult.usage` soma tokens de todas as tentativas; corpo do OpenRouter lido por stream com teto de 5 MB (cancela ao estourar) e corpo de erro HTTP nunca é lido; chave em `#apiKey`.
- Ruling: abort externo NÃO grava decisão (conforme o plano); confiança baixa na última tentativa grava `accepted` com justificativa `low_confidence` (a Task 3 deve transformar `lowConfidence` em alerta/aviso); HTTP 400 é permanente (requisição nossa inválida) — custo se errada: baixo.

## S08 · Task 3 (extração, integração no envio e no worker)
- Ruling: o provedor `fake` (roteador) vale só se `allowFake` E `isProductionEnv(env)` for falso (`_shared/ai/env.ts`): produção = `APP_ENV`/`VERCEL_ENV` `production`, ou `NODE_ENV=production` SEM `APP_ENV` explícito em {local, development, preview, staging}. `NODE_ENV=production` sozinho sempre recusa; o E2E no build de produção local exige `APP_ENV=local` explícito (mesma convenção do demo) — custo se errada: rever a regra do `next start` local.
- Ruling: a composição (`_shared/ai/composition.ts`) é o único lugar que decide `allowFake`: exige `FAKE_AI_SCRIPT` válido + `APP_ENV` explícito não produtivo + não-produção; sem isso o `fake` nem é registrado. O worker Deno usa a mesma composição (só lê variáveis de ambiente, sem `process`) — custo se errada: baixo.
- Ruling: entrada de imagem usa a cadeia `vision -> strong`; PDF usa `cheap -> strong` (o OpenRouter lê PDF como parte `file`; PDF escaneado com confiança baixa escala). Não há camada de texto local; `documentText` opcional existe e é sempre escapado — custo se errada: PDF escaneado gasta uma tentativa barata.
- Ruling: saída do modelo: confiança fora de [0,1], lista > 500 itens (`MAX_ITEMS`, igual ao schema do prompt) ou nome > 600 caracteres invalidam a resposta (a rota barata escala); quantidade inválida (negativa, 0, NaN/Infinity, > 9999, string) vira `null` com teto de confiança 0,7 (nunca número inventado); chaves extras (`justification`, `model`...) são descartadas pelo Zod e a decisão é montada só pelo roteador — custo se errada: baixo.
- Ruling: `evaluate` só produz os 7 códigos do spec, nunca texto do documento; alertas do documento: `handwritten` e `text_document_mismatch` vêm de booleanos do modelo, `invalid_school_grade_year` da divergência entre série/ano informados e lidos. Avisos do resultado são textos fixos — custo se errada: baixo.
- Ruling: `lowConfidence` (aceito na última rota com confiança abaixo do limiar) vira `lowConfidence: true` + aviso fixo no resultado, `requiresReview: true` sempre, e a tela mostra o aviso em destaque (`role="alert"`); alertas críticos = interseção com `ai_settings.critical_alerts` — custo se errada: ajustar textos.
- Ruling: `extractionResultSchema` ganhou campos opcionais (`normalizedName`, `category`, `alerts` por item; `pipelineVersion`, `alerts`, `criticalAlerts`, `lowConfidence`, `requiresReview`), então o resultado do demo da S07 segue válido e o worker (que revalida pelo schema) não descarta os campos novos — custo se errada: nenhum.
- Ruling: `submissionId` e `budgetMs` chegam ao pipeline por `extract(input, { signal, budgetMs })` (Server Action: 10 s; worker: `min(90 s, prazo restante do tick)`); sem `submissionId` uuid o pipeline recusa antes de gastar (entity_id NOT NULL) — custo se errada: baixo.
- Ruling: o pipeline lê `ai_settings` (cache de 30 s, falha fechada) antes de montar a tarefa, para aplicar o limiar por item no `evaluate`; o roteador lê de novo (cache) — custo se errada: mudança de settings entre as duas leituras dentro de 30 s usa o valor em cache.
- Ruling: erro `ai_not_configured` no envio síncrono (settings/modelo/chave ausentes) segue o caminho assíncrono com `pipelineAvailable: false` em vez de rejeitar o envio; demais erros continuam `extraction_failed`. A fábrica devolve `null` (indisponível) sem chave + modelos barato e forte (nem fake permitido) e o demo explícito (`DEMO_PIPELINE=1` + `APP_ENV`) mantém precedência — custo se errada: baixo.
- Ruling: adaptador `RpcClient` único (`createValidatedRpc`) valida com Zod as três funções de IA (`ai_get_settings`/`ai_get_active_prompt`: objeto JSON de uma linha; `ai_record_decision`: uuid) e devolve erro genérico sem eco; usado pelo app (`features/extraction/supabase-rpc.ts`, `server-only`, cliente de serviço criado sob demanda) e pelo worker — custo se errada: baixo.
- Dívida técnica: a tela de status decide "indisponível" por ambiente, não pelas rotas do banco; e não há extração de camada de texto do PDF (`text_document_mismatch` só quando o modelo o sinaliza).

## S08 · Correção final da revisão
- Ruling: o roteador recebe `orçamento - PIPELINE_ABORT_MARGIN_MS` (500 ms, em `worker-core.ts`, usado pela Server Action e pelo worker) e o timer de fora continua no orçamento cheio (10 s síncrono; teto do tick no worker); assim a tentativa paga é fechada com `failed:provider_timeout` antes do abort externo, que segue sem gravar decisão (cancelamento do chamador) — custo se errada: ajustar a margem.
- Ruling: no worker, `AiError` com `transient=false` ou `invalid_output` (após a escalada) vira falha permanente (`dead`, sem retry); erros de IA transitórios repetem até `MAX_PAID_ATTEMPTS = 3` tentativas por job e então morrem (cada tentativa é paga); erros que não são de IA seguem o backoff normal — custo se errada: subir o teto.
- Ruling: entrada de imagem NÃO escala para `strong` (cadeia `["vision"]`): o forte pode não aceitar imagem (padrão do `.env.example` é só texto) e não existe rota forte de visão em `ai_settings`; baixa confiança da visão = `lowConfidence` + aviso + revisão humana. Escalar foto exigiria uma rota nova (migration) — custo se errada: voltar a cadeia `["vision","strong"]`.
- Ruling: no envio síncrono só erro de conteúdo (`invalid_output`/`low_confidence`) e exceção que não é da IA rejeitam; falha de infraestrutura/configuração (`ai_not_configured`, `vision_model_missing`, 4xx/429/5xx, timeout, `decision_record_failed`) segue para `enqueueAsync`, com `pipelineAvailable: true` só se transitória — custo se errada: rejeitar de novo.
- Ruling: o contexto do formulário (série/ano) entra no prompt DENTRO do bloco `<documento>`, já escapado; nada de texto de usuário fora do delimitador. `role="alert"` só no aviso de baixa confiança. `scripts/e2e-s08.sh` aborta se houver chave/modelos no shell e usa `env -u` ao subir o app.
- Dívida técnica: correlação de tentativa/job em `ai_decisions` (sem `job_id`, tentativas do síncrono e do worker se misturam por `entity_id`); tela "indisponível" por ambiente e não pelas rotas do banco; `cleanText` mutila trechos como "< 5 anos".

## S08 · Correção pontual (RPC transitória x configuração)
- Ruling: falha da RPC de `ai_get_settings`/`ai_get_active_prompt`/`ai_record_decision` (rede, PostgREST, exceção) vira `AiError("provider_error", transient=true)` com `detail` estável `settings_unavailable`/`prompt_unavailable`/`decision_record_failed`; linha ausente (P0002, preservado por `createValidatedRpc` como `rpc_not_found`) ou resposta fora do schema continua `ai_not_configured` permanente. Worker: transitório segue o backoff; `settings_unavailable`/`prompt_unavailable` (sem chamada paga) não contam no `MAX_PAID_ATTEMPTS`, `decision_record_failed` conta (a chamada foi paga); permanente vai a `dead`. Síncrono: transitório vai a `enqueueAsync` com `pipelineAvailable: true`. `AiError.detail` agora é exposto. Exceção inesperada em `closed()` também é transitória — custo se errada: job com banco fora repete até `maxAttempts` do job.
- Ruling: o timeout externo do worker (`PipelineTimeout`) conta no teto de tentativas pagas (pode haver chamada em andamento; conservador). `WARNING_LOW_CONFIDENCE` mora em `_shared/ai/warnings.ts` (sem dependências) e `extraction.ts` o reexporta; `ReviewSummary` importa de lá (sem prompts no bundle do cliente).
- Dívida técnica: a margem de 500 ms não cobre `settings.load()` a frio + gravação final da decisão; o correto é medir o orçamento desde a entrada do pipeline (deadline único descontado em settings, roteador e recorder). Um timeout externo que ocorreu antes da chamada paga (settings lento) também conta no teto (conservador).

## S09 · Planejamento (plano 2026-09-25-s09-aprovacao-automatica)
- Ruling: a S09 precisa da migration `0203_publication_decisions.sql` — a 0202 só aceita `kind='extraction'`, decisões `accepted/escalated/failed`, exige provider/model/prompt e não guarda vários motivos. A 0203 é aditiva: `kind` ganha `publication` com decisões `auto_publish/human_review/published/publish_failed` (CHECK de acoplamento por kind), provider/model/prompt_key/prompt_version nulos só em `publication`, coluna `reasons jsonb` (≤ 32 códigos), índice único `(entity_id, decision) where kind='publication'`, `ai_settings.auto_publish_enabled` (default true) e `ai_record_decision` passa a recusar `kind<>'extraction'` — linhas de publicação só nascem pelas funções `publication_*`, junto com a transição do envio — custo se errada: uma migration para desfazer colunas/CHECKs.
- Ruling: protocolo em duas linhas append-only: veredito (`auto_publish` | `human_review`) gravado sob `FOR UPDATE` do envio, com o status como claim (`review_needed` → `approved` ou `human_review`); depois da porta, a linha `published` com `previous_version_id`/`new_version_id` (envio `published`) ou `publish_failed` (envio `human_review`). Quem perde a corrida recebe `already_decided` e não publica — custo se errada: uma linha a mais por publicação.
- Ruling: "nenhum item pendente" = tolerância zero: item abaixo de `item_confidence_threshold`, sem quantidade (nula ou ≤ 0) ou com qualquer alerta de item (`low_confidence_item`, `ambiguous_item`, `possible_collective_item`, `restrictive_brand_or_spec`) é pendente, mesmo que o alerta não esteja em `critical_alerts`; `critical_alerts` governa os alertas de documento. Não há limiar novo de "quantos itens fracos" — custo se errada: menos publicações automáticas (vão à revisão humana).
- Ruling: `invalid_school_grade_year` sempre bloqueia (é a regra 5 do SPEC, "série e ano válidos"), crítico ou não; `result.criticalAlerts` não vazio também bloqueia mesmo que o admin tenha tirado o código dos críticos depois — custo se errada: baixo.
- Ruling: limiares relidos de `ai_settings` no momento da decisão (não os do momento da extração); `result.lowConfidence` sempre bloqueia; `result.requiresReview` não é lido pelo motor (quer dizer "a extração sozinha não publica"; o comentário do schema é ajustado) — custo se errada: baixo.
- Ruling: envio de `parent` nunca publica sozinho (SPEC §4: lista enviada é candidata; S10: revisão do pai não torna oficial) e envio de escola exige vínculo confirmado do remetente (`submitterLinked === true`; o vínculo real chega na S11/S13, ver Ruling S07 sobre `school_id`); envio `is_demo` e resultado no formato do demo da S07 (sem metadados da S08) também vão a `human_review` — custo se errada: só listas de escola chegam à publicação automática.
- Ruling: escola válida = presente no contexto, `verified` (INEP/`registered`/`claimed` não é verificação), não `suspended`, município habilitado; série precisa resolver para slug do catálogo e o ano estar nos anos válidos do contexto; lista-alvo arquivada bloqueia. Hoje o formulário manda rótulos (`GRADE_OPTIONS`); "Educação infantil" nunca resolve (não é série) — custo se errada: envios de educação infantil sempre vão à revisão humana até o formulário usar os slugs do catálogo.
- Ruling: portas da trilha: `ListPublisher` (ADR-004) e `PublicationContextReader` (escola, série, ano, vínculo, lista atual); o nome `ListReader` não é reutilizado porque já é da trilha Comércio (`features/cart/ports.ts`). Fonte única em `supabase/functions/_shared/publication/` (o worker Deno precisa do mesmo motor), re-export em `features/publication/` — custo se errada: renomear na S11.
- Ruling: implementações em memória só com `FAKE_PUBLICATION_FIXTURE` válido + `APP_ENV` explícito não produtivo (mesma trava do `fake` da S08); sem isso (produção e staging até a S11) as portas são nulas e todo envio vai a `human_review` com `publisher_unavailable`/`context_unavailable`, registrado — falha fechada, nunca "adivinha" verificação — custo se errada: nenhuma publicação automática antes da S11 (esperado).
- Ruling: `actor_id = null` nas linhas automáticas (SPEC §5: usuário nulo = sistema) e a porta recebe `actor: { kind: 'system' }`; a S11 precisa de um perfil `system` para o `p_actor_id` obrigatório de `list_approve_version`/`list_publish_version` e de idempotência por `list_versions.submission_id` — obrigação da S11 — custo se errada: a ligação real exige ajuste na 0600.
- Ruling: erro transitório de settings/contexto não grava decisão (`retry_later`); configuração ausente/inválida grava `human_review` com `settings_unavailable`/`context_unavailable`. Publicação com erro transitório deixa o envio `approved` e o varredor repete (porta idempotente por `submissionId`); erro permanente ou `approved` parado > 1 h vira `publish_failed` + `human_review` (transição do envio fora da matriz de `school_lists`, que não se aplica a envios) — custo se errada: ajustar a janela.
- Ruling: a decisão roda (a) na Server Action logo após `recordSyncResult`, com teto de 3 s e erro engolido, sem mudar o `SubmitResult` existente; (b) no worker após `jobs.complete` (erro vai a `onError`, o job segue `done`); (c) num varredor no fim do tick (`publication_pending`, lote ≤ 10, também sem pipeline configurado) — custo se errada: até 1 min de atraso na decisão de envios cuja decisão inline falhou.
- Ruling: `pipeline_version` das linhas `publication` = `PUBLICATION_RULES_VERSION` (`s09.1`, constante de código: versão das regras, não limiar); `justification` = `rules_passed` ou o primeiro código na ordem canônica; `reasons` = todos os códigos (sem curto-circuito entre regras) — custo se errada: nenhum.
- Ruling: o E2E da S09 prova a decisão com as portas em memória; a publicação real em `school_lists`/`list_versions` e o E2E de ponta a ponta ficam para a S11 (ADR-004 item 9), declarados no PR — custo se errada: retrabalho de integração na S11.

## S09 · Task 1 (migration 0203 e regras puras)
- Ruling: os CHECKs de `kind` e `decision` da 0202 são removidos por nome lido de `pg_constraint` (CHECK de coluna única, exatamente 1 por coluna, senão a migration aborta) e recriados com nomes fixos (`ai_decisions_kind_valid`, `_kind_decision_valid`, `_provider_coupling`, `_reasons_valid`, `_reasons_scope`, `_published_has_version`) — custo se errada: baixo.
- Ruling: dois índices únicos parciais: `ai_decisions_publication_one_verdict (entity_id) where decision in ('auto_publish','human_review')` (um veredito por envio, de qualquer tipo) e `ai_decisions_publication_once (entity_id, decision)` (um `published`/`publish_failed`); o lock do envio já basta, os índices são defesa extra — custo se errada: nenhum.
- Ruling: `publication_record_verdict` valida a coerência `auto_publish` ⇔ `reasons` vazio (22023) e devolve `not_ready` também para `rejected`/`draft` e para `review_needed` sem resultado; `publication_complete`/`publication_fail` devolvem `not_approved` (sem erro) fora de `approved` com veredito `auto_publish`; `publication_pending` aplica a idade mínima aos dois estados — custo se errada: baixo.
- Ruling: `justification` de `published` = `published`; de `publish_failed` = o motivo (código ≤ 60) e `reasons = [motivo]`; `pipeline_version` dessas linhas copia a do veredito — custo se errada: nenhum.
- Ruling: regras: campo ausente do envio (`missing_*`) não repete em `validSchoolGradeYear` (cada mudança isolada produz um só código); resultado que não passa no Zod emite só `invalid_extraction_result` (as demais regras que leem o resultado calam); `invalid_school_grade_year` lido na união documento ∪ itens ∪ `criticalAlerts`; contexto nulo emite só `context_unavailable` (sem `submitter_not_linked`); `PUBLICATION_RULES_VERSION` mora em `codes.ts` (a varredura de decimais em `rules.ts` fica sem exceção) — custo se errada: baixo.
- Ruling: teste de banco com corrida real grava linhas commitadas; `ai_decisions` é append-only, então a limpeza do teste desabilita o gatilho `ai_decisions_no_update_delete` e o reabilita `enable always` na mesma transação (o teste da 0202 exige a tabela vazia) — custo se errada: o teste da S08 falha por linhas residuais.

## S09 · Task 1 (rodada de correções da revisão)
- Ruling: `ai_settings.auto_publish_enabled` passa a `DEFAULT FALSE` (a linha `default` do seed fica desligada); o interruptor só liga por dado, por decisão explícita. Obrigação da S11: ligar `auto_publish_enabled = true` por dado (SQL/admin, auditado) quando a publicação real existir; até lá, e mesmo no E2E da S09, o teste liga na mão — custo se errada: nenhuma publicação automática até alguém ligar (falha fechada; o plano que dizia `default true` está superado por este item).
- Ruling: `publication_pending` só entrega no ramo `publish` envios `approved` com veredito `auto_publish` e sem `published`/`publish_failed`; aprovação humana da S10, correção manual e `approved` "à força" ficam fora (a Task 2 nunca chama a porta para eles) — custo se errada: baixo.
- Ruling: defesa em profundidade no banco: `publication_record_verdict` recusa `auto_publish` (22023) para envio de `parent` ou `is_demo`, exige `justification = 'rules_passed'` em `auto_publish` e igual ao primeiro código de `reasons` em `human_review`; `publication_fail` usa o alfabeto de `reasons` (`^[a-z][a-z0-9_]{0,59}$`, 60 por causa de `justification`) e dá 22023 em vez de 23514 — custo se errada: baixo.
- Pendência (S11): a regra 5 só bloqueia lista-alvo `archived`; lista-alvo em `human_review`/`review_needed` passa pelo motor e a S11 decide.
- Pendência (S10/S11): `ai_decisions_publication_once` limita a um `published`/`publish_failed` por envio; republicação após `publish_failed` + aprovação humana pedirá outro `kind`/`decision` (e o `publication_pending` já não a devolve).
- Pendência (Task 2): corrida entre `publication_fail` (expirador após 1 h) e uma chamada da porta ainda em andamento: o expirador não deve falhar enquanto houver publicação em andamento, OU `publication_complete` após `publish_failed` deve gerar alerta/registro (hoje devolve `not_approved` e a versão publicada ficaria órfã).

## S09 · Task 2 (serviço, portas e integração)
- Ruling: a corrida do expirador é resolvida por LEASE no banco (0203 editada no lugar, ainda não aplicada em lugar nenhum): tabela `publication_leases` (uma linha por envio, RLS sem política, só as funções tocam) + `publication_begin_publish` (`leased`/`busy`/`already_completed`/`not_approved`) e `publication_expire` (`in_progress` enquanto a lease vale, `not_due`, `failed`). Lease de 120 s > teto de 45 s da chamada à porta; só quem obtém a lease chama a porta (também serializa Server Action, worker e varredor). O expirador nunca falha uma chamada em andamento — custo se errada: uma tabela pequena a mais.
- Ruling: `publication_complete` depois de `publish_failed` grava a linha `publish_orphaned` (novo `decision`, com `previous/new_version_id`, justificativa `published_after_failure`), o envio segue `human_review`, devolve `orphaned` e o serviço dispara `onAlert('published_after_failure')` — nunca silêncio; `not_approved` após publicar alerta `published_not_recorded` — custo se errada: baixo; a S10/S11 reconciliam pela linha.
- Ruling: o serviço só chama `publish` via `publishWithTimeout` depois de `beginPublish`; transitório/desconhecido deixa `approved` (a lease vence sozinha e o varredor repete, porta idempotente por `submissionId`); permanente vira `publish_failed` com o código da porta (fora do alfabeto = `publish_rejected`); `approved` > 1 h sem chamada em andamento = `publish_expired` — custo se errada: ajustar constantes.
- Ruling: `resumePublication` (varredor, estado `publish`) chama `expire` primeiro; sem porta/contexto/resultado válido falha o envio com código (`publisher_unavailable`, `context_unavailable`, `invalid_extraction_result`) — custo se errada: baixo.
- Ruling: `createValidatedRpc` da S08 (lista fechada de 3 funções) ficou intacto; a publicação tem `rpc-store.ts` próprio com Zod e `settings.ts` próprio (lê `ai_get_settings()` com `auto_publish_enabled`). Composição só liga memória com fixture válida + `explicitNonProduction`; `features/publication/supabase-store.ts` não foi criado (o store nasce na composição a partir do cliente de serviço em `factory.ts`) — custo se errada: nenhum.
- Ruling: varredor: idade mínima 30 s (dá tempo à decisão inline), lote ≤ 10, prazo = restante do tick (só inicia com ≥ 10 s), roda também sem pipeline (a função responde `pipeline_unavailable` mas ainda varre) — custo se errada: até 1 min de atraso.
- Ruling: a decisão inline do envio síncrono tem teto de 3 s (`PUBLICATION_INLINE_TIMEOUT_MS`), erro engolido, e `SubmitResult.review_needed` ganha `publication?: { status }` só quando respondeu a tempo — custo se errada: nenhum.

## S09 · Task 2 (rodada de correções da revisão)
- Ruling: `resumePublication` relê `ai_settings` e reavalia `evaluatePublication` com o contexto atual antes de chamar a porta: settings transitório = `retry_later`; nulo ou `autoPublishEnabled=false` = `publish_failed/auto_publish_disabled`; qualquer regra que falhe (escola suspensa, vínculo removido...) = `publish_failed` com o primeiro código — custo se errada: um envio aprovado que perde a elegibilidade vira revisão humana em vez de publicar.
- Ruling: `MemoryListPublisher` é singleton por processo e por string da fixture (memoizado em `composition.ts`), ids via `crypto.randomUUID()`, mesma chave com payload diferente = `idempotency_conflict` (permanente). App (Next) e worker (Edge Function) são processos distintos e NÃO compartilham esse estado; a publicação real (S11) resolve isso no banco — custo se errada: nenhum (só aparato local).
- Ruling: `PublishRequest.signal` (AbortSignal) é abortado no teto da chamada; resultado tardio é validado, concluído por `complete` se o envio ainda estiver `approved` (alerta `publish_result_late`) ou vira `publish_orphaned` (alerta `published_after_failure`); `PublishResult` é validado por Zod (uuids), inválido = `publish_failed/invalid_publish_result` com alerta `publish_result_invalid` — custo se errada: baixo. A suíte de contrato (`list-publisher.contract.ts`, a S11 a roda contra a implementação real) ganhou concorrência com a mesma chave, erro transitório tipado (`PortError transient:true`, via `failNextTransiently` do harness) e mesma chave com payload diferente.
- Ruling: erro por envio no varredor vai a `onError` (só `code` e `submissionId`; código do `PortError` ou `sweep_item_error`) e o resumo do varredor entra na resposta do tick (`sweep`) — custo se errada: nenhum.
- Ruling: prazo do tick respeitado: `TICK_DEADLINE_MS` real = 100 s; `decide` e o varredor recebem o restante como `budgetMs`; teto da chamada à porta = min(45 s, restante); abaixo de `MIN_PUBLISH_WINDOW_MS` (5 s) a porta não é chamada (fica `approved`, o varredor retoma); o varredor só inicia item com ≥ `SWEEP_MIN_ITEM_WINDOW_MS` (10 s) — custo se errada: retomada até o tick seguinte.
- Ruling: as portas falsas de publicação valem APENAS com `APP_ENV` `local`|`development` (não `preview`/`staging`): o staging é o único Supabase real e `ai_decisions` é append-only, então publicação falsa ali não se desfaz. Isto substitui o ruling anterior ("explicitNonProduction"); comentários de `.env.example` e `composition.ts` corrigidos — custo se errada: E2E em preview/staging fica sem a publicação em memória.
- Dívida (M-2): o ramo sem pipeline responde 500 `misconfigured`/`pipeline_unavailable` mesmo varrendo publicação; sem regressão em deploys hospedados (pipeline configurado).
- Dívida (M-4): `worker-core.ts` (~420 linhas) e `decide.ts` (~290) passaram do teto de leitura confortável; refatorar na S18.
- Dívida (M-7): quando a porta publica e o envio já não está `approved` (`not_approved`), a versão fica órfã sem linha persistente própria; aceito com alerta `published_not_recorded`.

## S09 · Task 3 (E2E e textos de estado)
- Ruling: a tela de status ganha só o estado da decisão, com textos fixos e sem prazo, contagem ou motivo: `human_review` = "Em revisão pela equipe", `approved` = "Aprovada, aguardando publicação", `published` = "Publicada automaticamente" + selo "Demonstração" quando `publicationIsDemo(env)` (mesma trava das portas em memória, lida no servidor pela rota de status como `publicationDemo`). Os códigos de motivo não aparecem para pai/escola (ficam em `ai_decisions`; a S10 os mostra ao admin) — custo se errada: baixo (só copy).
- Ruling: o E2E injeta `schoolId` como campo oculto porque `/enviar-lista` ainda não tem seletor de escola; a fixture em memória dá o vínculo. O seletor e o vínculo real são S11/S13 — custo se errada: nenhum.
- Ruling: o E2E cobre app (inline), worker (g) e varredor (h2, off) separadamente e declara que suas memórias são distintas; envios pendentes para o varredor são clonados por SQL (`review_needed` com o resultado de `ocr_jobs` de um envio real) — custo se errada: nenhum.
## S10 · Planejamento (plano 2026-09-25-s10-revisao-humana)
Nota: escrito sobre `main` @ `8cbd458`, antes do merge da S09 (lida em `origin/slice/S09-aprovacao` @ `a5a5d49`). Ao mesclar, esta seção vem depois das seções S09; o passo 0 da Task 1 revalida tudo que depende do estado final da S09.
- Ruling: a implementação da S10 só começa depois do merge da S09 em `main`, no worktree `T2-pipeline` (trilha 2, porta 3002, sessões `t2s10-*`), com a branch `slice/S10-revisao` rebaseada sobre esse `main` — a S10 depende das portas, códigos, status e da 0203 da S09 — custo se errada: retrabalho de assinaturas se a S09 mudar depois.
- Ruling: migration `0204_human_review.sql` é necessária: `ai_decisions` ganha `kind='review'` (decisões `edited|approved|rejected|published|publish_failed`, `actor_id` obrigatório, sem provider/model/prompt, `reasons` permitido, um `review/published` por envio), recriando os CHECKs da 0203 pelos nomes fixos; tabelas `review_versions` (append-only) e `parent_list_copies`; funções `review_*` e `parent_copy_*` (SECURITY DEFINER, só service_role, conferem `profiles.role='admin'` do `p_actor_id`) — a 0203 não aceita outro `kind` nem guarda itens editados — custo se errada: uma migration para desfazer.
- Ruling: toda decisão humana grava `ai_decisions` `kind='review'` com `actor_id` do admin da sessão e `previous/new_version_id` (`edited`: versões da revisão; `approved`/`rejected`: versão decidida; `published`: versões da lista vindas da porta), na mesma transação da transição do envio; o conteúdo editado fica só em `review_versions` (append-only), nunca em `ai_decisions` (só códigos) — custo se errada: baixo.
- Ruling: concorrência entre admins por versão otimista (`p_expected_version` + `FOR UPDATE` do envio; `stale` sem gravar), sem trava exclusiva que possa ficar presa; publicação serializada pela lease `publication_leases` da 0203 — custo se errada: dois admins podem abrir o mesmo envio e um deles refaz a edição.
- Ruling: a revisão do pai é uma cópia privada (`parent_list_copies`, uma por envio, dono = remetente de envio `parent` com resultado) que nunca chega à fila, a `review_versions`, a `ai_decisions` nem à `ListPublisher`; o admin revisa o resultado da extração, não a cópia. O App15 "Enviar para revisão" vira "Salvar minha lista"; "Colar texto" fica para a S15 — custo se errada: correções úteis do pai não chegam à equipe.
- Ruling: CTA do pai "Montar carrinho com esta lista" → `/carrinho/novo?lista=<copyId>`; na S10 o `ListReader` do carrinho ainda é o de demonstração e a página mostra o estado honesto "lista não encontrada"; a S11 liga o `ListReader` às cópias do pai com checagem de dono — custo se errada: link sem efeito até a S11 (declarado no PR).
- Ruling: `/admin/revisao` = fila no layout Admin05 (abas Pendentes = `human_review`, Aprovadas, Recusadas) e detalhe `/admin/revisao/[id]` no layout Escola09 (documento ao lado dos itens) dentro do `AdminShell`, com o painel de decisão do Admin05 — o PLAN pede documento ao lado e o Admin05 não o tem — custo se errada: retoque visual.
- Ruling: a revisão da escola (`/escola/listas/[id]/revisar`, Escola09 no SCREENS.md) é adiada para a S11, quando existir o vínculo `school_members` (D-002); a Escola09 serve de referência visual do detalhe do admin — custo se errada: a escola não corrige a própria leitura até a S11.
- Ruling: a fila não mostra nome nem e-mail do remetente (o Admin05 mostra `[Nome]`): só origem ("Família"/"Escola") e data — minimização de dados (SPEC §2.5) e não é necessário para decidir — custo se errada: acrescentar a coluna depois.
- Ruling: rótulo da escola por uma porta nova `SchoolLabelReader` (memória a partir de `label` opcional nas escolas da fixture da S09, que é estendida de forma aditiva; real na S11); sem porta, "Escola não identificada neste ambiente" — ADR-004 proíbe ler `schools` pela trilha Pipeline — custo se errada: tela menos informativa até a S11.
- Ruling: documento ao admin por rota `/admin/revisao/documento/[id]` (admin → 307 para URL assinada de 60 s do bucket privado `list-uploads`, `no-store`, `no-referrer`; outros → 404 idêntico), embutida em `<iframe>`/`<img>` pela rota, nunca a URL assinada no HTML; HEIC só com link. CSP (`frame-src`/`img-src` do Storage) é obrigação da S19 — custo se errada: ajustar a CSP.
- Ruling: faixas de confiança vêm de `ai_settings`: Baixa < `item_confidence_threshold`, Alta ≥ `confidence_threshold`, Média entre os dois; item editado/adicionado mostra "Conferido pela equipe"; sem settings, só o percentual e "faixa indisponível" — nada de limiar fixo no código — custo se errada: retocar rótulos.
- Ruling: rótulos de alerta neutros; o texto "Procon: exigir marca pode violar a Lei 12.886" da Escola09 não é reproduzido (CLAUDE.md: alertas são sinalizações, não parecer jurídico) — custo se errada: nenhum.
- Ruling: recusa exige motivo de uma lista fechada (`not_a_school_list`, `illegible_document`, `wrong_school_grade_year`, `duplicate_submission`, `incomplete_list`, `inappropriate_content`, `other`), sem texto livre (desvio do textarea do Admin05): `ai_decisions` só aceita códigos e texto livre poderia conter dado de menor — custo se errada: acrescentar nota interna numa tabela própria.
- Ruling: portão da publicação humana = itens completos (≥ 1 item, nome, quantidade inteira 1..9999, categoria), série, ano e `school_id` presentes, e pela porta de contexto: escola presente e não suspensa, município habilitado, série resolvida, ano válido, lista-alvo não arquivada. **Não** exige escola `verified` (a revisão humana com o documento substitui a verificação da lista, não a da escola; o selo de escola continua só pela S06). Alerta crítico exige a confirmação "Conferi o documento original" (`critical_alerts_acknowledged`) — custo se errada: acrescentar `school_not_verified` ao portão.
- Ruling: o admin corrige série e ano na versão da revisão (não a escola; envio sem `school_id` só pode ser recusado até a S11 trazer o seletor de escola); a linha de `list_submissions` fica como enviada — custo se errada: envios sem escola parados até a S11.
- Ruling: "Aprovar e publicar" (Admin05) = aprovar (`human_review` → `approved` + `review/approved`) e publicar pela `ListPublisher`; transitório deixa `approved` com "Tentar publicar de novo" (sem varredor para aprovação humana; o varredor da S09 só pega `auto_publish`); permanente → `review/publish_failed` + `human_review`; porta nula (staging/produção até a S11) → fica `approved` com "Publicação indisponível neste ambiente até a integração"; a S11 publica o acumulado — custo se errada: fila de aprovadas sem publicação no staging.
- Ruling: extensão aditiva das portas da S09: `PublishRequest.source` aceita `parent_upload` (enum `list_version_source` da 0103 já tem) e `actor` aceita `{ kind: 'admin', profileId }`; chave de idempotência da publicação humana = id da versão aprovada (`review_versions.id`), distinta da chave `submissionId` da automática (a porta em memória trata mesma chave com outro payload como conflito) — custo se errada: ajustar a porta real na S11.
- Ruling: envio com `publication/publish_orphaned` tem a publicação humana bloqueada (`orphaned`) com aviso; a conciliação é da S11 (tabelas reais) — custo se errada: envio parado até a S11.
- Ruling: texto do pai para `published` passa a "Lista publicada" (neutro para automática e humana; substitui "Publicada automaticamente" da S09); `rejected` com resultado vira fase `ready` com aviso de que a equipe não publicou a lista e a cópia continua utilizável; o pai nunca vê códigos de motivo — custo se errada: retocar textos.
- Ruling: D-030 paga na S10: `cleanText` remove só sequências com forma de tag (`<` + letra, `/` ou `!`) e preserva "< 5 anos"; a proteção contra XSS é a renderização como texto React (varredura contra `dangerouslySetInnerHTML`) — custo se errada: baixo.
- Ruling: D-022 (`addItems` concorrente → 23505) passa à S11: a S10 não chama `addItems` (publica só pela porta); a implementação real da `ListPublisher` é quem precisa serializar — custo se errada: nenhum.
- Ruling: `features/review/` fica só no app (Node/Next), fora de `supabase/functions/_shared`: a revisão humana não roda no worker Deno — custo se errada: mover se algum dia houver decisão humana pelo worker.

## S10 · Task 1 (revalidação e implementação)
- Revalidação (passo 0): `origin/main` = `b905cce` (S09 mesclada; `slice/S10-revisao` @ `8f43b0d` = `main` + plano). Os 7 itens de "Dependências do estado final da S09" conferem: `ports.ts` (`ListPublisher`, `PublishRequest` com `source: "school_upload"` e `actor: { kind: "system" }`, `publishResultSchema` strict, `PortError`/`asPortError`, `PublicationContextReader`), `codes.ts` (28 `REASON_CODES`), 0203 (nomes fixos dos CHECKs, decisões, índices únicos, `ai_record_decision` só `extraction`, `publication_leases`, `auto_publish_enabled default false`; o varredor e o expirador exigem veredito `auto_publish`, então não pegam aprovação humana), composição (`publicationPortsAllowed`, `publicationIsDemo`, publicador memoizado), `list-publisher.contract.ts`. Divergências: nenhuma de contrato. Detalhes que o plano não dizia: (a) `publication_fail`/`publish_failed` só existe uma vez por envio (índice único da 0203), então a S10 grava suas falhas em `kind='review'`; (b) `ai_get_settings` já traz `critical_alerts` e os limiares (`createPublicationSettings` da S09 é reutilizado); (c) o worker/varredor nunca chama `review_*`.
- Ruling: `review_versions` é append-only com UMA exceção: DELETE só quando o envio pai já não existe (cascata da exclusão do envio/conta, D-013); UPDATE/TRUNCATE sempre bloqueados, inclusive em `replica` (`enable always`) — sem isso a exclusão de conta quebraria por FK — custo se errada: trocar por soft-delete na S17.
- Ruling: a "última decisão humana" de um envio é a linha `review` mais recente que não é `edited`, ordenada por `created_at desc, id desc`; as linhas `review` usam `clock_timestamp()` (não `now()`) para a ordem valer também dentro de uma transação. Assim, `publish_failed` seguido de nova edição e nova aprovação vale sem tabela de estado — custo se errada: coluna de sequência.
- Ruling: função extra `review_release_publish` (não estava na lista do plano): falha TRANSITÓRIA da porta solta a lease para "Tentar publicar de novo" não esperar 120 s — custo se errada: botão bloqueado por 2 min.
- Ruling: `review_open` cria a versão 1 com itens mapeados do resultado sem inventar: quantidade fracionária ou fora de 1..9999 vira `null` ("?" na tela e bloqueio de aprovação), categoria ausente vira `null`, alertas de item só dos 7 códigos; resultado com item inválido (nome vazio) → P0002 — custo se errada: aceitar item sem nome.
- Ruling: itens que a equipe editou/adicionou vão à porta com confiança 1 ("conferido"); itens extraídos mantêm a confiança do resultado; `normalizedName` calculado no app com `normalizeName` da S08 (fallback: nome minúsculo) — custo se errada: a S11 pode preferir recalcular.
- Ruling: `approve` isolado usa só os bloqueios intrínsecos + confirmação crítica; "Aprovar e publicar" e a lista de bloqueios da tela usam o portão de publicação (contexto da porta) quando as portas existem; sem portas (staging/produção até a S11) aprova e informa `publish_unavailable` — custo se errada: aprovar sem poder publicar.
- Ruling: bloqueio de contexto detectado NA HORA de publicar (ex.: escola suspensa depois da aprovação) grava `review/publish_failed` com o código do bloqueio e devolve o envio a `human_review` (sem chamar a porta) — custo se errada: envio aprovado parado.
- Ruling: `confidenceBand` recebe `{ confidence, origin }` (não só o número), porque "conferido pela equipe" depende da origem do item — custo se errada: nenhum.
- Ruling: D-071 (Task 1): o read model `getDetail` expõe `publishedBy: 'auto' | 'human' | null` a partir das linhas `publication:published` (automática) e `review:published` (humana), nunca só do status. A troca do texto do pai/escola para "Lista publicada" (neutro) e a remoção de "Publicada automaticamente" ficam na Task 3, como o plano define; enquanto isso `copy.ts`/`ReviewSummary` seguem como na S09 — custo se errada: o texto antigo aparece para aprovação humana até a Task 3.
- Ruling: `SchoolLabelReader` fica em `features/review/school-labels.ts` e só liga com as mesmas condições das portas em memória (`publicationPortsAllowed`); a fixture ganhou `label` opcional (`{ name, inep }` de 8 dígitos, strict) — custo se errada: ajustar na S11.
- Ruling: os testes de banco que confirmam dados (corrida real de dois admins, `tests/review/repository.test.ts`) limpam `ai_decisions` com um helper que desliga e religa o gatilho append-only só em banco local — sem isso `tests/db/ai-decisions.test.ts`, que assume tabela vazia, quebra — custo se errada: nenhum (só teste).
- Ruling: sem SQL de defesa para "alerta crítico exige confirmação": o portão é do serviço (TS, com `ai_settings`); o SQL só valida `reasons ⊆ {critical_alerts_acknowledged}` e os bloqueios intrínsecos — custo se errada: admin com acesso direto ao service role aprova sem confirmar.

## S10 · Task 2 (tela /admin/revisao)
- Ruling: motivo de recusa é `<select>` de `REJECT_REASONS` (sem textarea do Admin05) — texto livre poderia conter dado de menor — custo se errada: trocar por campo livre exigiria coluna/validação nova.
- Ruling: o rascunho do editor e o painel de decisão se ligam por `DraftContext`; com edição não salva "Aprovar e publicar" fica desabilitado ("Salve a edição antes de aprovar") — evita aprovar uma versão diferente da que o admin vê — custo se errada: um clique a mais.
- Ruling: `stale` mantém o rascunho e oferece "Recarregar a versão mais recente" (router.refresh) em vez de recarregar sozinho — não perde o trabalho do admin — custo se errada: nenhum funcional.
- Ruling: a rota do documento assina direto no bucket `list-uploads` (60 s, service role só após `role === 'admin'`), sem novo módulo em features/review (Task 1 intocada); qualquer falha responde o mesmo 404 sem corpo — custo se errada: mover a assinatura para um adapter na S11.
- Ruling: os bloqueios exibidos vêm de `service.blockers(actor, id, false)`; a exigência da confirmação do alerta crítico é deduzida da presença de `critical_alerts_unconfirmed` (fonte única: o portão do serviço) — custo se errada: nenhum.
- Ruling: categoria do item é editável (select de `ITEM_CATEGORIES`), pois `item_category_missing` bloqueia a aprovação e não havia outro meio de corrigir — custo se errada: remover o select.

## S10 · Task 1 (rodada de correções da revisão)
- Ruling: resultado ausente/inválido (inclusive nome com U+2066–2069, que o `cleanText` da S08 aceitava e o SQL rejeita) NÃO deixa o envio preso: `review_open` cria a versão 1 com `items = '[]'` (aprovação bloqueada por `no_items`; o admin recusa ou digita os itens); `CONTROL_CHARS` da S08 passou a incluir U+2066–2069 (mesmo conjunto do SQL/Zod). `parent_copy_open` segue P0002 sem resultado — custo se errada: versão 1 vazia em vez de erro.
- Ruling: publicação humana só checa bloqueadores DEPOIS de ter a lease (`beginPublish` = leased) e solta a lease antes de falhar; `review_publish_fail` devolve `busy` com lease ativa (nunca falha um envio com a chamada de outro admin em voo); `review_complete_publish` com envio já falhado/recusado após uma aprovação humana grava `review/publish_orphaned` (novo valor de `decision`, CHECKs recriados na própria 0204 ainda não aplicada) com as versões da porta e devolve `orphaned`, idempotente; `review_begin_publish` também bloqueia com `review/publish_orphaned`; `review_last_decision` ignora `publish_orphaned`; `hasOrphan` do read model vale para as duas `kind` — custo se errada: ajustar a conciliação na S11.
- Ruling: o SQL (`review_approve`) exige `critical_alerts_acknowledged` quando há alerta crítico e o recusa (22023) quando não há, com a mesma definição de `criticalAlertsIn` (`review_has_critical_alert`: `criticalAlerts` não vazio OU alertas do documento/itens em `ai_settings(default).critical_alerts`, sobre o `ocr_jobs.result` mais recente; teste de paridade TS x SQL em tabela). O SQL prova que `p_actor_id` é UM admin; o service role é totalmente confiável (server-only + `SessionActor` de marca): não há como o SQL provar que o humano confirmou de fato — custo se errada: service role comprometido afirma confirmação.
- Ruling (substitui o da "confiança 1"): a S10 nunca inventa confiança. `PublishItem` ganha, de forma aditiva, `origin: 'extracted' | 'reviewed'` e `confidence: number | null`; itens revisados/adicionados/sem número vão com `confidence: null` e `origin: 'reviewed'`, e `null` nunca vira 1. A S11 decide a exibição — custo se errada: a S11 precisa tratar `null` (suíte de contrato da S09 ganhou o caso).
- Ruling: abas Aprovadas/Recusadas partem das decisões `review` mais recentes (até 300, `desc`) e só então buscam os envios por id/status, em vez de filtrar em memória as 300 linhas mais antigas; `itemCount` vem do `ocr_jobs` mais recente; a fila mostra o motivo (`publish_failed`) do envio devolvido a `human_review`; `cleanText` só remove tag com `>` de fechamento (`Caneta azul<preta` fica); SQL: `grade` e `school_year` são obrigatórios no payload (null explícito) e o nome guardado precisa já estar aparado (limite de 300 aplicado ao valor armazenado) — custo se errada: baixo.
- Dívida: (1) a lease não tem token de dono: a suíte de contrato da S11 deve exigir idempotência concorrente da porta (mesma chave, chamadas simultâneas); (2) `review_versions.actor_id` sem cascade (excluir admin com edições falha; S17/D-013); (3) DELETE por cascata do envio apaga o conteúdo da revisão (S17, LGPD).

## S10 · Task 2 (correções da revisão da UI)
- Ruling: `stale`/`not_reviewable`/bloqueio NÃO revalidam a rota; o editor guarda a versão-base do rascunho e envia sempre ela (nova versão vinda do servidor só troca o rascunho sem edição não salva ou após "Recarregar a versão mais recente"), então uma re-renderização com versão nova nunca apaga o trabalho nem sobrescreve a edição de outro admin em silêncio — custo se errada: um recarregamento explícito a mais.
- Ruling: a existência das portas (`available`) e o modo demonstração (`publicationIsDemo`) são calculados no servidor (`loadPublicationInfo`) e passados ao painel; com envio `approved` humano sem porta o aviso "Publicação indisponível neste ambiente até a integração" é fixo (também no modo somente leitura) e "Publicar" fica desabilitado — custo se errada: nenhum.
- Ruling: o selo "Demonstração" aparece em "Lista publicada.", no subestado "Publicada" da fila e no cabeçalho quando a publicação usa a porta em memória — custo se errada: nenhum.
- Ruling: falha ao calcular os bloqueios desabilita a aprovação com `role="alert"` (antes virava lista vazia = aprovação liberada); item adicionado nasce com quantidade `null`; quantidade fracionária/0/>9999 é recusada por linha no cliente; `beforeunload` com edição não salva; abas mostram "100+" quando a fila truncou; categorias têm rótulos legíveis (`categoryLabel`, valor cru só no `value`); "Aprovar e publicar" fica desabilitado com `publish_orphaned` — custo se errada: baixo.
- Pendência para a S19: o CSP precisa liberar `frame-src` (PDF) e `img-src` (imagem) do host do Storage/rota do documento para o iframe/img de `/admin/revisao/documento/[id]`. Nomes do AdminShell: item de menu "Revisão" e breadcrumb "Admin / Revisão de listas" (Admin05 diz "Listas pendentes") — a S16 unifica a navegação.

## S10 · Task 3 (tela do pai, estados D-071, E2E)
- Ruling: BUG achado no E2E de navegador (os testes de unidade não pegavam): a memoização de `fetch` do React/Next dentro de UMA renderização devolvia a leitura de `review_versions` de antes do `review_open`, então a PRIMEIRA abertura de um envio dava 404 (e os bloqueios falhavam). `createAdminClient({ fresh: true })` (aditivo em `lib/supabase/admin.ts`) passa `AbortSignal` + `cache: no-store` em toda leitura; `features/review/{queries,deps}.ts` o usam — custo se errada: leituras a mais no banco (só admin/pai, baixo volume).
- Ruling: a revisão do pai só existe para `role === 'parent'` dono de envio `source = 'parent'` com resultado; admin, `school_member` e outro pai recebem o mesmo 404 (o SQL confere o dono de novo); a ação `saveParentCopyAction` só chama `parent_copy_save` (teste de varredura: nenhum arquivo do pai cita review_versions/ai_decisions/publicação) — custo se errada: a revisão da escola (Escola09) fica para depois do vínculo `school_members` (D-002).
- Ruling: o envio do pai continua na fila do admin (S09: `parent_submission` sempre revisado); o admin revisa a EXTRAÇÃO, nunca a cópia; a cópia é invisível para a fila, as versões, `ai_decisions` e a porta. O "Montar carrinho" leva a `/carrinho/novo?lista=<copyId>`, que até a S11 mostra o estado honesto ("Lista não encontrada"/"Listas indisponíveis") — custo se errada: link morto até a S11.
- Ruling (D-071): `StatusPayload` ganha `source` e `publishedBy` (linha `publication:published` = `auto`, `review:published` = `human`, lida por service role só depois de a RLS confirmar o dono do envio); "Publicada automaticamente" só com `publishedBy === 'auto'`, senão "Lista publicada"; `approved` = "Aprovada pela equipe; publicação em andamento"; `rejected` COM resultado vira fase `ready` com "A equipe não publicou esta lista como oficial." (+ "Você ainda pode usar sua cópia para montar o carrinho." só para `parent`) — custo se errada: texto neutro quando a leitura de `ai_decisions` falha.
- Ruling: o proxy nega `/admin/*` a não-admin com 403 antes da rota do documento; o 404 da rota fica coberto pelo teste de unidade (o E2E aceita 403 ou 404) — custo se errada: nenhum.
- Dívida (S10): `supabase/migrations/0204` (764 linhas), `tests/db/review-decisions.test.ts` (397) e `scripts/e2e-s10.sh` (324) passam de 250 linhas; refatorar na S18. A 0204 tem número menor que as 0301–0303 já aplicadas no staging (via MCP não importa; `supabase db push` exigiria `--include-all`) — custo se errada: ordem de migrations a conferir antes de qualquer push.

## Trilha Comércio (consolidado de ledger-comercio.md, D-048, S18)

> Movido de `docs/superpowers/ledger-comercio.md` nesta fatia (D-048); conteúdo abaixo é o arquivo original,
> sem reescrever nenhuma frase.

# Ledger da trilha comercio (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`. O orquestrador consolida em ledger.md na S11.


## S12 · Task 1 (migration 0301)
- Ruling: `affiliate_clicks` sem update/delete para o usuário (só select/insert; insert exige carrinho próprio e `profile_id = auth.uid()`) — cliques são registro imutável, cada clique conta — custo se errada: baixo (liberar update por política nova).
- Ruling: `retailers.search_url_template` do Mercado Livre usa host `lista.mercadolivre.com.br` (busca oficial) com `base_url` `www.mercadolivre.com.br`; o banco exige apenas https e `{query}`, e o teste confere o domínio registrável — custo se errada: baixo (ajustar seed).
- Ruling: `price_snapshots.currency` restrito a `BRL` e `product_url`/`target_url` restritos a https por check — sem moeda ou esquema inesperado — custo se errada: baixo (relaxar check).
- Ruling: endurecimento da 0301 após revisão: template exige `/`, `?` ou `#` antes de `{query}` e `{query}` fora do host; clique só para varejista ativo; snapshot sem data futura (>5 min) e `source='demo'` ⇔ `is_demo`; auditoria (`audit_row_change`) em retailers e price_snapshots; `options_snapshot` < 64KB — custo se errada: baixo (relaxar check/política).
- Ruling: a UI de admin nunca renderiza `affiliate_clicks.target_url` como link (só texto): o valor vem de servidor mas é dado de log e não deve virar destino clicável — custo se errada: médio (XSS/redirect a partir de log).

## S12 · Task 2 (motor, provedores, afiliados)
- Ruling: `balanced` = 500·preço + 200·lojas + 200·cobertura + 100·prazo (permil; razões escaladas a 1e6, preço com BigInt), calculado só entre combinações de lojas que cobrem o máximo de itens cotados e em que toda loja é usada; prazo só entra se alguma combinação tem `deliveryDays` da fonte em todas as linhas (as sem prazo pontuam 0 nesse termo), senão o termo sai; desempate: score, menor total, menos lojas, ordem alfabética — nunca oferecer menos itens para baratear, e cobertura fica constante entre candidatas (peso mantido por fidelidade ao spec) — custo se errada: baixo (constantes `BALANCED_WEIGHTS`).
- Ruling: validade de preço 24 h (`DEFAULT_STALE_AFTER_MS`, configurável); data no futuro além de 5 min é tratada como inconfiável e excluída junto com as velhas (`staleExcluded`); cotação sem origem, data inválida, preço não inteiro/≤0 ou `inStock=false` é descartada em silêncio — custo se errada: baixo.
- Ruling: `fewest_stores`/`balanced` enumeram subconjuntos de lojas (2^n), limitados às 12 lojas que mais cobrem itens (`MAX_SUBSET_RETAILERS`); hoje são 4 — custo se errada: baixo.
- Ruling: `local_stationery` escolhe a papelaria (id `local:<uuid>`) com mais itens cobertos e menor total; sem cotação (ou só velha) → `unavailable/no_local_quote` — custo se errada: baixo.
- Ruling: demo só com `DEMO_RETAILERS=1` e `VERCEL_ENV != production` (não NODE_ENV, porque `next start` local roda com production e o E2E precisa do demo); preços demo são fictícios, determinísticos, `is_demo`, origem `demo` — custo se errada: baixo; risco se `VERCEL_ENV` faltar em produção fora da Vercel (documentar no deploy).
- Ruling: destino do redirect valida https, ausência de credenciais, `{query}` único e fora do host, host final igual ao do template e dentro do domínio do `base_url`; query sanitizada (controles, NFC, espaços), truncada em 120 code points e `encodeURIComponent` — custo se errada: baixo.
- Ruling: parâmetros de afiliado: Amazon `tag=`; Mercado Livre `matt_tool`+`matt_word` (suposição a confirmar com o ID real do programa); ID só vale com `[A-Za-z0-9_.-]{1,64}`, senão sem selo — custo se errada: baixo (trocar nome do parâmetro em `affiliate.ts`).
- Ruling: `SnapshotRow.checkedAt` sem `z.coerce` (null virava 1970 e passava como data válida): aceita `Date` válido ou ISO-8601 com offset — custo se errada: baixo.
- Ruling: teste de repositório roda em `pnpm test:db` (config db inclui `tests/cart/repository.test.ts`, exclui-o do `pnpm test`) com usuários reais via Auth local e chaves lidas de `scripts/supa.mjs env` em tempo de execução — custo se errada: baixo.

## S12 · Task 2 · rodada de correção 1
- Ruling: `balanced` troca o termo de cobertura por disponibilidade confirmada pela fonte (linhas com `inStock === true` ÷ itens; desconhecido conta 0), constantes nomeadas `BALANCED_WEIGHT_*`; prazo ausente pontua 0 no termo de prazo (documentado no JSDoc) — a cobertura de preço já é máxima e igual em todas as candidatas, então o termo antigo não decidia nada — custo se errada: baixo (constantes).
- Ruling: demo fail-closed: `DEMO_RETAILERS==='1'` E (`VERCEL_ENV` em preview|development OU (`VERCEL_ENV` ausente E `NEXT_PUBLIC_SUPABASE_URL` em loopback)); produção, ambiente desconhecido e ausência de VERCEL_ENV com Supabase remoto ficam desligados (substitui a regra `!= production` da rodada anterior) — custo se errada: baixo (E2E local precisa da URL loopback ou VERCEL_ENV).
- Ruling: Mercado Livre: `matt_tool` = `MELI_AFFILIATE_ID`; `matt_word` só se `MELI_AFFILIATE_WORD` (opcional, mesmo padrão de caracteres) existir; formato do link do programa segue pendente de confirmação humana (PROGRESS) — custo se errada: baixo (`affiliate.ts`).
- Ruling: overflow (preço x quantidade ou soma) torna a opção `unavailable` com `reason: amount_overflow` em qualquer estratégia (nunca vira "item ausente"); quantidade somada fora do inteiro seguro manda o item para os inválidos; entrada inválida não anula outra válida da mesma chave — custo se errada: baixo.
- Ruling: `staleExcluded` é montado a partir de pares estruturados (loja, item); o texto `<storeId>:<itemKey>` só existe na saída, então `local:<uuid>` não quebra a conferência de frescor — custo se errada: baixo.
- Ruling: desempate de oferta: preço, data mais recente, origem, real antes de demo, url — custo se errada: baixo.
- Ruling: `getPriceSnapshots` filtra `checked_at >= now - 24 h` no SQL e limita 50 linhas mais recentes por item (uma consulta por item, em paralelo) em vez de um limite global de 2000 — custo se errada: baixo (constantes `SNAPSHOT_MAX_AGE_MS`, `SNAPSHOTS_PER_ITEM_LIMIT`).
- Ruling: query de redirect `.`/`..` é recusada (`unsafe_target`) porque `encodeURIComponent` não as escapa e o URL as resolveria como segmento de caminho — custo se errada: baixo.
- Ruling: falha do delete compensatório em `createCart` é anexada ao erro original (mensagem e código do erro dos itens) — custo se errada: baixo.
- Nota para a Task 3 (UI): nunca renderizar `OptionLine.url` como link (só a rota de redirect); mostrar selo de demonstração no total da opção quando qualquer linha tiver `isDemo`.

## S12 · Task 3 (telas, clique, E2E)
- Ruling: o destino do clique é uma busca (`search_url_template`) do varejista pelo nome de UM item; o carrinho não tem "deep link" de várias linhas em varejista algum. O botão da loja abre a busca do primeiro item da loja e cada linha pode ser aberta com `?item=<id do item do carrinho>` (validado contra o carrinho; nunca URL vinda da requisição). A tela Sis02 descreve isso ("abrir a busca por X"), sem contagem regressiva automática (exigiria JS e abriria loja sem clique) — custo se errada: baixo (trocar a cópia/adicionar contagem).
- Ruling: botões que levam a `/ir-para/.../go` são `<a>` simples, não `next/link`: o Link pré-carrega rotas e o prefetch de um Route Handler registraria clique sem ação do usuário — custo se errada: alto (cliques falsos em `affiliate_clicks`).
- (SUBSTITUÍDO na onda final: agora `/carrinho` e `/ir-para` exigem sessão no proxy) Ruling: `/carrinho/**` e `/ir-para/**` não são prefixos protegidos do proxy (S02); as páginas exigem login por `getCurrentUser` + redirect para `/entrar?next=`, e o handler `go` responde 307 ao login. Dono verificado explicitamente (`ownerId === user.id`), além da RLS (admin lê tudo pela RLS, mas não abre carrinho alheio) — custo se errada: baixo.
- (SUBSTITUÍDO na onda final: agora 303 para `?erro=clique`) Ruling: falha ao gravar `affiliate_clicks` no `go` responde 500 sem redirecionar (o registro do clique é requisito; sem ele não há atribuição) — custo se errada: baixo (trocar por redirecionar mesmo assim).
- Ruling: "Já comprei" é marcação só local (localStorage, `useSyncExternalStore`), sem coluna nova; "N de M lojas abertas" vem de `affiliate_clicks` reais do carrinho — custo se errada: baixo.
- Ruling: `/carrinho/novo` só cria o carrinho por Server Action que relê a lista no servidor (`ListReader`); sem `DEMO_RETAILERS` (ou fora da regra fail-closed) não há leitor e a tela diz "listas indisponíveis". O carrinho nasce `is_demo=true` porque o único leitor desta fatia é o de demonstração — custo se errada: baixo (S11 liga o leitor real e define `is_demo`).
- Ruling: horários dos preços exibidos em America/Cuiaba (piloto MT), formato dd/mm/aaaa, hh:mm — custo se errada: baixo.
- Nota: `notFound()` e `redirect()` nas páginas retornam HTTP 200 (streaming sob o `app/loading.tsx` raiz) com a tela 404/login e noindex; só o Route Handler `go` devolve 404/307 reais. O 404 de carrinho alheio é visível ao usuário, não ao código de status das páginas. **[resolvido em chore/soft-404: loadings raiz, de /escolas e de /entrar removidos; os de leads e importações foram para route groups (lista); 404 real provado em docs/superpowers/e2e/soft-404.md]**

## S12 · Task 3 · onda de correção da revisão final
- Ruling: o design (App17) mostra 3 opções (Mais barato, Recomendado, Menos lojas) e o spec pede 4; mantemos as 4 do spec (Mais rápido do design vira "Menos lojas"; "Papelaria local" entra, hoje sempre "indisponível" sem cotação) e o título conta só as opções com preço ("Montamos N opções") — custo se errada: baixo (copy/ordem).
- Ruling: o estado "desatualizado" (`staleExcluded`) nunca aparece na UI: o SQL de `getPriceSnapshots` já corta a janela de 24 h, então preço velho nem chega ao motor; o campo segue no tipo para quando a janela for ampliada — custo se errada: baixo.
- Ruling: o card de opção mostra só total, lojas, prazo e estoque (estoque "indisponível" quando a fonte não trouxe `inStock` em todas as linhas); frete, origem, data/hora e selos ficam no detalhe — custo se errada: baixo (`format.ts`).
- Ruling: "Escolher esta" é Server Action que grava `carts.strategy` e `options_snapshot` numa só atualização (só opção com preço; RLS do dono); o carrinho também grava o retrato ao ser criado; telas usam a estratégia gravada como padrão quando ainda tem preço — custo se errada: baixo.
- Ruling: falha ao gravar o clique no `go` volta (303) à tela `/ir-para/...?erro=clique` com aviso e nova tentativa, com `console.error`; continua fail-closed (não abre a loja sem registro). Substitui o 500 da Task 3 — custo se errada: baixo.
- Ruling: `/carrinho` e `/ir-para` viraram prefixos protegidos do proxy (qualquer papel autenticado exceto `system`), substituindo o Ruling anterior de "não protegidos"; páginas usam `requireAccess` (features/auth/guard.ts); `/carrinho/**` é noindex por layout — custo se errada: baixo.
- Ruling: `LineRow` falha fechado: preço sem origem ou sem data é exibido como "preço indisponível" — custo se errada: baixo.


- Ruling (S13 T1): visão pública `stationery_public` é view definer (`security_barrier`) só com colunas seguras de papelarias `active`, e anon não tem grant algum na base — motivo: RLS filtra linhas, não colunas, então grants por coluna não separam dono de público — custo se errada: trocar a view por `security_invoker` + política extra, sem mudar o contrato.
- Ruling (S13 T1): cadastro (insert de `stationeries`/`stationery_members`) só por `service_role` no servidor; `status`, `status_reason` e `paused_by` só mudam por `stationery_transition` (nem admin nem service_role escrevem direto) — motivo: fecha escalada e permite auditar toda mudança — custo se errada: liberar insert com política própria.
- Ruling (S13 T1): dono escreve catálogo só em `approved|active|paused` (monta o catálogo antes de publicar, não em análise/suspensa/rejeitada); áreas em `signup|accreditation|approved|active|paused` — custo se errada: ajustar lista de estados nas políticas. [SUBSTITUÍDA pela linha 73: `rejected` também permite corrigir cadastro e áreas]
- Ruling (S13 T1): um dono por papelaria e uma papelaria por dono (índices únicos parciais); `staff` existe no enum mas não há convite no MVP.
- Ruling (S13 T2): um dono por papelaria e uma papelaria por dono; cadastro em `/cadastrar-papelaria` (qualquer autenticado); kits por série e Escola11 adiados (dependem da trilha Dados) — custo se errada: baixo.
- Ruling (S13 T2): o repositório usa o cliente de serviço (ignora RLS), então reaplica posse (membro da papelaria) e estado (perfil: signup|accreditation|approved|active|paused; áreas: os mesmos; catálogo: approved|active|paused) em TypeScript antes de escrever — custo se errada: baixo (constantes em `state.ts`). [SUBSTITUÍDA pela linha 73: `rejected` também permite corrigir cadastro e áreas]
- Ruling (S13 T2): preço com um só separador e 3 dígitos depois (`1.234`, `12,505`) é recusado como ambíguo em vez de adivinhado; milhar só com decimais (`1.234,50`) ou vários grupos — custo se errada: baixo (linha volta como erro no relatório).
- Ruling (S13 T2): planilha: separador `,` ou `;` (detectado no cabeçalho), UTF-8 com fallback windows-1252; nome que começa com `= + - @` é recusado (linha com erro), duplicado no arquivo vale a primeira linha; acima de 2.000 linhas ou 2 MB o arquivo inteiro é recusado; o relatório de erros neutraliza fórmulas com apóstrofo — custo se errada: baixo.
- Ruling (S13 T2): `CatalogLocalQuoteProvider` recebe o local (município e bairro opcional) no construtor, porque a porta da S12 não passa local; atende se há área cadastrada no bairro, ou se o bairro é o da própria papelaria; sem bairro, qualquer papelaria `active` do município; validade do preço 30 dias (configurável); `inStock` só quando `in_stock`; nunca devolve `deliveryDays` — custo se errada: baixo.
- Ruling (S13 T2): reenviar o catálogo renova `updated_at` de todos os itens do envio (o dono confirma o preço na data do envio) — custo se errada: baixo.

## S13 · Task 1 · rodada de correção 1
- Ruling (S13 T1): a view definer `stationery_public` é aceita; o advisor `security_definer_view` do Supabase deve acusá-la no staging (esperado) — motivo: RLS filtra linhas, não colunas, e as colunas sensíveis (cnpj, razão social, e-mail, telefone, motivo, LGPD) não podem ser legíveis por não donos; a view só expõe colunas seguras de `active` — custo se errada: trocar por `security_invoker` + tabela pública separada, sem mudar o contrato.
- Ruling (S13 T1): `authenticated` só escreve por coluna: `stationeries` atualiza só colunas cadastrais (sem id, status*, lgpd_*, created_at/updated_at, municipality_id) e `catalog_items` insere/atualiza só nome, chave, preço, estoque e ativo — custo se errada: ajustar o grant da coluna.
- Ruling (S13 T1): `catalog_items.price_updated_at` é a data do preço e só o trigger a escreve (insert e mudança de `price_cents`); estoque e nome não a renovam; reenviar a planilha com o mesmo preço não renova (substitui o ruling S13 T2 de "reenviar renova `updated_at`"); a cotação local e a UI usam `price_updated_at` como `checkedAt` e a validade de 30 dias — custo se errada: baixo (trigger).
- Ruling (S13 T1): papelaria não é apagada: sem DELETE para `service_role`, FK dos eventos `on delete restrict`, sem exceção de profundidade no bloqueio dos eventos. Única exceção estreita: `stationery_discard_orphan` (só `service_role`) descarta o cadastro recém-criado em `signup` sem membro nem evento, para o rollback quando o vínculo do dono falha — custo se errada: baixo.
- Ruling (S13 T1): `stationery_transition` exige `p_actor_id` em `approved`/`rejected` (inclusive `system`) e, se o JWT trouxer `sub`, ele tem de ser igual a `p_actor_id`; o guarda de UPDATE trata `auth_role()` NULL como sem privilégio (falha fechado) — custo se errada: baixo.
- Ruling (S13 T1): `rejected` permite ao dono corrigir o cadastro (colunas cadastrais e áreas, cnpj incluso) para o reenvio `rejected -> accreditation`; catálogo continua fechado em `rejected` — custo se errada: ajustar a lista de estados das políticas.
- Ruling (S13 T1): `approved -> paused -> active` pelo admin é aceito: a papelaria pausada pela equipe volta a `active` só pelo admin (o dono não a reativa), sem passar por `approved` — custo se errada: retirar a aresta `paused -> active` do admin para papelarias que nunca foram `active`.
- Ruling (S13 T3): a aprovação só promove `parent` a `stationery_member`; um `school_member` (ou admin/system) que cadastra papelaria não é promovido, então o cadastro em `/cadastrar-papelaria` recusa papéis diferentes de `parent` com mensagem clara ("use uma conta de responsável") — custo se errada: baixo (guarda no formulário).

## S13 T3 · telas, ações e E2E
- Ruling: só `parent` cadastra papelaria; `school_member`, `admin` e `stationery_member` recebem mensagem na página e na Server Action — a aprovação só promove `parent`, e admin não deve virar dono — custo se errada: liberar mais papéis na action e no texto.
- Ruling: `actorId` e a papelaria do dono saem sempre da sessão (`getUser` + vínculo `owner`); nenhuma action recebe id de papelaria do dono por input; a única exceção é o admin (id da fila), autorizado por papel na action — custo se errada: nenhum (só reforça).
- Ruling: enquanto a papelaria está em signup/accreditation/under_review/rejected o dono (ainda `parent`) acompanha em `/cadastrar-papelaria`, com próximos passos, motivo e histórico; `/papelaria` só existe depois da aprovação — custo se errada: mover o painel de status.
- Ruling: o passo 3 do stepper é "Confirmação" (aceite LGPD e envio), não "Pagamento e plano": não há cobrança nesta fatia e não se inventa plano; o cartão "Primeiros N leads grátis" não entra (N é placeholder do design, sem fonte) — custo se errada: adicionar o passo quando a cobrança (SPEC-2) existir.
- Ruling: o teste do WhatsApp é um link `wa.me` com mensagem de teste que só abre a conversa no aparelho; nada é enviado nem cobrado; o selo "Testado" do Admin09 não é afirmado (a fila mostra "Informado" ou "Não informado") — custo se errada: trocar por verificação real quando houver.
- Ruling: `/cadastrar-papelaria` não entra em `ProtectedPrefix` (o proxy não muda nesta tarefa); a página exige sessão sozinha — custo se errada: incluir o prefixo em `access.ts` e nos testes.
- Ruling: o limite de corpo das Server Actions é 4 MB (`next.config.ts`, valor herdado da S03; o texto anterior dizia 3 MB por engano), porque a planilha aceita 2 MB e o padrão do Next é 1 MB — custo se errada: voltar ao padrão e baixar `CSV_MAX_BYTES`.
- Ruling: relatório de erros do CSV baixável por link `data:` gerado na resposta da action (sem armazenamento), com BOM e células neutralizadas — custo se errada: trocar por Route Handler.
- Ruling: perfil público só usa `stationery_public` e `catalog_items`/`stationery_areas` pela sessão anon/authenticated (RLS), nunca o cliente de serviço; `noindex` — custo se errada: nenhum.
- Preocupação (repository.ts, fora do escopo da T3): `replaceAreas` normaliza bairros para minúsculas, então o nome digitado (ex.: "Jardim Tropical") não é preservado; a tela capitaliza por CSS. Uma coluna de exibição resolveria.
- Preocupação: não há tela para o dono editar razão social, CNPJ e contato depois do cadastro; uma papelaria recusada só pode ser reenviada como está (ou corrigida pelo admin fora do app). Fora do escopo da T3.

## S13 · Task 2 · rodada de correção 2
- Ruling (S13 T2): CNPJ alfanumérico aceito (IN RFB 2.229/2024, CNPJs novos a partir de jul/2026): `[0-9A-Z]{14}`, dígitos verificadores (sempre numéricos) calculados sobre (código ASCII − 48) com os mesmos pesos e módulo 11; entrada em caixa baixa é normalizada; check do banco `^[0-9A-Z]{14}$`; UI aceita letras (`inputMode=text`) — custo se errada: baixo (regex e função de dígitos)
- Ruling (S13 T2): a cotação local busca candidatos pela função SQL `stationery_local_candidates` (só service_role): filtro por município/área, `active`, item ativo e estoque não zerado no banco; devolve jsonb (sem o teto de 1000 linhas do PostgREST) e FALHA (`54000`/`limit_exceeded`) acima de 5.000 candidatos, nunca lista parcial; bairro refinado no domínio — custo se errada: baixo (limite é parâmetro)
- Ruling (S13 T2): cadastro atômico em `stationery_register` (papelaria + dono + áreas + aceite, uma transação; `stationery_discard_orphan` removida); duplo envio do mesmo dono e CNPJ devolve o cadastro existente (`created: false`, a action só redireciona); outro CNPJ para quem já é dono é `already_owner`; CNPJ alheio é `cnpj_taken`; serialização por advisory lock do dono — custo se errada: baixo
- Ruling (S13 T2): aceite LGPD é obrigatório no registro; a versão do texto é a constante `LGPD_TEXT_VERSION` do servidor (o cliente não envia versão); `lgpd_accepted_at` é `now()` do banco; `stationery_record_consent` grava o aceite depois (dono, estados signup/accreditation/rejected) — custo se errada: baixo
- Ruling (S13 T2): todo método do repositório que age em nome de alguém exige `SessionActor` (tipo de marca, criado só por `getSessionActor` = `getCurrentUser` + papel em `profiles`; objeto congelado registrado em WeakSet e conferido em tempo de execução); papel de transição derivado do papel da sessão (admin/system = equipe; parent/stationery_member = dono; `as: "owner"` para admin agindo como dono); todas as Server Actions da T3 usam o helper — custo se errada: baixo
- Ruling (S13 T2): escritas de áreas e catálogo passam por funções SQL (`stationery_replace_areas`, `stationery_upsert_catalog`) que conferem posse e estado sob `FOR SHARE` na mesma transação (sem janela entre checagem e escrita); `updateProfile` filtra o estado na própria escrita e confere linhas afetadas — custo se errada: baixo
- Ruling (S13 T2): erros do banco levam `hint` estável (`forbidden`, `invalid_state`, `precondition_failed`, `actor_invalid`, `reason_required`, `transition_not_allowed`, ...) e o repositório mapeia por hint (SQLSTATE só como reserva), então causas distintas de 22023/23514 têm códigos e mensagens próprias — custo se errada: baixo
- Ruling (S13 T2): bairro tem uma só normalização (`normalizeNeighborhood`: sem acento, minúscula, espaços únicos) usada ao gravar áreas e nos dois lados da cotação; a coluna `stationery_areas.display_name` guarda o texto como o dono digitou e é o que a UI e o perfil público mostram (resolve a preocupação 1 da T3) — custo se errada: baixo
- Ruling (S13 T2): listas de catálogo são paginadas (1.000 por página) até `CATALOG_MAX_ITEMS` = 5.000 e passam disso com erro claro `limit_exceeded`; envio de itens é limitado a 2.000 por chamada — custo se errada: baixo

## S13 · onda final da revisão
- Ruling (S13 revisão): `importCatalogAction` chama `revalidatePath("/papelaria/catalogo")` quando entra ao menos uma linha, e o `ImportForm` troca a URL para `/papelaria/catalogo` (sem `?ok=item`) depois do resultado, então a tabela é relida e o aviso "Item salvo." antigo some — custo se errada: baixo.
- Ruling (S13 revisão): um só shell de admin, `components/admin/AdminShell` (S03), com "Importações" e "Papelarias" no menu e prop `actions` no cabeçalho; `app/admin/layout.tsx` volta a ser só guarda; `PanelShell` fica só para `/papelaria`; `ADMIN_NAV` removido — custo se errada: baixo (ADR-004 §6: layout global só no necessário).
- Ruling (S13 revisão): `?erro=` carrega só CÓDIGO (`cnpj_taken`, `preco_invalido`, `nome_formula`...), mapeado por `BY_CODE` em `features/stationeries/messages.ts` (`errorMessageForCode`); código desconhecido vira a mensagem genérica, nunca eco do texto da URL — custo se errada: baixo.
- Ruling (S13 revisão, adiado): tela de edição do cadastro para papelaria `rejected` (razão social, CNPJ, contato) fica para depois; hoje a recusada só reenvia como está ou é corrigida pelo admin — custo se errada: papelaria recusada por dado errado depende da equipe até a tela existir.
- Ruling (S13 revisão): `ImportForm` recusa arquivo acima de 2 MB no cliente antes de enviar (a action segue conferindo) — custo se errada: baixo.
- Ruling (S13 revisão, migration 0302 editada no lugar, ainda não está no staging): `stationery_areas` dá ao `authenticated` insert só de `stationery_id, neighborhood, display_name` (município vem da papelaria por trigger; sem datas nem id livres); `stationery_register` confere no SQL que o dono tem papel `parent` (`forbidden`); o cadastro manual de item recusa nome que começa com `=`, `+`, `-` ou `@` (como o CSV) — custo se errada: baixo.
- Ruling (S13 revisão, fica de fora): `recordConsent` sem tela (o aceite é obrigatório no cadastro, então a função só serve para dados antigos); editar item pelo nome cria um item novo se o nome mudar (o nome é a chave); o limite de 5.000 candidatos da cotação local conta itens vencidos (a validade é aplicada no domínio depois); `notFound` responde 200 por causa do `app/loading.tsx` global (S00) — custo se errada: baixo cada. **[resolvido em chore/soft-404: loadings raiz, de /escolas e de /entrar removidos; os de leads e importações foram para route groups (lista); 404 real provado em docs/superpowers/e2e/soft-404.md]**
- Para o PROGRESS (orquestrador): tela de edição do cadastro de papelaria `rejected` adiada (Ruling acima).

## S14 · planejamento (leads e WhatsApp)
- Ruling (S14 plano): o "link da lista" da mensagem é `${siteUrl}/papelaria/leads/<code>` (detalhe do lead no painel, exige login de membro da papelaria), não a página pública da lista — lista enviada por pai não tem página pública e o link não carrega dado pessoal; abrir marca `viewed` — custo se errada: baixo (trocar o builder quando existir link curto da S27).
- Ruling (S14 plano): a papelaria não vê nome, e-mail, telefone nem `requester_id` do responsável pela plataforma (grants por coluna); o painel diz "identificado pelo código no WhatsApp" em vez de "[Primeiro nome]" do Pap03 — minimização mais estrita que o Ruling 6 do SPEC-2; o número do pai só chega à papelaria quando ele mesmo envia a mensagem — custo se errada: baixo (expor primeiro nome com consentimento próprio).
- Ruling (S14 plano): "Abrir no WhatsApp" do Pap03 vira "Copiar código" (sem telefone do pai não há conversa para abrir); "Contestar lead", "Confirmação do pai (48 h)", aba "Contestados", "Saldo/Recarregar" e o KPI de saldo ficam para S21/S22 — custo se errada: baixo.
- Ruling (S14 plano): "Vendi" grava `converted` como venda DECLARADA pela papelaria (evento `sale_declared`, valor opcional); a UI diz "Vendido (declarado)"; a regra 2 de 3 da S22 vira atributo de conversão confirmada sem mudar o significado do status — custo se errada: médio (S22 recalcula/renomeia o status).
- Ruling (S14 plano): o evento `created` é o "lead entregue" que a S21 debitará, com `item_count` para a faixa de preço; nenhum débito, saldo ou crédito nesta fatia — custo se errada: baixo (S21 escolhe outro evento).
- Ruling (S14 plano): App08 vira "Minhas cotações" com status por papelaria e valor só quando a papelaria o informou (`quoted_total_cents`, com data); sem "Aceitar melhor oferta" (a compra acontece no WhatsApp); App09 vira confirmação/prévia sem "Aluno", "Entrega" e "Total" (sem fonte); App21 sem distância, prazo, nota, "Parceira da escola", "Parcelado" e "Kit montado" (sem dado) — custo se errada: baixo (copy).
- Ruling (S14 plano): lead exige login e papel `parent`; `/cotacao` entra em `ProtectedPrefix` com os papéis de `/carrinho` — anônimo aumentaria abuso e impede idempotência/limites — custo se errada: baixo.
- Ruling (S14 plano): o lead nasce de um carrinho do próprio solicitante (`?carrinho=`, FK para `carts`, mesma trilha); escola, série e ano vêm da porta `LeadListContextReader` (demo atrás da regra fail-closed da S12; real na S11) e são gravados como snapshot público no lead — custo se errada: baixo (S11 liga o leitor real).
- Ruling (S14 plano): consentimento em `public.consents` (tabela transversal da 0201, já em main) gravado dentro de `lead_create`, com `consent_id` sem FK (FK só na 0600) e cópia da versão/data no lead — custo se errada: baixo.
- Ruling (S14 plano): código `LC-` + Crockford base32 (sem I/L/O/U; entrada normaliza O→0, I/L→1), 4 caracteres, cresce para 5 após 10 colisões seguidas; check aceita 4 a 6 — o design usa "LC-5TJ1", com dígito 1 — custo se errada: baixo.
- Ruling (S14 plano): TTL do lead 7 dias, renovado para `now()+7d` a cada atividade da papelaria; expiração preguiçosa nas transições + `lead_expire_due` chamado por Vercel Cron diário em `/api/cron/leads-expire` com `CRON_SECRET` (Bearer, tempo constante; sem segredo → 503) — o projeto não usa pg_cron e o plano Hobby só agenda diário — custo se errada: baixo (TTL é parâmetro; job pode ir para pg_cron).
- Ruling (S14 plano): anti-abuso no banco: 10 leads/24 h por solicitante, 5 abertos por (solicitante, lista), um aberto por (solicitante, papelaria, lista) e `whatsapp_opened` com dedupe de 60 s; rate limit por IP fica na S19 — custo se errada: baixo (parâmetros com default).
- Ruling (S14 plano): transições da papelaria só com papelaria `active` ou `paused` (suspensa fica congelada, lê o histórico); lead novo só para `active` na área — custo se errada: baixo.
- Ruling (S14 plano): `requester_id` `on delete set null` (a trilha de cobrança sobrevive à exclusão de conta) e `lead_events.actor_id` sem FK (evento é imutável; anonimização na S17) — custo se errada: baixo.
- Ruling (S14 plano): `Pap05-EnviarListas` adiada para depois da S11/S21 (depende do upload da trilha Pipeline e de créditos); o "Pedir pelo WhatsApp" do perfil público (Pap08, S13) continua sem lead (não há lista) — custo se errada: baixo.
- Ruling (S14 plano): sem tela de admin de leads nesta fatia (o PLAN não pede; contagens na S16); admin lê pela RLS e pode cancelar por abuso com motivo — custo se errada: baixo.

## S14 · Task 1 · rodada de correções (migration 0303 editada no lugar, ainda fora do staging)
- Ruling (S14 T1 revisão): `lead_transition` em lead já `expired` devolve `expired` sem erro e sem novo evento (para qualquer ator válido), o MESMO contrato da expiração preguiçosa — o plano previa `transition_not_allowed` para origem `expired`; divergência porque, com job e transição em paralelo, a ordem decidia entre erro e sucesso (teste instável); o repositório compara o status devolvido com o pedido — custo se errada: baixo.
- Ruling (S14 T1 revisão): "atende a área" do `lead_create` usa a regra única da S13 (`servesLocation` + `normalizeNeighborhood`) via `lead_neighborhood_key` (unaccent, espaços juntados, minúscula) nos dois lados; some a regra própria "papelaria sem bairro e sem área atende o município inteiro" (o TS não a tem) — custo se errada: baixo.
- Ruling (S14 T1 revisão): `cart_id` e `lead_events.reason` saem do grant de `authenticated` (a papelaria não liga leads do mesmo responsável nem lê o texto do admin); leitura por service_role no repositório — custo se errada: baixo.
- Ruling (S14 T1 revisão): `lead_create` exige município `is_enabled` (senão `out_of_area`), deriva `is_demo` de papelaria OU carrinho e recusa `p_is_demo` divergente com `invalid_input`; snapshot inválido (ano fora de 2000..2100/nulo, escola ou série em branco ou longa) sai como `invalid_input` — custo se errada: baixo.
- Ruling (S14 T1 revisão): a GUC `app.lead_code_alphabet` fica como gancho SÓ DE TESTE (forçar colisão de código), comentada na função; só service_role executa `lead_create` e o PostgREST não expõe `set_config` — custo se errada: baixo (trocar por parâmetro interno).

## S14 · Task 2 · domínio, repositório, serviço e actions
- Ruling (S14 T2): o repositório de leitura da papelaria usa o cliente da SESSÃO do usuário (RLS + grants por coluna) filtrando explicitamente pelo `stationery_id` da papelaria do dono; o do solicitante usa service_role server-only com `requester_id = actor.userId` e colunas nomeadas (nunca `select *`), porque `cart_id` e `lead_events.reason` não são legíveis por `authenticated` — custo se errada: baixo.
- Ruling (S14 T2): nas operações por código (`transitionLead`, `markViewed`) o `forbidden` do banco vira `not_found` (quem não tem relação com o lead recebe a mesma resposta de um código inexistente; não revela códigos alheios) — custo se errada: baixo (perde a distinção na mensagem).
- Ruling (S14 T2): `canTransition('system', open, 'expired')` está na matriz mas é dependente de tempo (só com `expires_at <= now()`); o teste TS×banco usa lead vencido para o ator `system` e compara "mudou de fato para o pedido" (status final == pedido e != origem), o que cobre o contrato `expired` sem erro — custo se errada: baixo.
- Ruling (S14 T2): município do lead = `context.municipalityId` se o leitor de contexto souber, senão o município da papelaria escolhida (o leitor demo não conhece município; a S11 pode informar o da escola) — custo se errada: baixo.
- Ruling (S14 T2): a mensagem do WhatsApp redige e-mail, CPF e telefone que apareçam DENTRO de escola/série (defesa em profundidade, sem alterar nome de escola normal), recusa texto vazio depois da limpeza e valida o link da lista (`https://<site>/papelaria/leads/<code>`, sem query/âncora/credenciais, origem == `getSiteOrigin()`); a URL final só sai se host `wa.me`, caminho só de dígitos e único parâmetro `text` — custo se errada: baixo.
- Ruling (S14 T2): `openWhatsappAction` redireciona só depois de `recordWhatsappOpen` e reconfere `https://wa.me` antes do `redirect()`; falha ao registrar (venceu agora, encerrado) não entrega o link — custo se errada: baixo.
- Ruling (S14 T2): papéis das ações da papelaria = `stationery_member`, `parent` (dono cadastrado como parent, como em `getOwnerContext`) e `admin`; a autorização final (membro da papelaria do lead) é do banco — custo se errada: baixo.
- Ruling (S14 T2): cron `GET /api/cron/leads-expire`: `CRON_SECRET` com menos de 16 caracteres conta como não configurado (503); Bearer comparado por digest SHA-256 em `timingSafeEqual`; resposta sempre `no-store` e sem eco; `vercel.json` agenda `0 7 * * *` (04:00 em Cuiabá) — custo se errada: baixo.
- Ruling (S14 T2): `LOCAL_QUOTE_FUTURE_TOLERANCE_MS` passou a ser exportado de `features/stationeries/local-quote-provider.ts` para a estimativa do lead usar a MESMA validade de preço da cotação local (única alteração em arquivo da S13) — custo se errada: baixo.
- Ruling (S14 T2): KPI "vendidos na semana"/"vendas declaradas no mês" usam a data do evento `sale_declared` (embutido no select da lista) e ignoram data futura; mês por `Intl` em America/Cuiaba — custo se errada: baixo.

## S14 · Task 2 · rodada de correções da revisão
- Ruling (S14 T2 revisão): o texto de consentimento passa a dizer que a papelaria vê "o bairro informado" (o grant por coluna inclui `neighborhood`) e a versão sobe para `lead-whatsapp-2026-09b`; a mensagem do WhatsApp continua sem bairro (SENDS inalterado) — custo se errada: baixo.
- Ruling (S14 T2 revisão): `cleanLeadText` usa `\p{Cc}\p{Cf}\p{Zl}\p{Zp}` (cobre U+061C, U+00AD, tags) e redige URLs; `computeKpis.declaredMonthCents` é `null` sem venda com valor no mês (a UI mostra "indisponível"); `CreateLeadFormSchema` (morto) removido — custo se errada: baixo.
- Dívida (S14 T2): `CRON_SECRET` com `min(16)` no `lib/env.ts` falha o boot com segredo curto, enquanto o contrato da rota é 503; alinhar depois — baixo.
- Dívida (S14 T2): `listCandidateStationeries` corta silenciosamente acima do limite; mostrar "e mais N" ou paginar quando houver muitas papelarias — baixo.
- Dívida (S14 T2): `features/leads/repository.ts` passa de 600 linhas; dividir (leitura do solicitante, da papelaria, escrita) depois — baixo.
- Dívida (S14 T2): rótulo "últimos 7 dias" dos KPIs vs. `WEEK_MS` rolante; revisar o texto na UI — baixo.

## S14 · Task 3 · telas
- Ruling (S14 T3): `ALLOWED["/papelaria"]` continua `stationery_member` e `admin` (sem `parent`): a aprovação promove o dono de `parent` a `stationery_member` e uma papelaria só recebe lead depois de `active`, então um dono `parent` nunca tem lead a operar; abrir `/papelaria/leads` para `parent` daria acesso ao painel a quem só cadastrou (o 403 da S13 vale) — custo se errada: baixo (incluir `parent` no prefixo e no layout).
- Ruling (S14 T3): a papelaria NÃO cancela lead (a máquina de estados só dá `cancelled` ao solicitante e ao admin); "cancelar" é do App09 (solicitante); no painel ficam Em atendimento, Orçamento enviado (valor opcional), Aguardando cliente, Vendi (valor opcional) e Não fechou (motivo) — custo se errada: baixo.
- Ruling (S14 T3): município das opções do App21 = o da escola quando o leitor de contexto souber; senão o ÚNICO município `is_enabled` (piloto Cuiabá); com zero ou vários, "Cotação indisponível" (não chuta) — custo se errada: baixo (a S11 informa o município da escola).
- Ruling (S14 T3): App21 lista só papelarias `active` que atendem o local (regra única `servesLocation`), com filtros reais Entrega/Retirada (AND) e bairro opcional; o cartão traz nome, bairro, modalidades, pagamentos e a estimativa pelo catálogo (com origem e data) ou "indisponível"; sem distância, prazo, nota, "Parceira", "Parcelado" nem "Kit montado" — custo se errada: baixo.
- Ruling (S14 T3): o consentimento é uma etapa da MESMA página (`?papelaria=<id>` de uma opção listada; id fora da lista é ignorado), com `idempotencyKey` gerada a cada renderização no servidor: reenviar o mesmo formulário devolve o mesmo código — custo se errada: baixo.
- Ruling (S14 T3): KPIs do painel só do que veio inteiro do banco; com mais de 500 leads (`truncated`) todos viram "indisponível" e a lista avisa; rótulo "vendas declaradas, últimos 7 dias" (janela rolante) — custo se errada: baixo.
- Ruling (S14 T3): `RequesterLeadRow` ganhou `isDemo` (coluna `is_demo`, já legível) para o selo "Demonstração" nas telas do solicitante; `RequesterLead` (porta do serviço) não mudou — custo se errada: baixo.
- Ruling (S14 T3): abrir o detalhe da papelaria chama `markViewed` antes de ler e ignora o erro (alheio, vencido, suspensa): a leitura por `stationery_id` da SESSÃO decide o 404, idêntico para código inexistente e de outra papelaria — custo se errada: baixo.

## S14 · Revisão final
- Ruling: Pap02 sem a coluna "Estimado"; "Enviado" mostra o valor informado pela papelaria e "Recebido" o tempo relativo — a estimativa por linha exigiria ler itens e catálogo de até 500 leads na lista (o detalhe já a calcula) — custo se estiver errada: uma consulta agregada (itens dos leads exibidos × catálogo) e uma coluna a mais na tabela.
- Dívida: consentimento deve exibir o bairro que será enviado ("Bairro enviado: X"); redirect de erro de `createLeadAction` perde papelaria/bairro escolhidos; `/cotacao` liberada a papéis que não criam lead (mostrar "só responsáveis pedem cotação"); verificação E2E "B não altera lead da A" deve rodar com o lead ainda `received`; tabela+cartões duplicados no HTML (aceitável, `display:none`); texto do cartão mobile "valor enviado: indisponível"; S14.md seção g só com capturas; evento `whatsapp_opened` visível à papelaria não citado no texto de consentimento (coerente com a atribuição da SPEC-2; citar em uma linha na próxima revisão do texto); item em falta no catálogo como "fora do subtotal (em falta)".

## S27 · planejamento (site público e páginas de sistema)
- Ruling (S27 plano): S27 adiantada na trilha Comércio sem migration; o link curto é determinístico (INEP × código fixo da série, 7 símbolos Crockford + 1 de verificação mod 31), sem tabela, sem ano, sem contador de cliques e sem dado pessoal — o PLAN pede link curto e QR, não métricas; tabela exigiria migration e RLS — custo se errada: baixo (uma migration 0304 com `short_links` pode coexistir, o formato atual continua resolvendo).
- Ruling (S27 plano): rota do link curto é `/l/[code]` (SCREENS.md), não `/r/[shortId]` do subtítulo da Sis01; o estado "Abrindo a lista" não é renderizado porque o redirect é 307 imediato no servidor — custo se errada: baixo (alias `/r`).
- Ruling (S27 plano): o link curto aponta para a lista vigente da escola/série (a página decide o ano padrão), não para um ano fixo — o QR do mural continua válido no ano seguinte — custo se errada: baixo (acrescentar ano ao código mudaria o formato; exigiria versão nova de código).
- Ruling (S27 plano): `/l/[code]` e `/l/[code]/qr` são Route Handlers com 307 (Location relativo, sem depender de Host) e 404/503 reais; a tela de link inválido é HTML estático gerado no servidor — garante status correto sem remover o `app/loading.tsx` raiz (dívida do orquestrador/S18) — custo se errada: baixo (duplica ~40 linhas de estilo da Sis01).
- Ruling (S27 plano): QR gerado no servidor com a biblioteca `qrcode` (só a matriz) e SVG renderizado por código nosso; teste decodifica com `jsqr`; dependências instaladas pelo orquestrador (ADR-004 §5) — custo se errada: baixo (trocar a biblioteca não muda o contrato `qrMatrix`).
- Ruling (S27 plano): "página de redirecionamento para loja" do PLAN já é a `/ir-para` (Sis02) da S12; S27 não cria outra, só a cobre com a suíte de open redirect junto com `/l`, `safeNextPath` e o `wa.me` da S14 — custo se errada: baixo.
- Ruling (S27 plano): App14/App14b são da S04/S06; S27 só acrescenta Open Graph ao perfil e o cartão "Compartilhar esta lista" (link curto + QR) na página pública da lista quando há versão publicada; o painel da escola (Escola10) fica com a trilha Dados — custo se errada: baixo (reusar `ShareListCard` lá).
- Ruling (S27 plano): a landing ocupa `/` (grupo `(site)`) e absorve a busca da App03 (S04) no hero; o botão "Buscar a escola do meu filho" é o envio da busca — `/` não pode ter dois donos e a busca é a ação principal — custo se errada: baixo.
- Ruling (S27 plano): cópias do design trocadas por não terem fonte ou por afirmarem o que o produto não faz: "pronta em minutos" (prazo), "três carrinhos… mais rápido" (a S12 tem mais barato, recomendado, menos lojas e papelaria local), "Alerta Procon / Lei 12.886" (vira sinalização para revisão, sem lei nem Procon, SPEC §6), "Receba em casa"/"Material entregue" (a plataforma não entrega), "A IA compara" (o motor de carrinho não é IA), Magalu/Kalunga (não há varejista cadastrado nem parceria; "Onde comprar" lê `retailers` ativos), "Revisamos e publicamos" (vira "revisamos antes de publicar") — custo se errada: baixo (copy em `features/site/copy.ts`).
- Ruling (S27 plano): "Quanto custa usar?" responde que famílias e escolas não pagam e que links de loja podem gerar comissão sem mudar o preço — nenhum fluxo de cobrança do SPEC/SPEC-2 cobra famílias ou escolas; o placeholder "[condição comercial]" não pode ir ao ar — custo se errada: médio (afirmação pública sobre preço; trocar copy se o modelo mudar).
- Ruling (S27 plano): sem números na landing nesta fatia (nem contagens do banco): contagens do piloto são pequenas e mudariam de sentido; nada de "indisponível" solto em marketing — custo se errada: baixo (a S16 tem as contagens reais, podem entrar depois com fonte).
- Ruling (S27 plano): cartões ilustrativos (hero e celulares do Como funciona) usam itens genéricos, sem preço e com selo "Demonstração" — custo se errada: baixo.
- Ruling (S27 plano): Termos e Privacidade vão ao ar com faixa "Versão preliminar. Texto em revisão jurídica." e placeholders `null` renderizados como "[a definir: …]"; conta = "e-mail ou conta Google"; estudante = apelido e série; exportação/exclusão não são prometidas em Minha conta (S17) — o pedido é pelo contato do encarregado; a S17 é dona da versão final — custo se errada: baixo; pendência humana: razão social, CNPJ, encarregado, retenção e revisão jurídica.
- Ruling (S27 plano): `robots.txt` só libera indexação em produção (`VERCEL_ENV=production` com base válida) e bloqueia prefixos privados importados de `access.ts`, sem bloquear páginas públicas `noindex` (o robô precisa ler o `noindex`); `sitemap.xml` = páginas do site + perfis de escola indexáveis pela regra da S04; nunca listas, papelarias, demo ou `/l/` — custo se errada: baixo.
- Ruling (S27 plano): imagem Open Graph gerada no build por `next/og` com o logo negativo de `public/brand` e a fonte Plus Jakarta Sans (OFL) commitada em `assets/fonts`, sem rede em tempo de build — custo se errada: baixo (trocar por PNG estático).
- Ruling (S27 T1): a landing ganhou o hero com a busca da S04 e os chips de rede (preservam o teste do antigo `app/page.tsx`, que foi removido); o atalho "Minha conta" some (o cabeçalho tem "Entrar") — custo se errada: baixo.
- Ruling (S27 T1): `hasStationeries` da landing exclui papelarias `is_demo` (`stationery_public.is_demo = false`, `limit 1`) — não anunciar "Papelarias do bairro" com base só em demonstração; erro em qualquer consulta → `null` e a faixa "Onde comprar" some — custo se errada: baixo.
- Ruling (S27 T1): Termos e Privacidade usam `LEGAL` (todo `null`) + placeholders `<mark>[a definir: …]</mark>`, seção "Última atualização" no fim (o design a coloca no topo) e faixa "Versão preliminar. Texto em revisão jurídica."; direitos do titular = "fale com o encarregado" (exportação/exclusão em Minha conta é da S17) — custo se errada: baixo.
- Ruling (S27 T1): Como funciona usa "Encontre, Compare, Confira" nos celulares ilustrativos (todos com `DemoBadge`, sem preço, canais genéricos "Loja online A/B" e "Papelaria do bairro"); nota "Lojas exibidas por nome/logos" do design removida — custo se errada: baixo.
- Ruling (S27 T1): cabeçalho aponta âncoras como `/#pais` etc. para funcionar também fora da landing; landing com `revalidate = 3600` e `getPurchaseChannels` tolerante a falha no build — custo se errada: baixo.
- Ruling (S27 T2): QR e `/l/[code]/qr` usam `getSiteOrigin()` estrito (sem fallback local): sem `NEXT_PUBLIC_SITE_URL`/Vercel → 503; o cartão da lista usa `siteBase()` e some se não houver origem — custo se errada: baixo.
- Ruling (S27 T2): `robots.txt` usa prefixos com barra final (`/escola/`, `/papelaria/`), porque `Disallow: /escola` bloquearia também `/escolas` e `/papelarias` (páginas públicas noindex) — custo se errada: baixo (`PREFIXES` exportada de `access.ts`, sem mudar comportamento).
- Ruling (S27 T2): a Open Graph image por escola e por lista é dinâmica (`app/escolas/[inep]/opengraph-image.tsx` e `[serie]`), com nome da escola e série (dados públicos); falha ou escola inexistente cai na imagem genérica; o arquivo de imagem tem precedência sobre `openGraph.images`, então o perfil só declara título/descrição/canonical — custo se errada: baixo.
- Ruling (S27 T2): `listIndexableSchools` pagina de 1000 em 1000 (teto do PostgREST), filtra no banco e reaplica `isIndexableSchool` em código; sitemap com erro de banco lista só as estáticas — custo se errada: baixo.
- Ruling (S27 T2): fonte Plus Jakarta Sans ExtraBold (TTF) e OFL.txt vêm do repositório oficial tokotype/PlusJakartaSans, commitados em `assets/fonts`; a verificação mod 31 não detecta troca `0`↔`Z` (diferença 31), documentada; o destino ainda é validado contra a escola — custo se errada: baixo.
- Ruling (S27 T2): 503 do `/l/[code]` quando a consulta da escola falha (Retry-After 60, sem mensagem do banco) — custo se errada: baixo.
- Ruling (S27 T1 rodada 2): fidelidade ao design: fundos Papel/branco/Tinta/Papel/branco, rodapé Tinta com logo negativo, cabeçalho com nav à direita e "Entrar" com contorno, ícones de check, números grandes Verde Fundo, "Onde comprar" em cartão branco com círculos e legenda, FAQ em 2 colunas com prévia, Como funciona com círculos Verde Certo, setas e celulares (o 3º celular segue claro: o design "Material entregue" prometeria entrega), Sobre com cartão Tinta e símbolo; hero sem campo Bairro (prop `showNeighborhood`, padrão true, S04 intacta) e botão "Buscar a escola do meu filho" — custo se errada: baixo.
- Ruling (S27 T1 rodada 2): "Última atualização" no topo e "Dúvidas" como cartão com ícone de e-mail no fim de Termos e Privacidade (segue o design; substitui o Ruling S27 T1 que os mantinha como seções) — custo se errada: baixo.
- Ruling (S27 T1 rodada 2): cópia reescrita só com o que existe em main: não há "marcar o que já tem" nem conferência por item em nenhuma rota (`grep` em app/components/features). Comprovam: lista item a item com quantidade = `/escolas/[inep]/[serie]` (ItemsTable); opções de carrinho (mais barato, recomendado, menos lojas, papelaria local) = `/carrinho/novo` e `/carrinho/[id]` (S12, enum `cart_strategy`); cotação à papelaria = `/cotacao/nova`; envio de PDF = `/escola/listas/nova` e `/enviar-lista` (S07); links de loja = `/ir-para/[cartId]/[retailer]`. "A IA lê os itens, você só revisa" saiu: a UI de revisão (S08) ainda não está em main; fica "os itens são lidos e revisados antes de a lista ir ao ar" (matriz de estados exige approved antes de published) — custo se errada: baixo.
- Ruling (S27 T1 rodada 2): Privacidade lista só categorias reais do schema (conta: e-mail e display_name; arquivo de lista com escola/série/ano e consentimento; carrinhos e `affiliate_clicks.profile_id`; leads com escola/série/ano/itens/bairro e consentimento) e operadores (Supabase, Vercel, provedor de IA via OpenRouter); "cidade" e "apelido guardado" removidos (não há coluna; estudante = "hoje não há campo"); retenção, base legal e operadores/contratos ficam como `<Placeholder>`; sem afirmar conformidade — custo se errada: baixo; pendência humana: preencher os placeholders e revisão jurídica.
- Ruling (S27 T1 rodada 2): teste de claims amplia a lista negra (R$, gratuidade, economia, "IA compara", velocidade, validação, quantidades vagas e por extenso) e varre cópia, `SITE_PAGES`, metadados, aria-labels e o render com `hasStationeries` true/false; única exceção: a frase do Ruling de custo — custo se errada: baixo.
- Ruling (S27 T1 rodada 2): `/entrar` já redireciona sessão ativa (`redirect(next)` em `app/entrar/page.tsx`); nada a fazer — custo se errada: baixo.
- Dívida/pendência humana (S27): `canonical`/`og:url` só existem com `NEXT_PUBLIC_SITE_URL` (ou Vercel) definido: definir o domínio de produção; a frase "Famílias e escolas não pagam para usar a ListaCerta." é promessa de preço a validar com o humano antes de ir ao ar; 3º celular do Como funciona e alinhamento vertical dos celulares (textos de tamanhos diferentes) ainda simples.
- Ruling (S27 T2 rodada 2): OG dinâmica: texto com glifo fora da fonte (emoji, CJK, nome > 140 caracteres é cortado) cai na imagem genérica em vez de deixar o `next/og` baixar fonte da rede; manchete com `lineClamp: 3` e corpo reduzido por tamanho; `twitter-image` por escola/lista reexecuta a mesma imagem; `revalidate = 3600` — custo se errada: baixo (imagem genérica em nomes raros com caractere fora do Latin).
- Ruling (S27 T2 rodada 2): `siteBase()` devolve null também em `NODE_ENV=production` fora da Vercel sem `NEXT_PUBLIC_SITE_URL` (o cartão Compartilhar some, sem `metadataBase`); o E2E local define `NEXT_PUBLIC_SITE_URL` — custo se errada: baixo.
- Ruling (S27 T2 rodada 2): robots bloqueia também as raízes exatas com `$` (`/escola$`, `/conta$`...), sem tocar em `/escolas`; código curto aceita espaços digitados; teste do QR rasteriza o `d` do SVG. Não feito: fast-check (dependência nova) — o teste de propriedade usa PRNG determinístico com sementes fixas, 300 casos por propriedade.
- Ruling (S27 T3): `buildPageMetadata` declara `/opengraph-image` e `/twitter-image` explicitamente, porque a `openGraph` de página substitui a da raiz e as cinco páginas do site saíam sem imagem — custo se errada: baixo.
- Ruling (S27 T3): o E2E aceita 200 ou 404 (com `noindex`) para escola/série inexistente, pois `app/loading.tsx` faz o streaming começar antes do `notFound()`; corrigir o status é assunto da S18 (S04/loading) — custo se errada: soft 404 tratado por `noindex`.
- Ruling (S27 T3): nomes Amazon/Kalunga/Magalu/Mercado Livre em "Onde comprar" vêm da tabela `retailers` e ficam fora da varredura de claims; Procon e a lei 12.886 seguem proibidos — custo se errada: baixo.
- Nota para a S18: `/escolas` e a página da lista (S04) não têm cabeçalho/rodapé do site nem skip link; alinhar com o layout do site.
- Ruling (S27 fechamento): a nota do E2E sobre `/escolas/...` inexistente responder 200 deixa de valer: a chore soft-404 (#17) removeu o `loading.tsx` que forçava 200; `scripts/e2e-s27.sh` exige HTTP 404 + `noindex` — custo se errada: baixo.
- Ruling (S27 fechamento): E2E rodado no build de produção local (`next start`) e não no preview da Vercel, por causa da proteção de login do preview (Ruling anterior); repetir no preview quando houver bypass — custo se errada: baixo.
- Ruling (S27 fechamento): "Famílias e escolas não pagam" (FAQ "Quanto custa usar?") precisa de validação humana antes de produção; nenhum fluxo do SPEC/SPEC-2 cobra famílias ou escolas, mas é afirmação pública sobre preço — custo se errada: médio.
- Ruling (S27 fechamento): Privacidade cobre também as categorias do S06 (0104_claims: nome, cargo, e-mail de contato, nota, documentos de evidência com hash, versão do texto aceito), credenciamento de papelaria (0302: CNPJ, razão social, endereço, telefone, WhatsApp, e-mail), número do responsável visível à papelaria no WhatsApp e `audit_log.ip_hash` (0001); prazos de guarda de reivindicação e auditoria ficam como placeholders `[a definir]`, sem afirmar conformidade — custo se errada: baixo.
- Ruling (S27 fechamento): `ogText` aceita só o que o cmap da Plus Jakarta Sans ExtraBold cobre (ASCII, Latin-1 sem U+00AD, Latin Extended-A sem U+0149/U+017F, pontuação tipográfica); Latin Extended-B fora (lacunas na fonte) e cai na imagem genérica — custo se errada: baixo (escola com nome nesses caracteres usa a imagem genérica).
- Ruling (S27 fechamento): `/como-funciona` usa container de 1200 px (igual ao cabeçalho/rodapé), não 1400; o 3º celular segue claro (não "Material entregue"), divergência deliberada do design (ver S27 T1 rodada 2) — custo se errada: baixo.
- Ruling (S27 fechamento): o cleanup do `e2e-s27.sh` restaura o build normal (`PRODSIM_DIRTY`) se a fase k for interrompida — custo se errada: baixo.

## S11 · Obrigação vinda do staging (2026-09-25)
- Ruling: a 0601 (S11, Task 2) inclui `create or replace function public.audit_row_change` lendo o pepper de `coalesce(nullif(current_setting('app.audit_ip_pepper', true), ''), (select decrypted_secret from vault.decrypted_secrets where name = 'audit_ip_pepper'))` — o hospedado não permite o GUC de banco; local sem o segredo no Vault segue sem hash (falha fechada); teste de banco cobre GUC, Vault e ausência — custo se estiver errada: `ip_hash` continua nulo no staging (ver D-059)
- Ruling: a chave do Asaas (`ASAAS_*`) já está no projeto Vercel e em `.env.local`; a S21/S23 não a usam para dinheiro real (só sandbox/fake) e revisam o adapter Pix contra a API do Asaas antes do go-live (D-076)

## S11 · Planejamento (plano 2026-09-25-s11-integracao-notificacoes)
Nota: escrito sobre `main` @ `e198162`, antes do merge da S10 (lida só pelo plano e pelos Rulings em `origin/slice/S10-revisao` @ `8f43b0d`, sem código). O Step 0 da Task 1 revalida tudo o que depende do estado final da S10.
- Ruling: a implementação da S11 só começa depois do merge da S10 em `main`; roda no worktree `T3-comercio` (trilha 3, porta 3003, sessões `t3s11-*`), com `slice/S11-integracao` rebaseada sobre esse `main` — a S11 liga portas estendidas pela S10 e recria CHECKs da 0204 — custo se errada: retrabalho de assinaturas se a S10 mudar depois.
- Ruling: três migrations na faixa 06xx: `0600_cross_track_fks.sql` (só FKs, nome fixado pelo ADR-004, rollback próprio), `0601_integration.sql` (perfil `system`, publicação atômica, vínculo da escola, conciliação, `list_kind`) e `0602_notifications.sql` — a regra "uma migration por fatia" cede ao ADR-004, que isola a 0600 para validar contra o staging e desfazer sem arrastar o resto — custo se errada: duas migrations a mais no histórico.
- Ruling: FKs da 0600 = `list_versions.submission_id → list_submissions` (`set null`), `list_submissions.school_id → schools` (`restrict`), `cart_items.list_item_id → list_items` (`set null`), `leads.consent_id → consents` (`set null`); `set null` onde a cascata de `profiles` (exclusão de conta) apagaria a origem e a linha dependente precisa sobreviver — custo se errada: trocar o `on delete` numa migration nova.
- Ruling: sem FK para `carts.list_id`/`leads.list_id` (polimórficas: versão oficial, cópia do pai, demo; ganham `list_kind`), `ai_decisions.*_id` (append-only, polimórficas) e `actor_id`/`approved_by`/`decided_by` (histórico sobrevive ao perfil) — custo se errada: referência órfã devolve "lista indisponível", nunca dado errado.
- Ruling: órfãos antes do `validate constraint`: linha demo em coluna anulável é anulada com `raise notice`; órfão não demo aborta a migration com a contagem (nada de apagar ou corrigir dado real); o orquestrador roda `supabase/checks/0600_orphans.sql` (só SELECT) no staging pelo MCP antes de aplicar; rollback em `supabase/rollback/0600_cross_track_fks.down.sql`, testado localmente — custo se errada: migration parada até investigar.
- Ruling: perfil `system` = usuário técnico em `auth.users` com UUID fixo `00000000-0000-4000-8000-00000000c0de`, sem senha nem identidade, `banned_until = 'infinity'`, e-mail `system@listacerta.invalid`, promovido a `system` pela migration; `system_profile_id()` dá o ator de `list_approve_version`/`list_publish_version` — a 0103 exige `p_actor_id` e `profiles.id` referencia `auth.users`; mudar as funções da trilha Dados para aceitar nulo seria mais invasivo — custo se errada: colunas do GoTrue mudarem entre versões (teste local + conferência no staging antes de aplicar).
- Ruling: `ListPublisher` real = uma função SQL `list_publish_from_pipeline` (transação única, advisory lock por escola × série × ano, `list_versions.publication_key` único + `publication_hash`; replay devolve o mesmo resultado; mesma chave com payload diferente = `idempotency_conflict`); a porta TypeScript só chama a RPC — resolve D-070, D-022 (sem `addItems` concorrente) e dá a idempotência que o singleton em memória da S09 não dava entre app e worker — custo se errada: baixo.
- Ruling: D-068 — lista-alvo em estado cuja transição para publicar a matriz da 0103 não permite é recusada pela porta real (`list_state_conflict`, permanente → `publish_failed` → revisão humana); o motor da S09 não ganha código novo — custo se errada: envio vai à revisão humana a mais.
- Ruling: `validSchoolYears` = ano corrente e o seguinte em America/Cuiaba (constante nomeada, testada) — o SPEC não define a janela e a temporada 2027 começa a ser montada em 2026 — custo se errada: trocar a constante (ou mover para `ai_settings`).
- Ruling: D-002 fechada no banco: `submissions_create` exige vínculo em `school_members` para `source = 'school'` (`42501 school_not_linked`); o seletor de `/escola/listas/nova` mostra só escolas vinculadas e o de `/enviar-lista` usa a busca da S04 (o campo oculto `schoolId` do E2E da S09 sai) — custo se errada: escola sem vínculo precisa reivindicar antes de enviar.
- Ruling: envio sem escola ganha `review_assign_school` (admin, só `human_review`, grava `review/edited` com `school_assigned`) — obrigação da S10 para envio de pai sem escola — custo se errada: baixo.
- Ruling: conciliação de `publish_orphaned` por ação do admin ("Conciliar publicação"): versão encontrada pela `publication_key = submissionId` → `review/published` + `review/reconciled` e envio `published`; não encontrada → `review/reconciled` com `orphan_not_found` e publicação humana liberada; decisão `review/reconciled` nova no CHECK da 0204 — conciliar sozinho arriscaria vincular a versão errada — custo se errada: um clique do admin por órfão.
- Ruling: `ListReader` do carrinho resolve versão oficial publicada/superseded, cópia do pai só do próprio ator (alheia = mesma resposta de inexistente) e demo só com `isDemoEnabled`; ganha `getList` aditivo com `kind` e `isDemo`; carrinho de lista real nasce `is_demo = false` — cumpre a obrigação da S10 ("retomar a leitura do carrinho às cópias do pai") — custo se errada: baixo.
- Ruling: `LeadListContextReader` real: cópia do pai sem escola devolve `null` ("cotação indisponível para esta lista") — nada inventado — custo se errada: pai precisa escolher a escola antes de cotar.
- Ruling: `auto_publish_enabled` continua `false` no seed e nas migrations; o E2E da S11 liga por SQL só no cenário automático e desliga no fim; depois do merge e do E2E verde, o orquestrador liga no **staging** por `update` auditado pelo MCP e registra no PROGRESS; produção decide na S20 (checklist de go-live) — custo se errada: publicação automática no staging com escola sintética; desfazer é um `update`.
- Ruling: eventos de notificação = os fatos dos fluxos do SPEC §6 (o "prompt do responsável" citado no PLAN foi transcrito no SPEC): `submission_ready`, `submission_failed`, `submission_published`, `submission_not_published`, `list_published` (avise-me), `lead_received`, `lead_quote_sent`, `lead_expired`, `claim_updated`, `publication_orphaned` (só admin, in-app) — custo se errada: acrescentar evento ao catálogo.
- Ruling: notificação nasce por gatilho `AFTER` na mesma transação do fato (nunca antes do fato); erro na emissão não desfaz o fato (`exception when others` + contador `notification_emit_errors`); quem causou o fato não é notificado — custo se errada: notificação perdida em bug, visível no contador.
- Ruling: `notifications.params` é lista fechada (`school_name`, `grade_label`, `school_year`, `lead_code`, `status_code`) e o texto é montado no TypeScript de um catálogo fixo; push e e-mail levam só título genérico e caminho do link, sem escola, código ou status (tela de bloqueio) — custo se errada: aviso menos informativo fora do app.
- Ruling: `notification_deliveries` como quarta tabela (uma entrega por notificação × canal, retry, `dead`), além das três do PLAN; `list_watches` como quinta (App24) — o PLAN nomeia as tabelas mínimas; retry idempotente e "avise-me" precisam de estado próprio — custo se errada: baixo.
- Ruling: `in_app` sempre ligado (é o registro na conta, não sai do app); `web_push` e `email` são opt-in por evento; teto de 10 entregas externas por destinatário por hora (excedente `skipped/rate_limited`, a central mantém) — custo se errada: ajustar o teto.
- Ruling: despacho por rota `POST/GET /api/notifications/dispatch` com `NOTIFICATIONS_DISPATCH_SECRET`, chamada por pg_cron/pg_net de 1 min no staging (pendência humana, como o `ocr-worker`), cron diário da Vercel como reserva e "kick" depois das actions; a mesma rota chama `claim_expire_tokens()` (D-047) e apaga notificações lidas com mais de 180 dias (S17 revisa) — custo se errada: push atrasado até o cron diário enquanto o pg_cron não existir (a central não depende do despacho).
- Ruling: e-mail pelo adapter `ResendEmailTransport` (fetch, sem SDK) atrás de `EMAIL_NOTIFICATIONS_ENABLED=1` + `EMAIL_API_KEY` + `EMAIL_FROM`; fora disso `NullEmailTransport`; o mesmo transporte serve o `ClaimTokenSender` de e-mail da S06; conta e credencial são do humano — custo se errada: trocar um arquivo de adapter se o humano escolher outro provedor.
- Ruling: VAPID de dev gerado localmente por `scripts/vapid-dev.mjs` em `.env.local` (recusa `APP_ENV=production`, não imprime a chave privada); testes geram em memória; nenhuma chave commitada (varredura); VAPID real e `VAPID_SUBJECT` são pendência humana — custo se errada: nenhum.
- Ruling: o E2E de push usa um coletor HTTP local em `127.0.0.1` como serviço de push (Chromium sem rede não assina num serviço real); endpoint `http` de loopback só é aceito com `APP_ENV` `local|development` — custo se errada: a entrega real ao FCM/Mozilla só é exercitada no staging com VAPID real.
- Ruling: App24 vira "Me avise" no estado "lista ainda não publicada" da página da lista, com canais que existem no ambiente (central sempre; navegador quando houver VAPID); WhatsApp e e-mail aparecem "indisponível no momento" e sem campo de telefone/e-mail (desvio do App24) — nada de prometer canal desligado — custo se errada: retocar a tela quando os canais ligarem.
- Ruling: central em `/conta/notificacoes` com App16 como referência visual e sino em `/conta`, `PanelShell`, `AdminShell` e `SchoolShell`; o cabeçalho do site e o resto de `/conta` ficam para S15/S18 — custo se errada: baixo.
- Ruling: `SessionActor` unificado na S11 (D-046): `features/stationeries/actor.ts` reexporta `features/auth/actor.ts` — custo se errada: baixo.
- Ruling: D-023 (upload direto por signed upload URL) transferida à S19 — não é integração entre trilhas e mexe no teto de upload/segurança — custo se errada: PDF grande continua exigindo compressão até a S19.

## S11 · Task 1 (revalidação)

Base: `main` @ 02dfe00 (S10 mesclada), já contida em `slice/S11-integracao`. Levantamento de colunas uuid sem FK entre as faixas 01xx/02xx/03xx (0001–0303, inclusive 0203/0204): as únicas soltas continuam sendo as 4 do plano, mais as polimórficas/históricas já decididas. As colunas novas da 0204 (`review_versions.submission_id`, `parent_list_copies.submission_id`, `publication_leases.submission_id`) já nascem com FK para `list_submissions` (cascade); nenhuma FK candidata nova.

- Ruling: `list_kind` NÃO entra na 0600 — o plano a atribui à 0601 (`carts.list_id`/`leads.list_id` seguem polimórficas, sem FK); a 0600 só cria as 4 FKs — custo se errada: baixo (a 0601 acrescenta a coluna).
- Ruling: órfão de `list_versions.submission_id` é demo quando `school_lists.is_demo` da lista; `cart_items` pelo `carts.is_demo`; `list_submissions` e `leads` pela própria linha; `school_id`/`submission_id`/`list_item_id`/`consent_id` são anuláveis, então demo vira null — custo se errada: baixo.
- Ruling: a migration aborta com `23503` e `0600 abortada: órfãos não demo por FK: <col>=<n> ...` antes de anular qualquer demo (tudo ou nada) — custo se errada: baixo.
- Ruling: fixtures de teste que semeavam `school_id`/`submission_id` aleatórios passam a criar escola/envio reais (`ensureSchool` em tests/db/helpers.ts; `cleanupUsers` apaga as escolas 'Escola Fixture' sem uso); asserções "sem FK" de S07/S12/S14 viraram "com FK" (mudança intencional da 0600) — custo se errada: baixo.
- Divergências S10 (itens 1–7 do plano): sem impacto na 0600; conferência das portas/códigos/contrato fica para a Task 2.

## S11 · Task 2 (0601, portas reais, perfil system, vínculo da escola, conciliação)

Passo 0 (revalidação contra `main` @ 02dfe00, S10 mesclada). Divergências do plano encontradas e resolvidas:
- `PublishItem.origin` e `confidence` nula (S10) não tinham coluna em `list_items`: a 0601 acrescenta `list_items.origin` (`extracted|reviewed`, default `extracted`); a coluna não entra nos grants públicos.
- O teste da S10 varre as funções `review_%`/`parent_copy_%` e proíbe `school_lists|list_versions|public.schools` no corpo: `review_assign_school` NÃO consulta `schools`; a existência da escola vem da FK da 0600 (`foreign_key_violation` → `22023 school_not_found`).
- `review_last_decision` passou a excluir também `reconciled`; `review_begin_publish` e `review_complete_publish` foram recriados (corpo da 0204, só a linha do órfão muda para `publication_orphan_pending`), então a S10 continua igual sem órfão.
- `hasOrphan` (tela da revisão) virou "órfão pendente" (`publish_orphaned` mais novo que a última conciliação), mesma regra do SQL.
- Ruling: as portas reais valem sempre que há cliente de serviço; a memória só vence com `FAKE_PUBLICATION_FIXTURE` válido + `APP_ENV` `local|development` (nunca preview/staging/produção); os testes "portas nulas" da S09 viraram "portas reais, nunca nulas nem em memória" — custo se errada: baixo (só a expectativa do teste mudou; nenhuma asserção de segurança foi afrouxada).
- Ruling: `list_publish_from_pipeline` aceita lista nova (`draft`, percorre submitted → processing → approved com o ator), `approved` e `published` (troca de versão); lista em `submitted|processing|processing_async|review_needed|human_review|rejected` → `list_state_conflict` (D-068), `archived` → `list_archived` — custo se errada: envio a mais na revisão humana.
- Ruling: `submission_id` da versão só é gravado se o envio existir (a publicação sem envio de origem, como o contrato da S09, fica com `null`); lista demo x envio real (ou o inverso) → `demo_mismatch` — custo se errada: baixo.
- Ruling: hash da chave = sha256 do payload canônico (escola, série, ano, origem e itens; sem `submissionId` nem ator, como a memória da S09); o replay devolve o mesmo `previousVersionId` (coluna `publication_previous_id`) — custo se errada: baixo.
- Ruling: dois locks advisory em ordem fixa (chave, depois lista) serializam chaves iguais e chaves diferentes da mesma lista; sem `23505` (D-022 resolvida).
- Ruling: erros permanentes da função saem com `hint` estável (`invalid_request`, `invalid_items`, `no_items`, `invalid_actor`, `system_profile_missing`, `school_not_found`, `school_suspended`, `grade_unknown`, `demo_mismatch`, `idempotency_conflict`, `list_archived`, `list_state_conflict`); qualquer outro erro (rede, 40001, 40P01, timeout) é transitório — custo se errada: hint novo precisa entrar na lista da porta.
- Ruling: `cart_quantity`: item sem quantidade vale 1 e fracionário sobe ao inteiro (`cart_items.quantity` é inteiro) — nunca inventa mais que o mínimo comprável; custo se errada: baixo.
- Ruling: `carts.list_kind` é informativa (a leitura resolve o id no servidor); `leads.list_kind` é herdada do carrinho por gatilho `BEFORE INSERT` (a `lead_create` da S14 ficou intacta); `cart_items.list_item_id` só recebe o id de item de versão OFICIAL (a FK da 0600 recusaria cópia do pai e demonstração) — custo se errada: baixo.
- Ruling: D-002 estrita: nem o admin sem vínculo em `school_members` envia como escola (`42501 school_not_linked`); família escolhe qualquer escola pública (busca da S04, conferida no servidor) e segue como envio de família — custo se errada: admin que precise enviar pela escola cria o vínculo antes.
- Ruling: conciliação só acha a versão pela chave do próprio envio (`publication_key` = id do envio ou id de uma versão da revisão dele); versão registrada no órfão que não bate com essas chaves não é vinculada — custo se errada: um `orphan_not_found` a mais para o admin resolver.
- Ruling: `audit_row_change` lê o pepper do GUC e, sem ele, do Vault (`audit_ip_pepper`) só quando há IP; falha fechada (Vault ausente, sem permissão ou segredo vazio = sem hash) — custo se errada: IP sem hash no audit_log (nunca hash sem pepper).
- Risco de versão registrado (GoTrue hospedado): o insert em `auth.users` usa só `id, aud, role, email, encrypted_password (null), banned_until ('infinity'), raw_app_meta_data, raw_user_meta_data`, tokens `''` e timestamps; o orquestrador confere as colunas de `auth.users` no staging antes de aplicar (o teste local prova só o GoTrue local).
- Ruling: a cotação local do carrinho (D-045) usa o município da escola da lista (oficial ou cópia do pai com escola); falha da fonte local degrada para "cotação local indisponível" (log só com código) — custo se errada: baixo.
- Ruling: teste do worker (D-065) roda a Edge Function sob Node com o alias de teste `npm:@supabase/supabase-js@2` → `tests/stubs/deno-supabase-js.ts`; o código do worker já respondia 200 com `pipeline_unavailable` — sem mudança de comportamento.
- Nota de processo: os testes de banco foram escritos antes da migration, mas a execução "vermelha" antes de criar a 0601 não foi registrada (a primeira execução foi contra a migration já aplicada).

## S11 · Task 2 (correções da revisão de segurança)
- Ruling: `banned_until` do perfil system = '2999-01-01' e `instance_id` nulo-uuid preenchido — 'infinity' derruba o listUsers do GoTrue hospedado e sem `instance_id` o GoTrue local nem enxergava o usuário; testes exigem login por senha 400/401 e getUserById/listUsers 200 no GoTrue local; o GoTrue pode regravar `raw_app_meta_data.provider` após um pedido de OTP (usuário segue banido, código recusado no verify) — custo se errada: baixo.
- Ruling: o ator system só publica `school_upload` de um envio existente da escola (mesma escola, série e ano) cujo remetente tem vínculo em `school_members`; recusas fechadas `invalid_source`, `submission_mismatch`, `sender_not_linked` (admin, publicação humana da S10, não depende disso) — o motor automático nunca publica lista de pai, e a chave/lista não podem ser forjadas com um envio alheio — custo se errada: envio legítimo recusado vai à revisão humana.
- Ruling: o dono do carrinho só atualiza `strategy` e `options_snapshot` (grant de UPDATE por coluna); `is_demo`, `list_kind`, `list_id` e `owner_id` são do servidor; o lead deriva `is_demo` do contexto lido no servidor (`context.isDemo && !isDemo` é recusado e o carrinho só pode elevar a demo) — custo se errada: baixo (o INSERT do carrinho pelo cliente segue como na S12; não baixa demo de lista demo).
- Ruling: `leads_set_list_kind` sem SECURITY DEFINER e `enable always` — só herda `list_kind` do carrinho, roda no contexto da `lead_create`, e `replica` não a desliga — custo se errada: baixo.
- Ruling: `review_assign_school` (via `school_assignable`, fora do prefixo review_) e `lead_list_context` recusam escola suspensa e município desabilitado (hints `school_suspended` e `municipality_not_enabled`; contexto nulo) — nada de lead ou atribuição para escola fora do piloto — custo se errada: baixo.

## S11 · Task 3 (notificações: 0602, Notifier, Web Push, e-mail por flag, despachante)
- Ruling: a flag de e-mail no BANCO é a tabela de uma linha `notification_settings.email_enabled` (padrão `false`, sem acesso a `authenticated`); o gatilho só enfileira e-mail com ela ligada E preferência do dono; o envio ainda exige `EMAIL_NOTIFICATIONS_ENABLED=1` + chave + remetente — custo se errada: ligar em dois lugares.
- Ruling: `ResendEmailTransport` por `fetch` (sem SDK) atrás de `NullEmailTransport` (padrão, nunca toca a rede); assunto genérico do catálogo e link relativo com a origem do site, sem params — custo se errada: trocar um arquivo de adapter.
- Ruling: `notifications.link_path` aceita `A-Za-z0-9/_?=&.%-` (o código do lead é maiúsculo: `/cotacao/LC-…`), sem `//`; o push leva só título genérico e esse caminho (o caminho de lead contém o código do pedido, inevitável para abrir a tela) — custo se errada: baixo.
- Ruling: teto de 10 entregas externas por hora e destinatário na emissão (excedente `skipped/rate_limited`); retry exponencial 1, 2, 4, 8 min e `dead` na 5ª tentativa dentro de `notification_mark_delivery`; lease de 60 s no claim (`for update skip locked`) — custo se errada: ajustar constantes numa migration.
- Ruling: `claim_updated` leva para `/escolas/<inep>/reivindicar` (a página de status da S06 é essa rota) e uma chave por (reivindicação, status); `submission_ready` só nasce de `processing_async` (o envio síncrono não gera aviso); `list_published` só para quem tem `list_watches` da (escola, série, ano) — custo se errada: baixo.
- Ruling: `push_subscriptions.endpoint` aceita `https` e `http` de loopback no CHECK (o banco não conhece `APP_ENV`; a action da Task 4 recusa loopback fora de local/development); assinatura criada só por `push_subscription_upsert` (service role) — custo se errada: baixo.
- Ruling: rota `/api/notifications/dispatch` (POST e GET) aceita `NOTIFICATIONS_DISPATCH_SECRET` ou `CRON_SECRET` (16+ caracteres, comparação em tempo constante; sem nenhum → 503, errado → 401) e a cada ciclo chama `claim_expire_tokens()` (D-047), despacha e apaga notificações LIDAS com mais de 180 dias; cron diário da Vercel às 08:00 — custo se errada: push atrasado até o cron enquanto o pg_cron de 1 min não existir (pendência humana).
- Ruling: `scripts/vapid-dev.mjs` grava o par VAPID de desenvolvimento só no `.env.local` (ignorado pelo git; modo 600), recusa produção e nunca imprime a privada; varredura de testes impede chave VAPID/`re_…` no repositório — custo se errada: nenhum.
- Ruling (escopo): ficam para a Task 4/5 ou para o humano: `features/notifications/{preferences,queries}.ts` (central e preferências), a extensão do `ClaimTokenSender` para e-mail real, o kick opcional do `ocr-worker` (`NOTIFY_DISPATCH_URL`) e `lib/env.ts` (as variáveis novas são lidas direto de `process.env` em `service.ts`, com validação de formato) — custo se errada: baixo.
- Nota de processo: testes de banco e de domínio escritos antes da 0602 e do código; execução vermelha registrada em /tmp/red3.log (23 falhas de banco, 3 arquivos de domínio sem módulo).

## S11 · Task 3 (correções da revisão de segurança)
- Ruling: anti-SSRF do Web Push em três camadas com a MESMA regra (CHECK de `push_subscriptions`, Zod da action e `WebPushNotifier` antes de enviar): só https em `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com` e `*.notify.windows.com`, sem IP, porta, credencial ou host interno; loopback http só com `APP_ENV` local/development (o CHECK aceita loopback porque o banco não conhece `APP_ENV`); endpoint inválido no notificador é revogado, nunca chamado — custo se errada: um serviço de push novo exige acrescentar o host nas três camadas.
- Ruling: `push_subscription_upsert` limita a 5 assinaturas ativas por perfil (`subscription_limit`) e RECUSA endpoint que já pertence a outro perfil, revogado ou não (`endpoint_owned`) — custo se errada: usuário que trocou de conta no mesmo navegador cancela a assinatura antiga antes.
- Ruling: envio com `timeout` de 5 s por assinatura, lote de 10 e orçamento de 25 s por ciclo (o que sobra volta pela lease de 60 s) — custo se errada: ajustar constantes.
- Ruling: lease com dono: `notification_claim_deliveries` devolve `leaseId` e `notification_mark_delivery(id, lease, ...)` só marca com o token vigente (marcação atrasada devolve `false`); no claim, `sending` vencido com 5 tentativas vira `dead/lease_expired` — custo se errada: baixo.
- Ruling: `authenticated` perde o UPDATE de `notifications` (sem grant nem policy); marcar como lida é só `notifications_mark_read` (grava `now()`, service role, dono da sessão) — custo se errada: baixo.
- Ruling: o kick só envia o Bearer para a origem configurada válida (https, ou http de loopback; sem credencial, caminho, query nem hash) e não segue redirect — custo se errada: baixo.
- Ruling: `notification_purge_old` também apaga `notification_emit_errors` com mais de 90 dias e entregas `dead/sent/skipped` com mais de 90 dias; `list_watches` usa `on delete cascade` para escola e série (não trava reimportação) — custo se errada: inscrição de acompanhamento some com a escola.
- Ruling: o service worker e a UI não exibem a URL do link (o `data.url` só é usado no clique) — custo se errada: baixo.

## S11 · Task 4 (central de notificações, preferências, push no navegador, avise-me)
- Ruling: central em `/conta/notificacoes` (Server Component, `force-dynamic`, `noindex`): lista do dono (não lidas primeiro, 20 por página), "Marcar como lida"/"Marcar todas" só por `notifications_mark_read` com o perfil da SESSÃO (o `id` do formulário é só o alvo), preferências evento × canal, `PushOptIn` e acompanhamentos (`list_watches`); sino no layout de `/conta`; os sinos de `PanelShell`, `AdminShell` e `SchoolShell` ficam para a S15/S18 — custo se errada: baixo.
- Ruling: texto da central = catálogo + params validados pela lista fechada e renderizado como texto React (nunca HTML); param inválido é descartado; link inseguro vira só título sem link; o service worker mostra só o título genérico e nunca a URL (o `data.url` só é usado no clique; URL insegura abre a página inicial) — custo se errada: baixo.
- Ruling: ligar canal só com canal REAL no ambiente (`channelAvailability`: VAPID público; e-mail = flag + chave + remetente); desligar sempre permitido; e-mail aparece "indisponível no momento" e navegador "indisponível neste ambiente" — nada de prometer canal desligado — custo se errada: baixo.
- Ruling: `PushOptIn` só pede permissão depois do clique; negada = mensagem e nada gravado; sucesso grava a assinatura pela action (Zod: host de serviço de push conhecido, loopback http só local/development, chaves base64url) e NÃO liga preferências sozinha (a pessoa escolhe os eventos) — custo se errada: um clique a mais.
- Ruling: App24 "Me avise" no estado "lista ainda não publicada" da página da lista (S05): sem login leva a `/entrar?next=`; canais reais listados (central sempre; navegador só com VAPID); WhatsApp e e-mail "indisponível no momento" e SEM campo de telefone ou e-mail (desvio do App24) — custo se errada: retocar a tela quando os canais ligarem.
- Ruling (escopo): ficam fora da Task 4, por dependerem de outras telas: a frase de aviso na página de status da reivindicação (S06) e o ajuste de `AsyncOptions` (S07) — o texto atual do S07 não promete canal desligado hoje e a central já recebe o aviso; registrar como dívida no DEBT.md pelo orquestrador — custo se errada: baixo.
- Nota de processo: testes escritos antes do código; vermelho em /tmp/red4.log (4 arquivos sem módulo) e /tmp/red4b.log.

## S11 · Task 5 (E2E de ponta a ponta, interruptor por dado e documentação)
- Ruling: o E2E da S11 roda no build de produção local da trilha 3 (`next start -p 3003`) contra o Supabase local, com provedor de IA FALSO (`FAKE_AI_SCRIPT`, `APP_ENV=local`, trava de custo que aborta se `OPENROUTER_KEY`/`AI_MODEL_*` estiverem no shell) e portas de publicação REAIS (sem `FAKE_PUBLICATION_FIXTURE`); o preview da Vercel continua sem build verde (D-058) — custo se errada: a infraestrutura da Vercel só é exercitada na S20 (D-049).
- Ruling: `ai_settings.auto_publish_enabled` é ligado por SQL só no banco LOCAL e só dentro do roteiro (o seed continua `false`; o script confere o valor inicial e desliga no `trap` de saída, mesmo em falha) — custo se errada: nenhum (o staging não é tocado; ligar lá é decisão do orquestrador após o merge).
- Ruling: a verificação "7f" do roteiro herdado estava invertida: o responsável de seed (`…00a2`) é exatamente quem clicou "Me avise" no 5º ano, então receber `list_published` é o comportamento certo; a verificação passou a ser "só quem tem `list_watches` da (escola, série, ano) recebe `list_published`" e "o watcher recebe uma vez" — custo se errada: baixo (SQL do roteiro).
- Ruling: `login()` do roteiro tolera sessão já autenticada (`/entrar` redireciona sessão ativa para `next`, Ruling da S27), em vez de forçar novo link mágico; foi isso que travou a execução parcial anterior no passo 7 (`#email` não existe após o redirect) — custo se errada: baixo.
- Ruling: segredos do E2E (`WORKER_SHARED_SECRET`, `NOTIFICATIONS_DISPATCH_SECRET`) nascem de `openssl rand` em `/tmp`, entram no app/worker por variável de ambiente do processo e são apagados no fim; nada em `.env.local` nem no repositório — custo se errada: nenhum.
- Ruling: o roteiro cobre pela UI o que o build local permite sem VAPID: publicação automática real pela escola vinculada (2 envios da mesma série → versão nova e anterior `superseded`, `publication_previous_id`), lista pública, App24 "Me avise" (anônimo → `/entrar?next=`; logado → `list_watches`), carrinho oficial real (`list_kind=official`, `is_demo=false`), lead real com escola/série/ano, os 5 eventos gerados (`submission_published`, `lead_received`, `lead_quote_sent`, `submission_ready`, `list_published`), central (lista, "Nova", marcar lida, acompanhamentos, canais "indisponível"), OCR assíncrono pelo worker com portas reais no Deno, RLS por JWT (`set local role authenticated` + `request.jwt.claims`, mesma técnica dos testes de banco), ausência de entrega externa, e a rota `/api/notifications/dispatch` (503/401/200 por curl). NÃO cobre pela UI: (a) push com coletor local e payload cifrado, (b) "Aprovar e publicar" do admin com `review_assign_school`, (d) cópia do pai no carrinho e "lista não encontrada" para outro pai, (f) conciliação de órfão — todos cobertos por testes de banco/unidade das Tasks 2–4 e registrados como dívida para o E2E no preview — custo se errada: um defeito de UI nesses quatro fluxos só aparece na S20 ou no uso.
- Ruling: D-002 negativa (perfil sem vínculo em `school_members` enviando como escola) é provada pela função `submissions_create` direto no SQL (`42501 school_not_linked`, nenhuma linha criada), porque a UI da escola só lista escolas vinculadas e não há segundo perfil de escola no seed — custo se errada: baixo (a UI não tem caminho para enviar sem vínculo; se um dia tiver, o teste de banco da Task 2 continua cobrindo).
- Ruling: os três PNGs idênticos da execução parcial anterior (mesmo MD5: a tela de redirect do passo 7 capturada três vezes) foram substituídos pelas capturas desta execução; nenhuma captura é reaproveitada entre execuções — custo se errada: nenhum.
- Ruling: `supabase/functions/ocr-worker/README.md` e o comentário do `index.ts` que diziam "a publicação real é da S11 / sem fixture todo envio vira human_review" foram corrigidos para o estado atual (portas reais sempre que há cliente de serviço; memória só com `FAKE_PUBLICATION_FIXTURE` + `APP_ENV` local|development) — só documentação — custo se errada: nenhum.
- Ruling: a Task 5 não edita `PROGRESS.md`, `DEBT.md` nem `ledger.md` (a consolidação D-048 e o fechamento da fatia são do orquestrador, depois da revisão, para não conflitar com os PRs de docs que atualizam esses arquivos a cada merge); o bloco de dívida abaixo já está no formato do DEBT.md — custo se errada: um commit de docs a mais pelo orquestrador.

## S11 · Dívida (bloco pronto para o DEBT.md; IDs a atribuir pelo orquestrador a partir de D-075)
| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-0xx | ledger-comercio S11 T3 revisão / T5 | `push_subscription_upsert` (0602): o teto de 5 assinaturas ativas só é conferido no INSERT; reativar um endpoint próprio revogado (`found` + mesmo dono) não conta, então um perfil pode passar de 5; e não há lock por perfil, então duas inscrições simultâneas de aparelhos novos podem ler `count = 4` e ambas inserir (6 ativas). Corrigir com `pg_advisory_xact_lock(hashtext(p_profile_id::text))` e a contagem também no ramo de reativação | média | S19 | aberta |
| D-0xx | ledger-comercio S11 T3 revisão | Endpoint de push revogado não pode ser reatribuído entre contas no mesmo aparelho (`endpoint_owned` vale mesmo com `revoked_at` preenchido): quem sai de uma conta e entra em outra no mesmo navegador não consegue ligar o aviso até o endpoint do navegador mudar; decidir entre transferir endpoint revogado ou orientar "desativar antes de sair" | média | S17 | aberta |
| D-0xx | ledger-comercio S11 T4 / T5 | `PushOptIn` guarda o endpoint só em estado React: após recarregar a página o botão volta a "Ativar" mesmo com assinatura ativa (não consulta `pushManager.getSubscription()`), e "Desativar" só revoga no servidor sem chamar `sub.unsubscribe()` no navegador (o navegador continua inscrito no serviço de push) | média | S18 | aberta |
| D-0xx | ledger-comercio S11 T3 revisão / T5 | Endpoint de push: o Zod (`isAllowedPushEndpoint`) valida via `new URL()`, que normaliza host em maiúsculas e porta `:443` implícita, mas o CHECK de `push_subscriptions.endpoint` valida a string crua e recusa esses casos (`22023`/`23514` → "Não foi possível ativar"); normalizar `u.origin + u.pathname + u.search` antes de gravar ou alinhar o CHECK | baixa | S19 | aberta |
| D-0xx | ledger-comercio S11 T4 | Sino de notificações só no layout de `/conta`; `PanelShell` (papelaria), `AdminShell` e `SchoolShell` ficam sem o contador de não lidas | baixa | S15 / S18 | aberta |
| D-0xx | ledger-comercio S11 T4 | Página de status da reivindicação (S06, `/escolas/<inep>/reivindicar`) não diz que a mudança de status também chega na central de notificações (evento `claim_updated`) | baixa | S16 | aberta |
| D-0xx | ledger-comercio S11 T4 | `AsyncOptions` (S07, tela "continuar aguardando") não oferece "Ativar notificação do navegador" nem aponta para `/conta/notificacoes`; hoje só diz que o resultado aparece na conta | baixa | S18 | aberta |
| D-0xx | ledger-comercio S11 T3 escopo | `ClaimTokenSender` (S06) ainda não usa o `ResendEmailTransport` da S11: o link de reivindicação por e-mail continua sem envio real até o humano fornecer conta/credencial (`EMAIL_NOTIFICATIONS_ENABLED`, `EMAIL_API_KEY`, `EMAIL_FROM`) e a S16/S19 ligar o transporte | média | Humano / S16 | aberta |
| D-0xx | ledger-comercio S11 T3 escopo | `ocr-worker` sem "kick" opcional do despachante (`NOTIFY_DISPATCH_URL`): a notificação `submission_ready` gerada pelo worker só sai por push/e-mail no próximo ciclo do cron (1 min com pg_cron; diário só com a Vercel) — a central não depende disso | baixa | S19 | aberta |
| D-0xx | ledger-comercio S11 T5 | E2E da S11 não exercita pela UI: push com coletor local (payload cifrado, cabeçalhos VAPID, `notification_deliveries` `sent`), "Aprovar e publicar" do admin sobre envio com `review_assign_school`, cópia do pai em `/carrinho/novo?lista=<copyId>` (dono vs. outro pai) e "Conciliar publicação" de órfão; cobertos por testes de banco/unidade; repetir no preview da Vercel com VAPID de staging | média | S20 (E2E no preview) | aberta |
| D-0xx | ledger-comercio S11 T5 | Sem VAPID e sem e-mail no ambiente do E2E, as preferências mostram todos os canais externos "indisponível"; a entrega real ao FCM/Mozilla/Apple nunca foi exercitada (só o `WebPushNotifier` com chaves em memória nos testes) | média | Humano (VAPID de staging) / S20 | aberta |
| D-0xx | ledger-comercio S11 T5 (E2E) | `list_publish_from_pipeline` cria `school_lists.is_demo` a partir do ENVIO (`coalesce(sub.is_demo,false)`), não da escola: envio real de escola `is_demo` gera lista `is_demo = false` (a página pública ainda mostra o selo pela escola, mas carrinho/lead derivam `is_demo` da lista); a lista de escola demo deveria nascer demo (ou `demo_mismatch` deveria comparar com a escola) | média | S19 | aberta |
| D-0xx | ledger-comercio S11 T5 | `pnpm test:db` supõe banco recém-`db:reset` (`schools` vazia, rotas padrão de `ai_settings`); rodar depois de um E2E que semeia dados dá 23 falhas ambientais. Documentar no README/PROGRESS ou fazer a suíte limpar o que usa | baixa | S18 | aberta |
| D-0xx | ledger-comercio S11 T5 | Roteiros E2E (S09, S10, S11) compartilham ~40 linhas de helpers (`ab`, `sql`, `login`, `wait_text`, `clicktext`) copiadas entre scripts; extrair `scripts/e2e-lib.sh` | baixa | S18 | aberta |
| D-0xx | ledger-comercio S11 T5 | `docs/superpowers/e2e/S14.md` termina com a tabela da seção g vazia (só cabeçalho) — já em D-053; nada novo, só reconferido | baixa | S20 | aberta (D-053) |
| D-0xx | revisão final S11 (PR #29) | `NotificationBell` é estático: o plano da Task 4 previa atualização leve da contagem a cada 60 s (sem WebSocket); hoje só atualiza ao navegar | baixa | S18 | aberta |

## S21 · Planejamento (cobrança: grátis, créditos e passe)
- Ruling (S21 plano): a implementação começa só depois do merge da S11; o passo 0 revalida em `main` as migrations 0600–0602, a versão final de `leads`/`lead_create`, os gatilhos de notificação em `leads`, `system_profile_id()`, a FK `leads.consent_id`, o `SessionActor` unificado e os helpers de teste — custo se errada: baixo (retrabalho de ajuste no passo 0).
- Ruling (S21 plano): o débito é um gatilho `AFTER INSERT` em `public.leads` (`enable always`) na mesma transação do `lead_create`; sem passe com cota, sem grátis e sem saldo o gatilho levanta `billing_required` e o lead não nasce (nem itens, consentimento, evento ou notificação). Consumidor assíncrono do evento `created` rejeitado: entregaria lead antes de cobrar e violaria o aceite do PLAN. Gatilho em vez de reescrever `lead_create`: vale para todo caminho de inserção e não depende da assinatura (a 0601 pode recriá-la) — custo se errada: médio (mover a chamada para dentro do `lead_create`).
- Ruling (S21 plano): "entregue" = linha em `leads` inserida (o evento `created` da S14 nasce na mesma transação) — custo se errada: baixo.
- Ruling (S21 plano): ordem de consumo passe (com cota) → grátis → crédito; preserva os grátis enquanto há passe — custo se errada: baixo (trocar a ordem na função).
- Ruling (S21 plano): saldo em centavos de real (não em "créditos" unitários): o PLAN manda preço por faixa de itens, o que torna "1 crédito = 1 lead" do Pap06 falso; Pap06 mostra "Saldo R$" e a tabela de faixas; pacotes são valores de recarga (crédito = valor pago, sem bônus inventado) — custo se errada: médio (converter para unidades com preço em créditos por faixa).
- Ruling (S21 plano): sem coluna de saldo em cache; saldo = soma do `credit_ledger` e cada lançamento guarda `balance_after_cents` (check ≥ 0) calculado sob `for update` da carteira — custo se errada: baixo (índice/visão materializada se a soma pesar).
- Ruling (S21 plano): leads grátis e validade são snapshot do plano ativo na criação da carteira (validade conta da 1ª ativação da papelaria); plano novo não altera carteiras existentes; créditos comprados não expiram — custo se errada: baixo.
- Ruling (S21 plano): o passe tem cota de leads (`pass_included_leads`, conforme "[N] leads incluídos" do Pap06/Admin10), não é ilimitado; esgotada a cota, cai para grátis/crédito — custo se errada: baixo (cota nula = ilimitado).
- Ruling (S21 plano): passe comprado a qualquer momento até o fim da temporada, preço cheio, sem pró-rata; parcelas mensais a partir da compra, todas até o fim da temporada; passe ativa com a 1ª parcela paga; parcela em atraso não suspende o passe nesta fatia (inadimplência e pausa de leads são da S23) — custo se errada: médio (S23 endurece).
- Ruling (S21 plano): Admin10 sem comissão Pix nem repasse (S23 adiciona em nova versão do plano); ganha o card "Pacotes de crédito", ausente no design, porque o Pap06 vende pacotes e o valor tem de vir de configuração — custo se errada: baixo.
- Ruling (S21 plano): textos do design sem fonte ficam de fora: "Mais usado", "R$ [x] por lead" do pacote, "destaque na lista das escolas parceiras", "relatório semanal", "Lista aprovada +[N]" — custo se errada: baixo (copy).
- Ruling (S21 plano): "notas" do Pap06 = faturas e recibos da plataforma; nenhuma nota fiscal é emitida nem prometida — custo se errada: médio (integração fiscal futura).
- Ruling (S21 plano): adapter Pix segue a API Pix do BACEN v2 (`cob`), padrão entre PSPs, com OAuth2 + mTLS por `node:https` (sem dependência nova); webhook autenticado por token no path/cabeçalho (a Vercel não termina mTLS do PSP) e confirmação só após reconsultar a cobrança; PSP, credenciais, certificado e chave são pendência humana — custo se errada: médio (adapter específico do PSP escolhido).
- Ruling (S21 plano): `provider in ('fake','demo')` só em fatura/carteira `is_demo` (CHECK no banco); `DemoPaymentProvider` só com `isDemoEnabled` da S12 e nunca em produção — custo se errada: baixo.
- Ruling (S21 plano): admin lê cobrança pelo cliente de serviço depois de checar `role = 'admin'` no servidor; tabelas de cobrança sem política RLS de admin — custo se errada: baixo.
- Ruling (S21 plano): sem plano ativo o sistema falha fechado (`billing_unavailable`, lead não entregue, telas "indisponível"); no staging o orquestrador publica um plano provisório não comercial logo após aplicar a 0401 — custo se errada: médio (leads parados no staging até publicar).
- Ruling (S21 plano): o pai nunca vê motivo de cobrança: papelaria que não pode receber some do App21 e a corrida devolve "Esta papelaria não está recebendo pedidos agora. Escolha outra." — custo se errada: baixo.
- Ruling (S21 plano): nenhum evento de notificação novo na S21; avisos de saldo, passe e régua de cobrança são da S23 — custo se errada: baixo.
- Ruling (S21 plano): limpeza de testes com lançamentos confirmados por `purgeBilling` (superuser desabilita e reabilita `enable always` os gatilhos de imutabilidade dentro de uma transação); só em teste, com teste que garante `tgenabled = 'A'` depois — custo se errada: baixo.
- Ruling (S21 plano): D-040 (coluna "Estimado" no Pap02) passa para a S22, que já mexe no Pap02/Pap03; D-041 (Pap05, créditos por lista aprovada) passa para a S23: depende do upload integrado e de um valor de crédito por lista que ainda não existe em `plans` — custo se errada: baixo.
- Ruling (S21 plano): migration única `0401_billing.sql` — tudo da fatia cabe numa migration e a integração com `leads` é só um gatilho — custo se errada: baixo.

## S21 · Task 1 (0401_billing.sql: esquema, funções, gatilho de débito, testes de banco)
Contexto: retomada depois de o implementador anterior parar por limite de uso com só os testes de banco escritos (commit `b449b60`, vermelhos; nenhuma migration nem código de app). Revisão dos testes + implementação da migration `0401_billing.sql`.
- Ruling: `plans.published_by` sem FK para `profiles` (era `on delete set null`). O guard de imutabilidade de `plans` (`plans_guard`, só permite a transição exata `active -> archived`) bloqueia QUALQUER outro UPDATE, inclusive o `SET NULL` automático que o Postgres dispara ao apagar o perfil do admin (FK `on delete set null`) — isso quebrava `cleanupUsers()` com "plans é imutável" sempre que um teste apagava o admin de teste depois de publicar um plano. Sem FK, `published_by` é só rastro (como `lead_events.actor_id`), consistente com o padrão já usado no repositório para colunas de auditoria — custo se errada: baixo (rastro de quem publicou sobrevive à exclusão da conta, mas não há FK para conferir integridade referencial).
- Ruling: dois testes do WIP (`billing-lead-delivery.test.ts`, `billing-passes-invoices.test.ts`) chamavam `seedStationery` duas vezes na MESMA transação com o mesmo `ownerId`, violando `stationery_members_one_owner_per_profile` (um perfil só pode ser dono de uma papelaria); corrigido trocando o dono da segunda papelaria por outro perfil fixo (`IDS.school_member`). Mesmo problema em `billing-concurrency.test.ts`, mas ali os dados são CONFIRMADOS (`asServiceCommitted`) e só limpos no `afterAll`, então cada `it` (não só cada transação) precisava de um dono diferente — usei `stationery_member`, `school_member`, `admin` e `parent` um por teste — custo se errada: baixo (é só fixture de teste).
- Ruling: `billing-ledger.test.ts` tinha uma asserção de invariante com a soma errada (presumia a ordem dos débitos como 500,900,500,900 e o estorno de `rows[2]` devolvendo 900; a ordem real dos débitos, dada por `item_count` alternado no teste, é 900,500,900,500, e `rows[2]` é o SEGUNDO débito, -500) — corrigida a fórmula esperada para bater com o dado real (verificado com um script de depuração fora do repositório, apagado depois) — custo se errada: baixo (é só a asserção; a implementação já estava certa).
- Ruling: `billing-lead-delivery.test.ts` esperava que uma papelaria SEM carteira mantivesse `can_receive: true` depois de o plano ativo mudar para `free_leads: 0`, mas o próprio nome do teste ("usa o plano ATIVO") e o design ("sem carteira usa o snapshot do plano ativo diretamente, sem gravar") implicam reavaliação contra o plano CORRENTE, não um valor congelado; sem carteira não há snapshot para congelar. Corrigida a expectativa para `false` (mesma regra vale para as duas papelarias sem carteira) — custo se errada: médio (se o produto quiser "quem já viu true continua true até a 1ª cobrança", precisa de outra fonte de estado, não dá para inferir sem carteira).
- Ruling: risco sistêmico descoberto ao rodar `pnpm test:db` completo: o gatilho `leads_billing_charge` (`AFTER INSERT` em `public.leads`, `enable always`) passou a valer para TODO insert em `leads`, inclusive o `seedLead`/`lead_create` usados pelos testes de outras fatias (S06/S09/S14) que não sabem nada de cobrança; sem um plano ativo, esses testes passavam a falhar com `billing_unavailable`. Depender da ordem alfabética dos arquivos (billing-* antes de lead-*/notification-*) para garantir um plano publicado achou correto num arquivo cheio, mas se mostrou FRÁGIL (uma rodada completa do `pnpm test:db` falhou de forma intermitente com "sem plano ativo" nos arquivos de leads, e a mesma rodada, repetida, passou). Corrigido com `globalSetup` no `vitest.db.config.ts` (`tests/db/db-global-setup.ts`, chama `ensureTestBillingPlan()` uma vez antes de qualquer arquivo) — decoupla de ordem de arquivo, idempotente, não sobrescreve planos que os próprios testes publicam — custo se errada: alto se removido sem substituto (qualquer fatia futura que crie `leads` em teste de banco pode falhar de forma instável).
- Verificação: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db` (com `pnpm db:reset` antes) e `pnpm build` verdes. `pnpm test:db` completo: 65 arquivos, 1533 testes, 3 skipped, 0 falhas (rodado duas vezes, incluindo isolando os arquivos de leads sem nenhum arquivo de billing antes, para confirmar a correção do `globalSetup`).
- Pendências desta task: nenhum código de aplicação (`features/billing`, `PaymentProvider`, telas Pap06/Admin10, integração com a S14) ainda existe — só a migration e os testes de banco. Fica para a Task 2 em diante.

## S21 · Passo 0 (retomada após reinício da máquina no meio da Task 2)
- Verificação: `pnpm db:reset` + `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build` sobre `4ec6fae` (HEAD ao retomar). `test:db` teve 1 falha isolada em `tests/db/lead-transitions.test.ts` ("mark_viewed é idempotente"): ordem de `lead_events` veio `["viewed","created"]` em vez de `["created","viewed"]`. Investigação: `eventTypes` ordena por `created_at, id` (`lead_events.created_at default clock_timestamp()`, ordem real de inserção esperada); o evento `created` nasce ANTES do `viewed` no fluxo do teste (chamadas sequenciais, não concorrentes), então só uma leitura de relógio não-monotônica explicaria a inversão. Reexecutei o arquivo isolado 3× (verde) e o `test:db` completo de novo (65 arquivos, 1535 testes, 3 skipped, verde) — Ruling: falha atribuída a uma correção de relógio do Docker/Colima logo após o boot da máquina (coincide com o motivo do reinício registrado no handoff), não a uma regressão da 0401; nenhuma mudança de código — custo se errada: baixo (se recorrer, é candidato a `clock_timestamp()` → uma coluna `bigserial` auxiliar de ordenação em `lead_events`, mas não há sinal de recorrência).

## S21 · Task 2 (domínio, repositório, PaymentProvider fake/demo/Pix, integração com a entrega do lead)
Contexto: Task 1 (migration `0401_billing.sql`) já mesclada nesta branch (commit `4ec6fae`); esta task cobre tudo em `features/billing/**`, os três provedores de pagamento, as rotas de webhook/cron e a integração com `features/leads`.
- Ruling: `BillingStore` (ports.ts) é implementado como fábrica `createBillingStore(admin): BillingStore` em `repository.ts`, no mesmo padrão de `createLeadStore` (S14) — funções de módulo chamadas com `admin`/`actor` explícitos, agrupadas num objeto só para o `BillingService` injetar. Evita uma classe repositório paralela às funções — custo se errada: baixo (é só organização).
- Ruling: `billing_wallet_summary` e `billing_ensure_wallet` (SQL) NÃO conferem posse (não chamam `billing_check_member`) — são leitura/idempotência puras. O repositório TS confere posse (`requireMemberOrAdmin`: papel `admin` ou linha em `stationery_members` pelo MESMO predicado da política RLS) ANTES de chamar essas funções com o cliente de serviço; sem essa checagem em app, qualquer `stationeryId` veria o saldo de outra papelaria. Escritas (`billing_create_package_invoice`, `billing_purchase_season_pass`) já conferem posse dentro da própria função SQL (`billing_check_member`), então o repositório não duplica ali — custo se errada: alto (vazamento de saldo entre papelarias) se a checagem em app for removida sem substituto no SQL.
- Ruling: `provider` NUNCA é entrada do cliente em `buyPackage`/`buyPass` (removido de `buyPackageInputSchema`/`buyPassInputSchema`): o servidor sempre decide com `resolvePaymentProvider(env, wallet)`. O CHECK do banco (`provider = 'pix' or is_demo`) já impediria dinheiro de mentira virar crédito real, mas deixar o cliente ESCOLHER o provedor era uma superfície de decisão que não é dele — custo se errada: baixo (o CHECK do banco ainda protege).
- Ruling: a validade da cobrança Pix (`calendario.expiracao`) vem SEMPRE de `PixConfig.chargeTtlSeconds` (`PIX_CHARGE_TTL_SECONDS` do ambiente), nunca do `ChargeInput` do chamador — é config técnica do PSP, não uma decisão por compra. `FakePaymentProvider`/`DemoPaymentProvider` (sem PSP real) usam um default técnico nomeado (`DEFAULT_CHARGE_TTL_SECONDS` em `limits.ts`) quando o chamador não informa — custo se errada: baixo.
- Ruling: `DemoPaymentProvider` recusa na CONSTRUÇÃO (não só na fábrica) quando `!isDemo` ou `!isDemoEnabled(env)` — defesa em profundidade: mesmo um bug na fábrica não entrega um provedor de demonstração para carteira real ou produção. Reaproveita `isDemoEnabled` de `features/cart/demo-provider.ts` (S12), já fail-closed por design — custo se errada: baixo.
- Ruling: "Simular pagamento (demonstração)" (`BillingService.simulateDemoPayment`) confirma a fatura DIRETO (`confirmInvoicePayment`), sem passar por `provider.getCharge()` — não há PSP real na demonstração, então não há o que reconsultar; `DemoPaymentProvider.getCharge` existe só por completude de interface e nunca é chamado por este fluxo. Mantém a regra "confirmação sempre reconsulta o PSP" só para o Pix real, onde ela importa (defesa contra webhook falso) — custo se errada: baixo.
- Ruling: `listCandidateStationeries` (features/leads/repository.ts) ganhou o parâmetro obrigatório `itemCount` (= número de itens da lista, o mesmo `jsonb_array_length` que `lead_create` grava em `leads.item_count`) e filtra o resultado por `billing_can_receive_lead` antes de ordenar/cortar — papelaria sem passe/grátis/saldo simplesmente SOME da lista, sem expor o motivo (App21/Pap01). `LEAD_ERROR_CODES` ganhou `billing_required`/`billing_unavailable` com a MESMA mensagem neutra ("Esta papelaria não está recebendo pedidos agora. Escolha outra.") — o pai nunca vê "sem saldo" — custo se errada: baixo (é só o texto/filtro; o gatilho do banco já impede a entrega em qualquer caminho).
- Ruling: webhook Pix em `/api/billing/pix/webhook/[token]` (token no PATH, não em cabeçalho `Authorization`) — o BACEN recomenda configurar a URL do webhook com um segredo embutido; comparação em tempo constante (`isAuthorizedPixWebhook`, mesmo padrão de `features/leads/cron-auth.ts`). Corpo só extrai `txid`(s) para SABER o que reconsultar; o valor pago nunca vem do `POST`, sempre de `provider.getCharge()` seguido de `billing_confirm_invoice_payment` (que também confere `amount_cents`) — custo se errada: alto (webhook que confia no corpo é a superfície clássica de fraude Pix) se a reconsulta for removida.
- Ruling: varredura estática (`tests/billing/no-secrets-scan.test.ts`) cobre só PEM/`client_secret` literal e "só a fábrica importa `PixPaymentProvider`" — o item do PLAN sobre "nenhum literal numérico além dos limites de validação" em `features/billing/**` NÃO ganhou um scanner automatizado (o `grep` ingênuo teria muitos falsos positivos em índices de array, `.length`, status HTTP etc.; um AST-aware ficaria caro para o tempo desta task). Conferido manualmente: todo valor de negócio (grátis, faixas, pacotes, passe, parcelas, meses) vem de `plans`/filhas via `ActivePlan`; `limits.ts` só tem limites de validação e duas constantes técnicas (`CENTS_PER_BRL`, `DEFAULT_CHARGE_TTL_SECONDS`) — custo se errada: médio (regressão futura sem scanner automatizado; considerar um scanner AST na S22/S23 se a área crescer).
- Verificação: testes antes da implementação em cada módulo (domínio puro rodou verde de primeira graças à conferência prévia contra o Postgres real via `psql`/`node-postgres` para a semântica de `date + interval 'n months'`, que CLAMPA o dia no mês de destino em vez de rolar para o mês seguinte — replicada em `features/billing/tz.ts#addMonthsClamped`); `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db` (com `pnpm db:reset` antes) e `pnpm build` verdes. `pnpm test` (unitário): 2802 testes (2695 antes da task + 107 novos). `pnpm test:db`: 65 arquivos, 1535 testes, 3 skipped (2 a mais que a Task 1: os dois novos casos de integração em `tests/leads/repository.test.ts` e `tests/billing/repository.test.ts`).
- Pendências desta task: telas Pap06/Admin10 e E2E ficam para a Task 3.

## S21 · Task 3 (telas Pap06 e Admin10, integração com Pap01/Pap02/admin, E2E)
- Ruling: `PackageCards`, `PassCard` e `TermsCheckbox` foram para `components/billing/` (junto de `BalanceCard`,
  `StatementTable`, `InvoiceList`, `PriceTierTable`, `DemoPayButton`) em vez de `app/papelaria/creditos/` como o
  plano listava — são componentes puros de apresentação sem estado de rota, mesmo critério já usado para os outros
  cinco; só `PayInvoice` (específico da página de fatura, usa a ação `payInvoiceAction`) ficou em
  `app/papelaria/creditos/faturas/[id]/`. Deviation de local, não de comportamento — custo se errada: baixo
  (mover arquivo).
- Ruling: `provider` nunca é campo do formulário de compra (Pap06): o servidor decide com `BillingService.providerFor`
  a partir de `stationeries.is_demo`; `buyPackageInputSchema`/`buyPassInputSchema` (já sem esse campo desde a Task 2)
  confirmam a decisão de design na Task 3, sem exigir mudança.
- Ruling: `getSummary`/`getStatement`/`listInvoices` (leitura, service_role) exigem `requireMemberOrAdmin`
  (Task 2); a leitura de "Cobrança" em `/admin/papelarias/[id]` usa o mesmo caminho com o `actor` ADMIN da sessão
  (bypassa a checagem de vínculo, como o Ruling de Task 2 já previa) — nenhuma política RLS de admin nova.
- Ruling: o extrato (`StatementTable`) só mostra o nome da escola em `lead_debit`; `free_lead`/`pass_lead` mostram
  "Lead grátis · LC-XXXX"/"Lead do passe · LC-XXXX" sem escola — decisão de texto (não do PLAN), mantém a descrição
  curta e sinaliza a fonte do lead sem inventar relevância da escola nesses casos — custo se errada: baixo (é só
  copy; o dado da escola está disponível se o produto quiser mostrá-lo também aí).
- Ruling: `KpiRow` (Pap02) ganhou um 5º cartão "Saldo" opcional (`balanceCents?`); mantém o componente compartilhado
  em vez de duplicar o grid — custo se errada: baixo.
- Ruling: E2E rodado com os meses de temporada PADRÃO do formulário (janeiro a dezembro), não nov–mar do PLAN,
  porque o roteiro não preencheu os seletores de mês (tempo de sessão); a semântica de virada de ano/mês curto já é
  coberta exaustivamente por `tests/billing/season.test.ts` contra o Postgres real. D-0xx (baixa): repetir o E2E
  preenchendo nov/mar antes do go-live, se quiser o print com a temporada real do produto.
- Ruling: E2E não exercitou a compra do PASSE pela UI nem o estado "Pagamento via Pix indisponível no momento" para
  carteira não-demo (tempo de sessão); ambos cobertos por `tests/billing/service.test.ts` e
  `tests/billing/components.test.tsx`. D-0xx (baixa): fechar esse trecho do roteiro numa sessão futura.
- Verificação: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db` (com `pnpm db:reset` antes) e `pnpm build`
  verdes. `pnpm test`: 2832 testes (2804 antes da Task 3 + 28 novos: `stationery-components` +2, `admin-actions` +7,
  `actions` +9, `components` +12 — os demais já contados na Task 2). `pnpm test:db`: 65 arquivos, 1535 testes, 3
  skipped (mesma contagem da Task 2; a Task 3 não mexeu em SQL). E2E real com `agent-browser` contra o build de
  produção local (`scripts/e2e-s21.sh`): **17 de 17 verificações passaram** numa execução limpa (`pnpm db:reset` +
  `scripts/e2e-s14-seed.sql`); relatório e o que ficou de fora em `docs/superpowers/e2e/S21.md`, prints em
  `docs/superpowers/e2e/screenshots/S21-*.png`.
- Achado durante o E2E (corrigido nesta task, sem precisar de novo teste automatizado): `getBillingService()` seria
  chamado com `{ userId, role: "admin" } as never` no rascunho inicial de `app/admin/planos/page.tsx` — um
  `SessionActor` forjado (não vindo de `getSessionActor()`) teria falhado em runtime na checagem de marca
  (`isSessionActor`, `features/auth/actor.ts`) com "ator não vem da sessão" assim que alguém abrisse `/admin/planos`.
  Achado e corrigido ANTES do E2E (leitura de código), não pelo E2E em si — registrado aqui porque é exatamente o
  tipo de erro que só apareceria em runtime (TypeScript não pega, já que o cast escondia o tipo). Troquei por
  `getSessionActor()` real.

## S21 · correções da revisão de segurança (Opus)
Rodada única sobre `6e63de6`. Testes antes (vermelho registrado abaixo por item), gate completo depois de cada
correção, dois commits (Task 1/SQL num commit por si, o resto junto).

**1) Lead de demonstração debitava carteira real.** Vermelho: `tests/db/billing-lead-delivery.test.ts` (banco real) —
`leadCreate` com `isDemo: true` numa papelaria `is_demo: false` debitava a faixa normalmente (nenhuma proteção).
Ruling: **pulei o débito, NÃO recusei o lead** (a alternativa que a revisão também aceitava). Recusar quebrava um
fluxo já em produção e ~70 testes de OUTRAS fatias (S06/S09/S14): o carrinho de demonstração da S12 (`cart.is_demo`)
com uma papelaria REAL é um caso normal (`lead_create`/0303 já força `is_demo = stationeries.is_demo OR
carts.is_demo`, de propósito, para deixar alguém testar o fluxo sem lista real); descobri isso só depois de a
primeira tentativa (recusar com hint `demo_mismatch`) quebrar a suíte inteira. A versão final:
`billing_charge_lead_delivery` (0401) compara `new.is_demo` com `stationery_wallets.is_demo`; se o lead é demo e a
carteira é real, a função só dá `return null` (sem gatilho de exceção, sem lançamento no razão) — o lead nasce
normal, mas nenhum centavo sai da carteira real. "Registro" é o próprio `leads.is_demo = true` numa papelaria não
demo (consulta direta, sem coluna nova). O sentido oposto (lead real numa carteira demo) já não ocorre pela mesma
regra OR — custo se errada: baixo (o pior caso é a papelaria real "doar" um lead de brincadeira, nunca perder
dinheiro).

**2) Pagamento perdido ao regenerar a cobrança Pix.** Vermelho: `tests/billing/service.test.ts` (`BillingService.
payInvoice`, 4 casos novos). Ruling: escolhi **reconsultar o PSP antes de decidir regenerar** (a 2ª opção do item,
sem migração nem tabela de histórico de txids). `payInvoice` agora, quando a fatura já tem `providerChargeId`,
SEMPRE chama `provider.getCharge(providerChargeId)` primeiro: `paid` (valor batendo) confirma direto e não gera
cobrança nova; `pending` devolve o BR Code antigo tal como o PSP diz que ainda vale (ignora o relógio local, que
pode estar errado); só `expired`/`unknown` gera uma cobrança nova. `InvoiceView` ganhou `providerChargeId` (coluna já
existia no banco, só não estava exposta ao TS) — custo se errada: médio (sem isso, um pagamento feito no intervalo
entre "vencida localmente" e o clique em "Pagar com Pix" seria perdido de verdade).

**3) Webhook Pix e o sufixo `/pix` do BACEN.** O BACEN entrega a notificação em `{urlCadastrada}/pix`; a rota
`[token]` (segmento único) nunca bateria com a URL real. Troquei para `app/api/billing/pix/webhook/[...path]/route.ts`
(catch-all): só o PRIMEIRO segmento é o token, o resto (`/pix` ou qualquer sufixo) é ignorado; a comparação
continua em tempo constante. Vermelho: `tests/billing/routes.test.ts` (novo caso "aceita o sufixo /pix"). Ruling:
registrado aqui e em `.env.example` que **a URL do webhook COM o token é, na prática, uma credencial** (aparece em
logs de acesso, no painel do PSP e em qualquer proxy no caminho) — tratar como segredo, nunca colar em issue/PR/chat;
gerar com `openssl rand -hex 24` ou equivalente — custo se errada: baixo (é só documentação; o token ainda é
comparado em tempo constante e sem ele a rota responde 503).

**Menores:**
- `getCharge`/`createCharge` (Pix) agora conferem `cob.txid === txid pedido` e `cob.chave === receiverKey`
  (quando o PSP devolve `chave`) antes de aceitar a resposta — nunca confia cegamente numa resposta que "parece"
  certa. Usa `pix[].valor` (valor EFETIVAMENTE recebido) em vez de `valor.original` (nominal da cobrança) quando o
  PSP devolve o array `pix`. Testes vermelhos→verdes em `tests/billing/payments/pix.test.ts` (5 casos novos).
- `pixConfigSchema` (`PIX_API_BASE_URL`, `PIX_OAUTH_TOKEN_URL`) exige `https://` — recusa config com `http://`.
  Teste em `tests/billing/payments/factory.test.ts`.
- Ruling documentado (sem código, limite inerente do Postgres): um SUPERUSUÁRIO sempre pode `alter table ...
  disable trigger` e religar depois — nenhuma trigger, nem `enable always`, resiste a quem tem esse poder; a defesa
  do desenho é contra `authenticated`/`service_role` via API e contra `session_replication_role = replica`, não
  contra o dono do banco (mesmo limite de `audit_log`/`ai_decisions`, já aceito nas fatias anteriores). Comentário
  adicionado no cabeçalho de `0401_billing.sql`.
- `billing_wallet_summary` NÃO mudou (continua criando a carteira: é a ação explícita da própria papelaria olhando
  o Pap06). Criei `billing_wallet_summary_readonly` (nova função, mesmo formato, NUNCA chama `billing_ensure_wallet`)
  para leitura PASSIVA de terceiro; `/admin/papelarias/[id]` (card "Cobrança") passou a usar
  `BillingService.getSummaryReadOnly` em vez de `getSummary`. Ruling: preferi duas funções a uma só com um parâmetro
  "criar ou não" — deixa explícito no nome de cada chamada qual é a intenção, sem um booleano solto que alguém possa
  inverter por engano. Vermelho: `tests/db/billing-lead-delivery.test.ts` (a leitura passiva não cria carteira; a
  ação da própria papelaria continua criando) — tive que reverter uma primeira tentativa de mudar
  `billing_wallet_summary` direto, que quebrou dois testes da Task 1 que já cobriam o comportamento antigo de
  propósito — custo se errada: baixo (o pior caso é o admin criar uma carteira cedo demais, não perder dado).
- `payInvoiceAction`, `buyPackageAction`, `buyPassAction` e `simulateDemoPaymentAction` agora exigem
  `actor.role === "stationery_member"` (redirecionam para `/403` senão) — defesa em profundidade: o banco
  (`billing_check_member`) já recusaria um admin sem vínculo com a papelaria na esmagadora maioria dos casos, isto
  cobre o caso raro de um perfil admin que também é membro de alguma papelaria. Testes em `tests/billing/
  actions.test.ts` (4 casos novos, um por ação).
- Chave de idempotência de `buyPackageAction`/`buyPassAction` deixou de ser gerada dentro da Server Action
  (`randomUUID()` a cada POST) e passou a vir de um campo oculto gerado UMA VEZ pela página
  (`app/papelaria/creditos/page.tsx`, `PackageCards`/`PassCard`): um duplo clique reenvia a MESMA chave e
  `billing_create_package_invoice`/`billing_purchase_season_pass` (já idempotentes por chave desde a Task 1)
  devolvem o registro já criado em vez de um segundo. Sem isso, cada POST gerava uma chave nova e a idempotência do
  banco nunca entrava em ação. Teste em `tests/billing/actions.test.ts` ("chave ausente/inválida: erro sem chamar o
  serviço").
- `reconcileOpenInvoices` (cron) agora busca só um LOTE (`RECONCILE_BATCH_SIZE = 200`, as faturas mais ANTIGAS
  primeiro) e para se estourar um ORÇAMENTO de tempo (`RECONCILE_TIME_BUDGET_MS = 20s`), devolvendo `truncated:
  true`; a próxima execução diária continua de onde parou (nunca reprocessa as mesmas primeiro, já que a busca é
  sempre pelas mais antigas). Testes em `tests/billing/service.test.ts` (3 casos novos).

Verificação: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db` (com `pnpm db:reset` antes) e `pnpm build`
verdes. `pnpm test`: 2957 testes (2938 antes desta rodada + 19 novos, líquido). `pnpm test:db`: 65 arquivos, 1538
testes, 3 skipped — numa rodada intermediária, dois arquivos SEM RELAÇÃO com billing (`publication-service.test.ts`
e `claim-tokens.test.ts`, trilhas Pipeline e Dados) falharam por ordenação de evento por timestamp; reexecutados
isolados (2/3 e depois a suíte inteira de novo) voltaram verdes — mesma classe de flakiness de relógio do
Docker/Colima já registrada no "Passo 0" desta fatia, não uma regressão desta rodada (nenhum arquivo de outra
trilha foi tocado). E2E real (`scripts/e2e-s21.sh`) rodado de novo sobre o build corrigido: **17 de 17 verificações
passaram**, incluindo a compra do pacote com a chave de idempotência agora vinda do campo oculto (sem mudança
visível ao usuário).

## S21 · correções do BLOQUEANTE da reverificação (Opus, sobre `c5b3762`)
Reverificação achou um bloqueante no item 2 (cobrança Pix). Rodada única, testes antes (vermelho registrado por
item), gate completo (`db:reset` + `typecheck` + `lint` + `test` + `test:db` + `build`) depois.

**1) `ATIVA` do BACEN v2 nunca expirava.** O BACEN mantém `status: "ATIVA"` para sempre; quem expira é
`calendario.criacao + calendario.expiracao` (prazo CALCULADO, não um status). `getCharge` devolvia `pending` pra
sempre numa cobrança vencida — fatura impagável por Pix (BR Code morto exibido indefinidamente). Vermelho:
`tests/billing/payments/pix.test.ts` ("ATIVA depois de calendario.criacao + calendario.expiracao -> expired").
Corrigido em `features/billing/payments/pix.ts` (`getCharge`): `ATIVA` com `criacao + expiracao` no passado (mais
`PIX_EXPIRY_MARGIN_MS = 5s` de `features/billing/limits.ts`, contra relógio ligeiramente adiantado do PSP) vira
`expired` (dispara regeneração no `payInvoice`); dentro da margem continua `pending`. Ruling: margem pequena e fixa
(5s) — o objetivo é só absorver diferença de relógio, não dar folga real de pagamento (isso já é
`chargeTtlSeconds`/`DEFAULT_CHARGE_TTL_SECONDS`). Ajustei o teste que fixava o comportamento errado (renomeado para
descrever o cenário DENTRO da validade) e acrescentei o caso "um instante antes do prazo, dentro da margem".

**2) `billing_attach_charge` sobrescrevia sem histórico nem CAS.** Regenerar a cobrança perdia o txid antigo — se o
pagador já tinha pago o BR Code velho (ou pagava logo depois de ele ser trocado por corrida), o webhook/cron nunca
mais achavam essa fatura por aquele txid, e a `payInvoice` concorrente virava duas cobranças vinculadas
(inconsistente). Vermelho: `tests/db/billing-passes-invoices.test.ts` (CAS + histórico) e
`tests/db/billing-concurrency.test.ts` (5 `billing_attach_charge` concorrentes na mesma fatura). Corrigido em
`0401_billing.sql` (editada em place — ainda não aplicada em lugar nenhum além do local, por instrução explícita):
  - Tabela nova `invoice_charges` (append-only, `unique (provider, provider_charge_id)`, índice por
    `invoice_id, created_at`, trigger `enable always` bloqueando update/delete — mesmo padrão de `credit_ledger` —,
    RLS habilitada sem política nenhuma, `select` só para `service_role`): guarda TODO txid já emitido por fatura,
    vencedor ou não da corrida.
  - `billing_attach_charge` (6 parâmetros agora: ganhou `p_expected_current_charge_id`) passou a ser
    compare-and-swap: trava a fatura (`for update`), grava SEMPRE no histórico (`on conflict do nothing`,
    idempotente), e só troca `invoices.provider_charge_id` se ele ainda for igual ao `expected` que o chamador leu
    antes de gerar a cobrança no PSP — senão devolve a cobrança REAL atual (nunca a perdedora). Duas `payInvoice`
    concorrentes geram duas cobranças no PSP (inevitável, ele já foi chamado antes desta função) mas só UMA fica
    vinculada; a chamada perdedora recebe de volta a da vencedora, nunca mostra ao usuário um BR Code que não é
    mais o oficial. Ruling: os parâmetros de saída (`returns table`) usam prefixo `out_` (`out_provider_charge_id`
    etc.) — sem ele o plpgsql recusa a função com "column reference is ambiguous", porque esses nomes de saída
    colidem com colunas de mesmo nome em `invoices`/`invoice_charges` referenciadas dentro do corpo da função
    (`variable_conflict` padrão do plpgsql é `error`, não silencioso); `features/billing/repository.ts`
    (`attachCharge`) e o teste de concorrência ajustados para os novos nomes de coluna.
  - `findOpenInvoiceByChargeId` (webhook) e `listOpenPixChargeIds` (cron) passaram a resolver/listar por QUALQUER
    txid histórico da fatura (via `invoice_charges`), não só o atual — confirmam a fatura (idempotente, linha
    travada) mesmo que o pagamento tenha sido no txid velho.
  - `payInvoice` (`features/billing/service.ts`): status `unknown` do PSP agora é ERRO
    (`payments_unavailable`) em vez de regenerar cegamente — nunca cria uma segunda cobrança só porque a consulta ao
    PSP falhou/expirou.
  - `tests/db/helpers.ts` (`purgeBilling`): precisou apagar `invoice_charges` antes de `invoices` (FK
    `on delete restrict`) e desabilitar a trigger de imutabilidade da tabela nova, mesmo padrão das outras guardas.

**3) Lead demo criava a carteira REAL antes de checar `is_demo`.** `billing_charge_lead_delivery` chamava
`billing_ensure_wallet` (que cria a carteira se não existir) ANTES do check de pular o débito — uma papelaria real
sem carteira nenhuma ganhava uma carteira (vazia, mas real, com snapshot do plano) só por causa de um lead de
brincadeira. Corrigido: o check `new.is_demo and not v_stationery_is_demo -> return null` (pula o débito, ver seção
anterior) agora vem ANTES de `billing_ensure_wallet` — nenhum efeito colateral em papelaria real por lead demo.
Isto expôs um acoplamento acidental em três testes pré-existentes que combinavam papelaria REAL (padrão
`is_demo=false`) com carrinho/lead DEMO (padrão `is_demo=true` de `seedCart`/`newCart`/`record()`) sem querer testar
esse cenário — o teste da corrida OUTRO caminho antigo (a exceção de `billing_ensure_wallet` disparando ANTES do
check de demo) mascarava a mistura por acidente. Corrigidos para is_demo consistente (isolando "sem plano ativo"
do "lead demo × papelaria real", que já tem teste próprio): `tests/db/billing-lead-delivery.test.ts` ("sem plano
ativo..." -> `overrides: { is_demo: true }` na papelaria) e `tests/leads/repository.test.ts` ("S21 · sem plano
ativo..." -> carrinho e `record(..., { isDemo: false })` não-demo).

**Achado ao escrever o teste de concorrência, sem relação com a revisão:** `tests/db/billing-concurrency.test.ts`
usava txids FIXOS (`race0xxx...`) — como o teste faz commit de verdade (não usa savepoint/rollback), rodar
`pnpm test:db` duas vezes sem `db:reset` entre elas colidia com a `unique (provider, provider_charge_id)` deixada
pela rodada anterior. Troquei por um sufixo aleatório por execução (mesmo padrão de `seedStationery`).

Verificação: `pnpm db:reset && pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build`, todos verdes.
`pnpm test`: 2959 testes. `pnpm test:db`: 66 arquivos (1 skipped), 1539 testes. Não repeti o E2E (`scripts/e2e-s21.sh`)
nesta rodada — nenhuma tela/UI mudou, só SQL e `features/billing/**`; o roteiro usa os providers fake/demo, que não
exercitam os caminhos Pix corrigidos aqui.


- D-097 (baixa, `docs/superpowers/DEBT.md`): scanner AST de "nenhum literal numérico fora de `limits.ts`" em
  `features/billing/**` não existe (Ruling da Task 2); hoje a garantia é revisão manual. Considerar na S22/S23 se a
  área crescer.
- D-098 (baixa, `docs/superpowers/DEBT.md`): E2E não cobriu a compra do passe pela UI, o estado "Pix indisponível"
  para carteira real, nem a temporada nov–mar (formulário usou os meses padrão); tudo coberto por teste
  automatizado, falta só o clique.
- D-076 (média, já existia, anotada nesta fatia): o adapter Pix ficou genérico BACEN v2 como o plano pedia; ainda
  não verificado contra a API real do Asaas (PSP escolhido pelo humano) por falta de credencial/conta.
- Pendências humanas (sem ação possível pelo Claude): PSP Pix (conta, credenciais, certificado mTLS, chave Pix,
  `PIX_WEBHOOK_TOKEN`, cadastro do webhook no painel do PSP), `PAYMENTS_PIX_ENABLED`/`CRON_SECRET` nos ambientes da
  Vercel; sem isso, `/papelaria/creditos` mostra "Pagamento via Pix indisponível no momento" e nenhuma cobrança real
  acontece (Ruling do plano, já registrado em "S21 · Planejamento"). Plano PROVISÓRIO de staging: fica para o
  orquestrador aplicar depois do merge (mesma nota do plano, seção final).

## S22 · Atribuição, conversão e contestação

Plano: `docs/superpowers/plans/2026-09-26-s22-conversao.md`. Migration `0402_lead_conversions.sql`, `features/conversion/**`,
telas (`/conta/compras`, Pap03 `DisputeForm`, `/admin/auditoria`, `/admin/contestacoes`, avaliações em Pap08).

**Ruling 1 — "Pix pela plataforma" fica AUSENTE, não inventado.** O terceiro sinal do PLAN/SPEC-2 ("Pix pela
plataforma") pressupõe um registro do PAGAMENTO do pai à papelaria feito pela plataforma. A S21/0401 só cobra a
PAPELARIA pelo LEAD (crédito pré-pago); não existe hoje nenhuma tabela ou evento que registre um pagamento do pai à
papelaria via Pix — isso é escopo da S23 (comissão só quando o Pix passa pela plataforma). `lead_conversion_signals`
devolve `pix_confirmed = false` sempre, com comentário explícito no SQL e nas telas (Admin11 mostra "Pix pela
plataforma indisponível nesta fase" em vez de omitir o motivo). Custo se errado: se a S23 registrar esse sinal sob
outro nome/formato, só precisa trocar o `false` fixo por uma consulta real — nenhuma migration desta fatia muda.

**Ruling 2 — heurística de regex para "sem dado pessoal no comentário", não fila de moderação.** O SPEC-2 pede
"avaliação sem texto livre com dado pessoal (ou moderado)". Implementei a defesa mais simples que ainda cumpre a
regra: `lead_review_contains_personal_data` (SQL, `immutable`) rejeita na escrita (hint `personal_data_rejected`)
comentários com padrão de e-mail ou uma sequência de 8+ dígitos com no máximo um separador entre cada um (telefone,
CPF, CEP colado). Não é um validador de PII completo (não pega texto ofensivo nem nomes) e não guarda um estado
"pendente" para o admin revisar depois — uma fila de moderação exigiria mais uma tabela, tela e fluxo de aprovação,
fora do tempo desta fatia. Custo se errado: falso negativo deixa passar um dado pessoal disfarçado (ex.: "seis cinco
nove nove..."); falso positivo (raro) recusa um comentário legítimo com muitos números seguidos, pedindo que o pai
reescreva — sem perda de dado, só fricção. Revisitar na S23 se o volume de avaliações justificar.

**Ruling 3 — prazo de 72h contado de `leads.created_at` (entrega do lead), não da declaração da papelaria.** O
PLAN diz só "em até 72 h"; o SPEC-2 não ancora explicitamente. Escolhi `created_at` porque os 4 motivos fixos (número
errado, lista incompleta, duplicado, fora da área) são sobre a QUALIDADE DO LEAD recebido, não sobre o resultado da
venda — fazem sentido contestar assim que a papelaria vê o problema, não depois de ela mesma declarar "Vendi"/"Não
fechou" (que pode nunca acontecer). Testado na fronteira com margem de 1 min (71h59 aceita, 72h01 recusa) para não
depender de timing exato de rede nos testes; a função SQL usa `now()` do servidor, nunca input do cliente. Custo se
errado: se o produto quisesse ancorar em outro evento (ex.: primeira visualização do lead), é um `interval` a trocar
em `lead_dispute_open`, sem mudar schema.

**Ruling 4 — Pap07-Desempenho (funil, conversão declarada x confirmada) NÃO entra nesta fatia.** O SPEC-2 lista
Pap07 junto da S22 em `SCREENS.md`, mas o PLAN §S22 não a cita nem no prompt nem no aceite (só cita as 5 telas do
Referência). Pap07 é um painel agregado (funil, ticket médio, comparação anônima de bairro) que combina sinais de
conversão com dados de repasse/comissão — faz mais sentido junto da S23 (comissão, repasses), que já vai calcular
ticket e repasse por venda confirmada. `listAuditRows` (Admin11) já expõe os dados brutos que Pap07 vai agregar.
Registrado como dívida (ver bloco abaixo).

**Reuso deliberado de `billing_reverse_entry` (S21) sem alteração.** `lead_dispute_resolve` chama a função existente
da 0401 (mesma assinatura, `p_actor_role` também aceita `system`); a idempotência ("uma contestação aceita estorna
uma vez") vem de dois lugares que se reforçam: (a) `billing_reverse_entry` já é idempotente por natureza
(`reverses_entry_id` único — uma segunda chamada com o mesmo `p_entry_id` devolve o estorno existente); (b)
`lead_dispute_resolve` também checa `d.status <> 'open'` antes de chamar o estorno e devolve o `id` da disputa sem
gravar de novo se a decisão já resolvida for igual à pedida. Testado com 2 chamadas reais (banco e E2E).

**`lead_disputes.reversed_entry_id` é uuid solto (sem FK) de propósito.** Uma FK para `credit_ledger` faria
`TRUNCATE credit_ledger` falhar com `0A000` (regra do Postgres para qualquer FK externa) em vez do `42501` do
gatilho de imutabilidade da 0401 — quebraria `billing-ledger.test.ts` (S21), que testa exatamente esse `42501`.
Descoberto rodando o gate (vermelho real, não hipotético): a primeira versão da migration tinha a FK e quebrou esse
teste da S21; removida e documentada no comentário da coluna.

Verificação: `pnpm db:reset && pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build`, todos verdes
(2971 testes unitários; 1558 de banco, 1 arquivo skip pré-existente). E2E (`scripts/e2e-s22.sh`): 21/21, ver
`docs/superpowers/e2e/S22.md`.

## S22 · Dívida (bloco pronto para o DEBT.md; IDs a atribuir pelo orquestrador)

- (baixa) Pap07-Desempenho (funil, conversão declarada x confirmada por escola/bairro) não foi construída nesta
  fatia (Ruling 4 acima); os dados brutos já existem em `lead_conversion_signals`/`listAuditRows`. Dona: S23.
- (baixa) A heurística de "dado pessoal" no comentário da avaliação (Ruling 2) é regex, não um validador de PII nem
  uma fila de moderação humana; pode deixar passar ofuscações simples ("seis cinco nove..."). Revisitar se o volume
  de avaliações justificar.
- (baixa) O sinal "Pix pela plataforma" está sempre ausente (`pix_confirmed = false`, Ruling 1); nenhuma tela
  esconde isso (Admin11 rotula "indisponível nesta fase"), mas a regra de 2 de 3 nunca vê esse terceiro sinal até a
  S23 acrescentar a fonte real.
- (baixa) `/conta/compras` lista até 30 pedidos do pai sem paginação; não é um problema hoje (poucos leads por pai
  no piloto), mas cresce sem paginar se o produto pegar tração.

## S22 · correções da revisão de segurança (Opus, rodada única sobre 93f78e7)

Migration `0402_lead_conversions.sql` EDITADA NO LUGAR (ainda não aplicada em nenhum ambiente além do local desta
sessão — sem PR, sem apply em staging). Um Ruling por item pedido na revisão.

**1) Avaliação só com compra confirmada.** `lead_review_create` agora recusa lead `cancelled` (hint `invalid_state`)
e exige `l.status = 'converted'` OU uma confirmação `bought_here` em `lead_purchase_confirmations` (hint
`purchase_not_confirmed`) antes de aceitar a avaliação. Ruling: usei os MESMOS dois sinais da regra de conversão (2
de 3) como pré-condição de "comprou de verdade" — não um terceiro critério novo — porque são exatamente os dois
sinais que já existem nesta fatia (o terceiro, Pix pela plataforma, segue ausente). Custo se errado: um pai que
comprou mas nunca confirmou nem teve a venda declarada não consegue avaliar; aceitável, porque ele sempre pode
confirmar em `/conta/compras` primeiro.

**2) Autoavaliação/autoconversão.** `lead_confirm_purchase` e `lead_review_create` recusam (hint `forbidden`) um
ator que é `stationery_members` da papelaria do PRÓPRIO lead, mesmo que `requester_id` coincida com o perfil dele
(checagem redundante ao `requester_id is distinct from p_actor_id`, mas defesa em profundidade contra o caso em que
os dois coincidem). `lead_create` (0303, S14) NÃO ganhou o bloqueio simétrico — Ruling: essa migration já está
aplicada no staging (`billing` já rodou por cima dela na 0401) e este implementador não tem mandato para editar uma
migration já aplicada fora deste worktree local; fazer isso exigiria uma migration NOVA e aditiva (trigger ou check
em `lead_create`) que fica fora do escopo de uma correção "rodada única" sobre a 0402. Registrado como D-107 (média,
`DEBT.md`) para a S23. Custo se errado (enquanto D-107 está aberta): um dono de papelaria consegue CRIAR um lead
para si mesmo, mas não consegue confirmar a compra nem se autoavaliar — o pior cenário (nota falsa) já está coberto.

**3) Contestação de lead vendido.** `lead_dispute_open` recusa (hint `lead_sold`) quando `l.status = 'converted'`
OU existe confirmação `bought_here` — os 4 motivos fixos (número errado, lista incompleta, duplicado, fora da área)
são sobre a QUALIDADE do lead recebido, nunca cabíveis depois que a venda já foi confirmada por qualquer um dos dois
lados. Também recusa (hint `stationery_unavailable`) quando a papelaria está `suspended`. `getDisputeGate`
(`features/conversion/repository.ts`) espelha as duas regras para EXIBIÇÃO (`blockedReason: 'sold' | 'suspended' |
'expired'`), calculadas por leitura própria (join com `lead_purchase_confirmations` e `stationeries.status`) — o
banco continua sendo a fonte final; a tela só evita mostrar um formulário que o banco recusaria. Admin12
(`/admin/contestacoes`) passou a mostrar o status do lead e os 3 sinais (via `AdminDisputeView`, que chama
`lead_conversion_signals` por disputa) antes de "Aceitar"/"Rejeitar" — hoje isso é redundante com a regra 3 (uma
disputa nova nunca nasce sobre um lead já vendido), mas é informação de auditoria útil para disputas antigas ou uma
regra futura que mude essa condição.

**4) Moderação de avaliação.** `lead_review_hide(p_review_id, p_actor_id, p_reason)`: só admin, `p_reason` de uma
lista FECHADA (`personal_data`, `offensive`, `policy_violation`, `other` — nunca texto livre do moderador),
idempotente (ocultar 2x devolve o mesmo id sem regravar o motivo), nunca reabre (`published -> hidden` é a única
transição aceita pelo gatilho `lead_reviews_guard`, novo). Botão "Ocultar" em `/admin/auditoria` (componente
`ReviewModeration`). Ruling: moderação PLENA (fila de revisão antes de publicar, IA de toxicidade, etc.) fica como
dívida — o que existe é reativo (alguém precisa ver e clicar), não preventivo; ver D-104 (reforçada). A heurística de
dado pessoal (`lead_review_contains_personal_data`) ganhou: normalização de separador ENTRE dois dígitos (colapsa
`espaço`/`.`/`-`/`(`/`)` repetidamente até estabilizar, pegando `"9 9 9 9 - 9 9 9 9"`), número por extenso
(`zero`..`nove`, com fronteira de palavra `\y` para não confundir "um" artigo com dígito isolado — só vira 1 dígito
quando cercado só por espaço/pontuação de outros números/separadores, nunca some sozinho no meio de uma frase normal
o bastante para formar 8 dígitos) e `"arroba"` como `@` ofuscado (com o espaço ao redor absorvido, senão o e-mail
não bate no regex). Achado ao testar: a checagem de e-mail original quebrava com `"fulano arroba exemplo.com"`
porque sobrava espaço ao redor do `@` recém-substituído — corrigido absorvendo `\s*` nas duas pontas da troca.

**Menores (todos aplicados):**
- `grant select (..., lead_id, ...)` em `lead_reviews` saiu do `anon` (ficou só em `authenticated`, papelaria/admin):
  correlacionar uma avaliação publicada a um `lead_id` específico é uma pista de "quem comprou o quê" que ninguém
  de fora precisa.
- Avaliação `is_demo` nunca aparece no perfil público de papelaria REAL (`listPublishedReviews` cruza com
  `stationeries.is_demo`); optei por FILTRAR (não por selo por avaliação) porque o perfil já tem o selo
  "Demonstração" no cabeçalho quando a papelaria é demo — um selo por avaliação seria redundante.
- Etiquetas mostram o rótulo legível (`REVIEW_TAG_LABEL`, compartilhado entre `PurchaseCard` e `PublicProfileView`),
  nunca o slug cru.
- Média honesta: "Avaliações · [nota] (média das últimas N)", `N` = quantidade REALMENTE usada no cálculo (o mesmo
  limite passado a `listPublishedReviews`), nunca um número diferente do que está na tela.
- `getDisputeGate` devolve `existingDispute.detail = null` quando quem pede é o SOLICITANTE (pai) do lead — só a
  papelaria e o admin leem o texto livre que a papelaria escreveu ao contestar.
- Disputa aceita sem lançamento a estornar mostra "sem crédito a devolver" (Pap03 e Admin12), nunca "crédito
  devolvido"; teste novo confirma que `reversed_entry_id`, quando não nulo, sempre existe em `credit_ledger` com
  `entry_type = 'reversal'`.
- Papelaria `suspended` não contesta (regra 3 acima cobre isso; a UI usa o mesmo `blockedReason`).

**Achado sem relação direta com o pedido, mas bloqueante para o gate:** o novo gatilho `lead_reviews_guard`
quebrava `ON DELETE SET NULL` de `lead_reviews.actor_id -> profiles` (exclusão de conta, LGPD) — qualquer teste que
apagasse um usuário com uma avaliação sua disparava "lead_reviews é imutável". Corrigido acrescentando ao guard uma
segunda transição permitida: `actor_id` virando `NULL` com todas as outras colunas iguais (o efeito exato do
cascade). Sem esse ajuste, excluir a conta de um pai que já avaliou uma papelaria falharia em produção.

Verificação: `pnpm db:reset && pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build`, todos verdes
(2971 testes unitários; 1567 de banco, 3 skipped pré-existentes). E2E (`scripts/e2e-s22.sh`) repetido: 21/21, ver
`docs/superpowers/e2e/S22.md`. Vermelho real (4 achados de teste, listados) em
`docs/superpowers/logs/s22-security-review-red.log`.
## S24 · Planejamento (portal B2B, chaves e API v1)
- Ruling (S24 plano): a implementação começa só depois do merge da S11 em `main`; o passo 0 revalida 0600–0602, a forma final de `schools`/`school_lists`/`list_versions`/`list_items` (inclui colunas novas da S10/S11 fora da whitelist), `parent_list_copies` fora da API, `system_profile_id()`, `consents`, catálogo de notificações, ausência de acoplamento com a S21, `SessionActor` unificado, `AdminShell`/`access.ts`/`proxy.ts` e helpers de teste — custo se errada: baixo (ajuste no passo 0).
- Ruling (S24 plano): implementação num worktree próprio da trilha B2B (recomendado `T5-b2b`, `.track` = 5, app 3005), porque o T1 hospeda a S21 em paralelo — custo se errada: baixo (o orquestrador escolhe outro worktree livre).
- Ruling (S24 plano): migration única `0501_b2b_partners_api.sql` (domínio coeso, sem alterar tabela de outra fatia); FKs para `profiles`, `consents` e tabelas da própria fatia; nenhuma FK para a Cobrança (04xx) — custo se errada: baixo.
- Ruling (S24 plano): sem valor novo em `user_role`; portal liberado por `b2b_partner_members` (só dono nesta fatia, um parceiro por perfil). `add value` no enum não pode ser usado na mesma transação da migration, mexeria em `UserRole`/matrizes das trilhas paralelas e promover papel tiraria o acesso de pai — custo se errada: médio (migrar para papel próprio exigiria backfill e revisão de `access.ts`).
- Ruling (S24 plano): convite de outros membros do parceiro fica fora da S24 (dívida, dono a decidir no pós-S26) — custo se errada: baixo.
- Ruling (S24 plano): cadastro de parceiro exige login (e-mail corporativo = e-mail da conta); formulário anônimo seria alvo de spam sem o rate limit por IP da S19 — custo se errada: baixo (abrir formulário anônimo depois da S19).
- Ruling (S24 plano): termos da API aceitos em `public.consents` (`purpose = 'b2b_api_terms'`, versão constante do servidor) na mesma transação do cadastro; página `/parceiros/termos` com placeholders, sem afirmar conformidade — custo se errada: baixo.
- Ruling (S24 plano): implementar os 6 endpoints do SPEC-2 (os 4 do PLAN + `GET /v1/schools/{inep}` e `GET /v1/lists/{id}`, que aparecem no B2B03) — custo se errada: baixo.
- Ruling (S24 plano): chave `test` (sandbox, "dados de amostra") lê só linhas `is_demo`; chave `live` só linhas não demo; sem demo no banco o sandbox devolve vazio — custo se errada: baixo.
- Ruling (S24 plano): só a versão atual publicada sai pela API (sem histórico `superseded`); escola sai com `verified` booleano (INEP não é verificação); contato, endereço e CEP de escola ficam fora — custo se errada: baixo (campo novo exige Ruling e teste de vazamento).
- Ruling (S24 plano): cobertura do plano Regional por `coverage_ufs` no parceiro (nulo = nacional); fora da cobertura = 404 igual a inexistente — custo se errada: baixo.
- Ruling (S24 plano): escopos `schools:read`, `lists:read`, `carts:match`; varejista tem os três, marca e EdTech só leitura; publicar lista pela API (EdTech) não está no PLAN e fica fora — custo se errada: médio (endpoint de escrita novo com revisão humana).
- Ruling (S24 plano): chave `lc_<env>_<id>_<secret>` (id público Crockford de 12, segredo de 32 bytes); banco guarda só HMAC-SHA256 com pepper `B2B_API_KEY_PEPPER` calculado no Node, `hash_version`, `public_id` e `last4`; comparação com `timingSafeEqual` e hash fixo para id inexistente; toda falha de chave devolve o mesmo 401 — custo se errada: baixo.
- Ruling (S24 plano): sem cache de validade de chave; o consumo do limite revalida a chave na mesma transação, então revogação entre lookup e consumo também falha — custo se errada: baixo (uma RPC a mais por requisição).
- Ruling (S24 plano): rotação cria a nova e expira a antiga numa carência escolhida no diálogo (1, 7 ou 30 dias; padrão 7), no máximo duas chaves utilizáveis por parceiro e ambiente; expiração checada no lookup, sem job — custo se errada: baixo.
- Ruling (S24 plano): suspender parceiro revoga todas as chaves na hora (Admin15); rebaixar para sandbox revoga as `live`; reativar não ressuscita chaves — custo se errada: baixo.
- Ruling (S24 plano): rate limit em Postgres (janela fixa por minuto e por dia em America/Cuiaba, advisory lock por parceiro e ambiente, negada não consome), no balde (parceiro, ambiente) para a rotação não dobrar a cota; memória por instância não funciona em serverless e Redis exigiria conta/credencial nova — custo se errada: médio (trocar por store externo com carga real).
- Ruling (S24 plano): limites por minuto/dia de `test` e `live` definidos pelo admin na aprovação, sem número de limite no código; planos são só rótulos (`sandbox`, `regional`, `national`, `brand_campaigns`, `edtech_integration`), preços e excedente ficam na S26 — custo se errada: baixo.
- Ruling (S24 plano): flood de chaves inválidas por IP é da S19 (D-001 deve incluir `/v1`); chave inválida não consome cota de ninguém — custo se errada: médio (abuso de CPU/banco até a S19).
- Ruling (S24 plano): uso agregado diário por chave, endpoint e classe de status (mais contagem de itens casados), sem IP, UA, corpo ou SKU; gravado com `after()` sem afetar a resposta — custo se errada: baixo.
- Ruling (S24 plano): a API lê por funções `SECURITY DEFINER` (`b2b_v1_*`, só `service_role`) que codificam a regra pública, com teste que compara o resultado ao que `anon` vê pela RLS; o cliente publicável foi rejeitado porque funções executáveis por `anon` contornariam chave e limite pelo PostgREST — custo se errada: baixo.
- Ruling (S24 plano): toda resposta `/v1` passa por esquema Zod `.strict()` do contrato (campo extra vira 500 sem vazar) e um teste varre todas as rotas do registro, inclusive erros e `openapi.json`, por chaves e valores proibidos; teste de completude liga os arquivos `app/v1/**/route.ts` ao registro — custo se errada: baixo.
- Ruling (S24 plano): contrato único em `features/b2b/api/contract.ts`; OpenAPI 3.1 gerado com `z.toJSONSchema` do Zod 4, sem dependência nova; B2B03 em `/b2b/docs` e pública em `/parceiros/docs`, com exemplos ilustrativos validados pelo esquema — custo se errada: baixo.
- Ruling (S24 plano): `POST /v1/carts/match` recebe `{ list_id, skus: [{ sku, name }] }` inline (não `partner_sku_feed` por URL, que exigiria buscar URL externa: SSRF), casa por chave exata e depois por conjunto de tokens, sem IA, sem persistir catálogo e sem `cart_url` (link para o carrinho do parceiro é do widget, S25) — custo se errada: baixo.
- Ruling (S24 plano): envelope `{ data, next_cursor, meta }`, erros com código fixo e mensagem em português, sem stack/SQL/hint/valor recebido; paginação keyset com cursor opaco (padrão 50/máx. 100; itens 200/máx. 500); `Cache-Control: no-store`; sem CORS; `/v1` fora do matcher do `proxy.ts` — custo se errada: baixo.
- Ruling (S24 plano): portal com nav só do que existe (Visão geral, API e chaves, Documentação, Conta); Widget/Webhooks e Campanhas/Insights/Faturamento entram com S25/S26 — custo se errada: baixo.
- Ruling (S24 plano): textos do design sem fonte ficam de fora: "carrinhos atribuídos" e avisos de webhook (S25), "Excedente R$ [x] por mil" (S26), "Proporções ilustrativas", "Respondemos em até [N] dias úteis", e-mail `parceiros@…`, "Nova conta" do Admin15; recursos de S25/S26 na landing com selo "Em breve" controlado por `B2B_FEATURES` — custo se errada: baixo (copy).
- Ruling (S24 plano): nenhuma notificação nova na S24 (o parceiro vê o status no portal; o catálogo e o validador de parâmetros da S11 não cobrem parceiro); aviso de decisão fica como dívida para a S25 — custo se errada: baixo.
- Ruling (S24 plano): exclusão de conta do dono apaga o membro em cascata e mantém parceiro, chaves e eventos; chaves de parceiro sem dono seguem até o admin suspender — custo se errada: médio (revisar na S17/LGPD).
- Dívida (S24 plano): convite de membros do parceiro; aviso de decisão ao parceiro (S25); publicação de lista por EdTech via API (sem fatia no PLAN); `/v1` no rate limit por IP da S19 (D-001); rotação do pepper (`hash_version` preparado, sem fluxo).

## S24 · Task 1 (migration 0501 e testes de banco; retomada após limite de uso)

- Ruling (S24 T1): worktree de continuação é `T2-pipeline` (`.track` = 2), não `T5-b2b` como o plano recomendava — o orquestrador retomou a sessão interrompida no worktree onde o WIP já estava (commit `18992ef`), e a S21 (que motivava reservar outro worktree) não estava rodando em T2 neste momento. Custo se errada: baixo (mover para T5 depois é só um `git worktree` novo; nenhuma migration aplicada fora do banco local desta trilha).
- Ruling (S24 T1): tipos de linha nomeados `public.b2b_school_row` e `public.b2b_visible_list_row` no lugar de `returns table(...)` para `b2b_v1_school_base`/`b2b_v1_visible_lists` — um `returns table` não registra um tipo composto nomeável (diferente de uma tabela real como `list_items`), e as funções `*_json` precisam de um tipo de linha para receber a saída. Custo se errada: baixo (é só uma forma de declarar o mesmo shape).
- Ruling (S24 T1): `#variable_conflict use_column` em `b2b_rate_consume` — os parâmetros OUT do `returns table` (`window_kind`, `limit_value`, ...) colidem com colunas reais de `b2b_rate_windows` mesmo em referências qualificadas dentro de `on conflict (...)` (limitação do PL/pgSQL); a função não referencia essas colunas como variável em nenhum ponto, então preferir a coluna é seguro. Custo se errada: baixo.
- Ruling (S24 T1): `b2b_keys_revoke_internal` (chamada só por `b2b_partner_decide` para revogação em massa por suspensão/rebaixamento) não grava `b2b_partner_events` própria — o evento `decided` já registra a decisão do admin; um evento `key_revoked` por chave poluiria a linha do tempo sem dado novo (a revogação em si já fica em `b2b_api_keys`/`audit_log`). A revogação explícita de UMA chave (`b2b_key_revoke`, ação do dono ou do admin) continua gravando seu próprio evento `key_revoked`. Custo se errada: baixo (adicionar de volta é aditivo).
- Ruling (S24 T1): testes corrigidos (fixture `seedKey` sem `revoked_at` ao semear `status: 'revoked'`; `IDS.spare` usado sem `ensureProfile` em três pontos; helper `fixture()` de RLS escrevendo direto como `authenticated`; consulta de `EXECUTE`/`search_path` do teste com precedência `and`/`or` errada, comparando `proconfig` sem normalizar aspas e incluindo por engano os montadores `*_json` — que não são `SECURITY DEFINER` por desenho, pois só formatam uma linha já lida — na exigência de `prosecdef`; literal `1` sem `::smallint` nas chamadas de `b2b_key_create`/`b2b_key_rotate`; fixture de cópia de pai sem `consent_id` e sem os 7 campos de `review_items_valid`) — todos eram bugs no rascunho de testes do implementador anterior, não do desenho da S24. Custo se errada: baixo (testes, não produção).
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build` verdes; `pnpm db:reset` duas vezes verde; 1528 testes de banco (0 pulados fora dos 3 já esperados de outras fatias), 2801 testes unitários, sem editar comportamento de nenhuma outra fatia.

## S24 · Task 2 (domínio, chaves, rate limit, API v1, OpenAPI, teste de vazamento)

- Ruling (S24 T2): `features/b2b/api/endpoints/index.ts` criado como agregador (arquivo extra, fora da lista nominal do brief) para montar `ENDPOINTS` sem `contract.ts` importar os módulos que o consomem (evitaria ciclo de import: cada endpoint importa `defineEndpoint` de `contract.ts`). Cada endpoint mantém seus tipos concretos (`schoolsEndpoint.entry`/`.impl`, usados com tipagem completa pelo próprio `route.ts`); só ao entrar no array heterogêneo o tipo é apagado por um cast duplo através de `unknown` (`as unknown as Endpoint`, nunca `any` — `EndpointEntry`/`EndpointImpl`/`Endpoint` usam `unknown` como default, não `any`, para o projeto continuar sem `any` em lugar nenhum). Custo se errada: baixo (é só uma forma de organizar o registro; a segurança de tipo em cada endpoint não é afetada).
- Ruling (S24 T2): `features/b2b/wiring.ts` criado (arquivo extra) espelhando `features/leads/wiring.ts` — composição real do `B2bService` (repositório ligado a `createAdminClient()`, `generateApiKey`, `hashSecret`, pepper de `getServerEnv()`). Sem ele, `actions.ts`/`admin-actions.ts`/`queries.ts` teriam que montar as dependências na mão em cada função. Custo se errada: baixo.
- Ruling (S24 T2): `withApiKey` embrulha a chamada a `deps.after()` em `try/catch`, caindo para chamar a gravação de uso direto (sem `after`) se `after()` lançar. O `after()` do `next/server` só funciona dentro do escopo de requisição do App Router e lança de forma síncrona fora dele — o que inclui os testes de banco (Task 2, Step 3/4), que chamam os `GET`/`POST` exportados diretamente, sem servidor Next real. Sem isto, nenhum teste de API contra o banco chegaria a uma resposta de sucesso. Também deixa a produção mais robusta (gravação de uso nunca derruba a resposta, mesmo se `after()` mudar de comportamento). Custo se errada: baixo.
- Ruling (S24 T2): a paginação por cursor de `schools.list` (chave `(normalized_name, inep)`) e `schools.lists` (chave `(school_year, grade.sort_order, id)`) precisa de `normalized_name` e `grade.sort_order`, que NÃO estão na whitelist da resposta. Em vez de expor esses campos ou reimplementar a normalização em JS (o `normalized_name` real vem do import do INEP, não de `search_normalize(name)` — podem divergir em acentuação, o que quebraria a paginação por keyset), o `impl` de cada endpoint faz uma leitura interna extra (`schools`/`grades` por `service_role`, nunca devolvida ao cliente) só para montar o cursor opaco da PRÓXIMA página. Custo se errada: baixo (uma leitura extra por página, só quando há próxima página).
- Ruling (S24 T2): `schools.lists`, `lists.get`, `lists.items` e `carts.match` chamam `b2b_v1_school`/`b2b_v1_list` primeiro para decidir 404 (escola/lista inexistente ou fora de cobertura/ambiente) ANTES de paginar os itens/listas — sem isso, "zero linhas" não distingue "recurso não visível" de "recurso visível mas vazio". Custo: uma chamada RPC extra por requisição a estes 4 endpoints. Custo se errada: baixo.
- Ruling (S24 T2): corrigido um bug herdado da Task 1 em `tests/db/b2b-fixtures.ts`: `purgePartners` tentava `delete from b2b_partner_events`, que é imutável por `enable always` (dispara mesmo com `session_replication_role = replica`) e tem FK `restrict` para `b2b_partners` — qualquer parceiro que passasse por `applyPartner`/`decide`/`createKey` (ou seja, quase todo teste) tornava o `afterAll` sempre falhar. A correção apaga tudo que pode (uso, janelas, chaves, membros, consentimento) e só remove a linha do PARCEIRO quando ele não tiver evento — mesma regra da produção ("parceiro, chaves e eventos ficam" na exclusão de conta). Banco local descartável: sobra inofensiva, some no próximo `pnpm db:reset`. Custo se errada: baixo (é um fixture de teste, não produção).
- Ruling (S24 T2): `/v1` entra em `EXTRA_DISALLOW` de `app/robots.ts` (junto de `/auth/`, `/api/`, etc.); `/b2b` já fica coberto automaticamente por entrar em `PREFIXES` (usado pelo `disallow` do mesmo arquivo). Não criei um mecanismo novo de `X-Robots-Tag` por rota para `/v1`/`/b2b` — o projeto já tem um mecanismo único em `next.config.ts`/`lib/robots-header.ts` (noindex site-wide fora da produção liberada; dali para frente só `robots.txt` decide), o mesmo usado hoje por `/admin`. Custo se errada: baixo.
- Ruling (S24 T2): `/b2b` entra em `PREFIXES`/`ALLOWED` de `features/auth/access.ts` com os quatro papéis de usuário logado (`parent`, `school_member`, `stationery_member`, `admin`; nunca `system`) — o gate de "é membro de fato" (`b2b_partner_members`) é responsabilidade do LAYOUT de `/b2b` (Task 3), não de `access.ts` (que só decide por papel, como já faz para `/papelaria`). Custo se errada: baixo.
- Ruling (S24 T2): `otherMethods()` devolve um `Record` com TODOS os métodos HTTP (inclusive os permitidos), não só os proibidos — com `noUncheckedIndexedAccess` ligado no `tsconfig`, um `Record<string, T>` parcial faria cada método desestruturado em `route.ts` carregar `| undefined` no tipo. Como o `route.ts` só desestrutura os métodos que não exportou como handler real, os métodos "permitidos" devolvidos por `otherMethods` nunca são usados; ficam só para o tipo de retorno ser total. Custo se errada: baixo.
- Ruling (S24 T2): `ApplyPartnerInputSchema.cnpj` só limita tamanho (1..20, aceita máscara); a validação do dígito verificador e a normalização para 14 posições `[0-9A-Z]` ficam no `B2bService.applyPartner`, via `features/stationeries/cnpj.ts` (`normalizeCnpj`/`isValidCnpj`) — reuso do domínio puro já em `main`, sem duplicar a lógica de DV. Custo se errada: baixo.
- Ruling (S24 T2): `quantity`/`unit` de `MatchableItem`/`MatchedItem` (`features/b2b/api/match.ts`) e da resposta de `carts.match` são `number | null`/`string | null`, espelhando `list_items.quantity numeric(10,2)` e `unit text`, ambos `null`-áveis na tabela. Custo se errada: baixo.
- Ruling (S24 T2): o escopo por endpoint tem duas fontes que precisam bater: `scopeFor(endpointId)` (mapa estático em `features/b2b/scopes.ts`, sem depender de `api/contract.ts`) e `entry.scope` (declarado em cada `defineEndpoint`). Um teste de contrato (`tests/b2b/contract.test.ts`) compara os dois para os 6 endpoints, então a duplicação não diverge silenciosamente. Preferido a uma dependência de `scopes.ts` -> `api/contract.ts` (ciclo) ou o inverso (`contract.ts` -> `scopes.ts` já existe; o inverso criaria o ciclo). Custo se errada: baixo.
- Ruling (S24 T2): uma vez que `verifyApiKey` resolve a chave (passou do "sem chave"/401 inicial), TODA resposta seguinte é contabilizada em `b2b_usage_daily` — inclusive `403 insufficient_scope`, `429 rate_limited` e o `401` de revogação em pleno consumo (`key_valid = false`). A frase do Global Constraints "chave inválida não é atribuída a ninguém" foi lida como o `401` de ANTES da chave resolver (ausente/malformada/inexistente/hash errado), não uma chave que era válida segundos atrás. Custo se errada: baixo (é só uma contagem agregada sem PII; o pior caso é contar uma chave que acabou de ser revogada).
- Ruling (S24 T2): a regex de telefone BR em `scanForForbidden` (`features/b2b/api/scan.ts`) exige o dígito `9` na posição de celular com `\b` nas pontas — sem essa exigência, a regex batia em pedaços de UUID (dígitos com hífen) e gerava falso positivo constante no teste de vazamento. É uma heurística deliberada (documentada no código): prefere super-detectar a deixar passar um telefone de verdade. Custo se errada: baixo.
- Ruling (S24 T2): o teste de vazamento (`tests/db/b2b-api-leak.test.ts`) NÃO semeia `parent_list_copies` ("cópia de pai com nome de aluno e apelido no item", citado no Global Constraints). Inspecionei `review_items_valid` (0204_human_review.sql): as únicas chaves aceitas em cada item são `name, quantity, unit, category, confidence, alerts, origin` — não existe campo de apelido/nome de aluno em nenhuma tabela do repositório hoje. `parent_list_copies` já está marcada "fora da API" no Ruling de planejamento da S24 e nenhuma função `b2b_v1_*` a toca. Risco residual: zero por construção (a tabela é inalcançável), mas a cobertura do teste de vazamento para este item específico do Global Constraints fica pendente até o campo existir de fato. Custo se errada: baixo.
- Ruling (S24 T2): a versão `superseded` semeada no teste de vazamento não recebe `submission_id` (tem FK para `list_submissions`, que por sua vez exige `consent_id` e uma checagem de `storage_path` autorreferente — monte completo só para este teste não valia o custo); usei `created_by`/`approved_by` (ids de perfil, mesma classe de risco) para provar que id interno nunca aparece na resposta. Custo se errada: baixo.
- Ruling (S24 T2): `repository.ts` (319 linhas) e `api/handler.ts` (323 linhas) passam de 250 linhas. Nenhum dos dois é componente React (a regra do CLAUDE.md é explícita sobre componente React); são o pipeline central de autenticação/rate-limit/parse e o repositório com 12 operações (dono + admin). Decidi não fatiar sem necessidade clara (a instrução do controlador pede isso): cada um tem uma responsabilidade coesa (um pipeline, um repositório) e fatiar agora criaria acoplamento entre arquivos novos sem ganho de legibilidade óbvio. Reporto como observação no relatório, não como bloqueio.
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build` verdes; `pnpm db:reset` verde; domínio 128/128 (`tests/b2b/`, incluindo os novos desta task), suíte unitária completa 2986/2986, banco 1597/1600 (3 pulados, mesmo número da baseline antes desta task), sem editar comportamento de nenhuma outra fatia.

## S24 · Task 2 — correções da revisão de segurança (Opus, "Needs fixes")

- Ruling (S24 T2 revisão): `runApiPipeline` embrulha a chamada a `verifyApiKey` (e, por dentro, `deps.lookupKey`) em `withTimeout` + `try/catch`, e `withApiKey` embrulha a construção de `buildRealDeps()` (que chama `createAdminClient()`, capaz de lançar de forma síncrona) também em `try/catch`. Sem isto, um erro de RPC no lookup ou uma variável de ambiente ausente escapavam do Route Handler como um 500 genérico do Next (sem envelope, sem `no-store`/`nosniff`/`X-Request-Id`) em vez do `503`/`500` padrão do contrato. Custo se errada: baixo (é defesa em profundidade; o caminho feliz não muda).
- Ruling (S24 T2 revisão): extraídas `realLookupKey(admin)`, `realConsumeRate(admin)` e `realRecordUsage(admin)` de dentro de `buildRealDeps()` para funções exportadas de `handler.ts` — usadas pelo teste de aceite "revogação entre lookup e consumo" (`tests/db/b2b-api.test.ts`), que monta um `withApiKey(entry, impl, { lookupKey: ... })` com o lookup REAL envolvido por um efeito colateral (revogar por SQL no meio). Custo se errada: baixo.
- Ruling (S24 T2 revisão): `features/b2b/api/openapi.ts` agora documenta o ENVELOPE real (`{ data, next_cursor?, meta }` no 200; `{ error: {...} }` nos erros) via `successEnvelopeSchema`/`ERROR_ENVELOPE_SCHEMA` exportados, com `examples` (plural, `summary` "ilustrativo") — não mais um `schema` de só `data` com um `example` de formato inventado (`{note, request, response}`) que não validava contra nada. `servers` passou a ser `{url: "/"}` (não `/v1`) porque `entry.path` já inclui o prefixo `/v1` — a combinação antiga geraria `/v1/v1/schools` num cliente gerado. 429 agora documenta `Retry-After`. Custo se errada: baixo (documentação; a API real não mudou).
- Ruling (S24 T2 revisão): `tests/db/b2b-api-leak.test.ts` reescrito para iterar `ENDPOINTS` (o registro real, não uma lista escrita à mão): para cada endpoint, `live` E `test`, sucesso (+ paginação quando paginado), 401 sem chave, 403 quando declara `insufficient_scope`, 404 quando declara `not_found`, 400 quando declara `invalid_request`, e 413/415 quando `carts.match` os declara. Um endpoint novo no registro sem fixture correspondente faz o teste LANÇAR (não passa em silêncio) — corrige o risco "rota fora do registro escapa da varredura" apontado pelo Review Focus. Um novo teste ("todo endpoint tem sucesso live e test") pegou um bug real pré-existente: a lista "sensível" nunca tinha `school_lists.is_demo = false` setado explicitamente (a fixture `seedList` sempre insere `is_demo = true`), então ela nunca foi de fato visível sob a chave `live` — o teste antigo não notava porque nunca exigia 200 especificamente para aquele caso. Corrigido com um `update` explícito depois do `seedList`. Custo se errada: baixo (achado e corrigido; sem o teste mais estrito isto ficaria invisível).
- Achado sem correção nesta rodada (registrado para a revisão final do branch, conforme instrução do revisor): prefixo `lc_<env>` não comparado ao ambiente da linha em `verify.ts`; uso gravado quando `keyValid=false`; `catch{}` silencioso do `after()`; leitura do corpo sem streaming; `next_cursor` pode aparecer numa página final cheia (buscar `limit+1`); 405 do `openapi.json` sem envelope; Server Actions de admin sem Zod; `actions.ts` devolve `GeneratedApiKey` inteiro; `verify.test.ts` não espiona `timingSafeEqual`; `parent_list_copies` sem cenário sentinela (risco estrutural nulo, confirmado pelo revisor). Nenhum destes é Critical/Important; ficam para a revisão final.
- Estado (após a correção): `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build` verdes (`pnpm db:reset` antes do `test:db`); suíte unitária 2993/2993 (domínio `tests/b2b/` com +7 testes novos de timeout/erro de lookup), banco 1599/1602 (3 pulados = baseline). Um flake pré-existente e não relacionado (`tests/leads/repository.test.ts`) apareceu numa rodada e não reproduziu depois de um `db:reset` limpo — não investigado further (fora do escopo desta correção).

## S24 · Task 3 (portal do parceiro, chaves, documentação, admin de parceiros e E2E)

- Ruling (S24 T3): `app/parceiros/actions.ts` reexporta `applyPartnerAction` de `features/b2b/actions.ts` SEM a diretiva `"use server"` no próprio arquivo — um arquivo `"use server"` só pode exportar funções assíncronas (regra do compilador do Next/Turbopack; `pnpm build` recusa um `export { fn } from "..."` nesse tipo de arquivo). A action em si já é uma Server Action (a diretiva mora em `features/b2b/actions.ts`); este arquivo só encaminha a referência, no mesmo padrão de import que as outras rotas usam. Custo se errada: baixo (build já recusa; achado e corrigido antes do commit).
- Ruling (S24 T3): corrigido `revalidatePath("/b2b/chaves")` → `revalidatePath("/b2b/api")` em `createKeyAction`/`rotateKeyAction`/`revokeKeyAction` (`features/b2b/actions.ts`) — a Task 2 escreveu o caminho antes de a Task 3 decidir o nome real da rota (`/b2b/api`, não `/b2b/chaves`). Efeito prático baixo (as páginas de `/b2b/**` são `force-dynamic`, então o Full Route Cache não guardava nada de qualquer forma), mas o caminho errado ficaria como uma pista falsa. Custo se errada: baixo.
- Ruling (S24 T3): três funções aditivas novas em `features/b2b/repository.ts`/`service.ts`/`wiring.ts`/`queries.ts` — `partnerHeader` (Empresa/Razão social/CNPJ/contato/tipo/cobertura/motivo/demonstração, exposto como `getMyPartnerHeader`/`getPartnerHeaderForAdmin`) e `listPartnerEvents` (linha do tempo, exposto como `listPartnerEventsForAdmin`) — porque `b2b_partner_overview` (Task 1/2) só devolve agregados (status, limites, uso, chaves), sem os dados de cadastro que B2B00/B2B01 (nome da empresa no cabeçalho), `/b2b/conta` e o Admin15 (dados do cadastro + linha do tempo) exigem no brief. Nenhuma função existente mudou de assinatura ou comportamento; são leituras novas, com o mesmo padrão de autorização das já existentes (owner resolve o próprio id via `myPartnerId`; admin via `requireAdmin`). `listPartnerEvents` nunca seleciona `actor_id` (mesma exclusão do `grant` de `authenticated` em `b2b_partner_events`, ainda que o cliente aqui seja de serviço). Testado em `tests/b2b/service.test.ts` (checagem de admin) e `tests/db/b2b-repository.test.ts` (dado real). Custo se errada: baixo (aditivo; revisão deve conferir que não expõe campo fora do previsto — `contact_name` sai só para dono/admin no portal, nunca pela API `/v1`).
- Ruling (S24 T3): B2B03 (`/b2b/docs`) e a página pública `/parceiros/docs` importam `ENDPOINTS`/`buildOpenApi` direto de `features/b2b/api/*` (Server Components, então o `"server-only"` desses módulos não é problema) em vez de fazer `fetch` para `/v1/openapi.json` em runtime — evita depender da própria origem estar acessível durante a renderização (e um SSRF-para-si-mesmo desnecessário) e usa exatamente a mesma função que a rota pública já expõe. O componente `EndpointDoc` (`components/b2b/EndpointDoc.tsx`) é o único ponto que roda `z.toJSONSchema` sobre os esquemas do contrato para desenhar a tabela de parâmetros/corpo; nunca há uma lista de endpoints escrita à mão em nenhuma das duas páginas. Custo se errada: baixo.
- Ruling (S24 T3): a coluna "Chamadas hoje"/"Limite/dia" do Admin15 (`app/admin/parceiros/page.tsx`) busca `b2b_partner_overview` de CADA parceiro listado (`Promise.all`) porque `AdminPartnerRow` (Task 2, usado pela listagem) não carrega uso nem limite. N+1 chamadas RPC aceitável na escala do piloto (mesma linha de raciocínio do Ruling de rate limit da Task 2 — "aceitável no volume do piloto; revisitar com carga real"); paginação/agregação em lote fica para quando o número de parceiros justificar. Custo se errada: baixo.
- Ruling (S24 T3): não adicionar "Parceiros" ao rodapé do site (`components/site/SiteFooter.tsx`) — colidiria com `tests/site/copy-claims.test.tsx` (regex `/parceir/i` do item "parceria", que existe para pegar afirmação fabricada de parceria comercial, não o link legítimo desta fatia). `/parceiros` já é indexável e está em `app/sitemap.ts`; fica alcançável direto e por busca, só sem link no rodapé do site de pais/escolas. Ajustar o teste para abrir uma exceção ao link do rodapé ficaria para quem tiver mandato sobre a cópia de `tests/site/*` (fora do escopo desta task). Custo se errada: baixo (link de navegação, não funcionalidade).
- Ruling (S24 T3): Admin15 `KeyList` (`app/admin/parceiros/[id]/KeyList.tsx`) revoga por um `<form>` simples com `action={adminRevokeKeyAction}`, sem diálogo de confirmação client-side (diferente do `RevokeButton` do dono, que tem `<dialog>` com o aviso "para de funcionar imediatamente") — o admin já está numa tela de gestão dedicada ao parceiro (não uma lista onde um clique errado é mais provável); um diálogo de confirmação aqui duplicaria `RevokeButton` sem ganho de segurança adicional. Custo se errada: baixo (pode virar diálogo depois, se um admin real pedir).
- Ruling (S24 T3): o cenário "membro de outro parceiro recebe 404 em ids alheios" do brief NÃO foi repetido no roteiro de navegador — nenhuma tela do portal do dono aceita um id de outro parceiro em formulário ou URL (revogar/rotacionar sempre usam o `keyId` da própria `PartnerOverview`, nunca um campo livre nem um parâmetro de rota); não há como provocar esse caminho pela UI sem forjar uma chamada de Server Action fora do fluxo real. A garantia já está coberta por `tests/db/b2b-repository.test.ts` (Task 2: `getPartner`/`adminRevokeKey` com `forbidden` mascarado como `not_found`) e pelo teste de vazamento (`tests/db/b2b-api-leak.test.ts`, dado de outro parceiro na API). Documentado em `docs/superpowers/e2e/S24.md`. Custo se errada: baixo (a defesa em profundidade real está na função SQL, testada; a lacuna é só de repetição no E2E de navegador).
- Achado de ambiente (E2E, sem código de produção envolvido): `lib/env.ts` `getServerEnv()` exige `OPENROUTER_KEY`/`AI_MODEL_CHEAP`/`AI_MODEL_STRONG` (não usados pela S24) e `features/b2b/wiring.ts` mascara QUALQUER erro de `getServerEnv()` (inclusive esses, não relacionados ao pepper) como "pepper ausente" — sem esses três valores no `.env.local`, `/v1/**` responde sempre `503 service_unavailable`, mesmo com `B2B_API_KEY_PEPPER` certo. Preenchidos com valores fictícios só para o `.env.local` local desta trilha (nunca usados de fato, já que a S24 não aciona IA); documentado em `docs/superpowers/e2e/S24.md` para quem for reproduzir o roteiro isolado. Não é um achado de segurança (o pepper real continua exigido; o `503` acontecia por FALTA de outra variável, nunca por ela estar presente) — registrado para não repetir a mesma investigação.
- Ruling (S24 T3): sessões do agent-browser usam o prefixo `t2s24-` (não `t5s24-` do texto geral do brief) — mesma trilha (`T2-pipeline`) já fixada pelo Ruling da Task 1.
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build` verdes (`pnpm db:reset` duas vezes, ambas verdes — uma rodada intermediária pegou dois flakes de timing não relacionados à S24, `tests/db/jobs.test.ts` e `tests/db/audit.test.ts`, cada um passando isolado e na rodada seguinte completa); suíte unitária 3031/3031 (+38 sobre a baseline: `tests/b2b/components.test.tsx`, `tests/b2b/portal-pages.test.tsx`, `tests/b2b/admin-pages.test.tsx` e os testes novos de `getMyPartnerHeader`/`getPartnerHeader`/`listPartnerEvents` em `tests/b2b/service.test.ts`), banco 1601/1604 (3 pulados = baseline, +3 sobre a Task 2: `partnerHeader` e `listPartnerEvents` em `tests/db/b2b-repository.test.ts`). E2E: `scripts/e2e-s24.sh`, 41 verificações, 0 falhas (relatório completo em `docs/superpowers/e2e/S24.md`), rodado de ponta a ponta contra o build de produção local da trilha 2 com Supabase local, seed próprio (`scripts/e2e-s24-seed.sql`) e `agent-browser` de verdade (sem simulação).

## S24 · Task 3 — correções da revisão de segurança/spec (Opus, "Needs fixes")

- Ruling (S24 T3 revisão): selos "Em breve" de `app/parceiros/page.tsx` agora usam `isB2bFeatureEnabled(flag)` por recurso: `widget` (widget), `campaigns` (sugestão patrocinada, checagem Procon automática e "Lista oficial intocada" — tratados como a mesma regra de campanha de marca), `insights` (relatórios de demanda), `webhooks` (webhooks de publicação). Antes o `soon` era fixo no JSX, contrariando o Global Constraints ("controlado por `B2B_FEATURES`"). Custo se errada: baixo (mapeamento de cópia; ajustar o flag de um item é uma linha).
- Ruling (S24 T3 revisão): suspender e recusar no `DecisionForm` (Admin15) passam por um `<dialog>` de confirmação (texto do design como corpo, não mais entre aspas no rótulo do motivo) antes de chamar a Server Action; as demais decisões continuam enviando direto no clique do botão principal, sem diálogo extra. Acrescentado um polyfill mínimo de `HTMLDialogElement.showModal`/`close` em `vitest.setup.ts` (jsdom não implementa a Dialog API) — sem ele nenhum teste de componente conseguiria clicar nos diálogos já existentes (`NewKeyDialog`/`RotateDialog`/`RevokeButton`), o que tinha passado despercebido porque nenhum teste anterior de fato clicava esses botões. Custo se errada: baixo.
- Ruling (S24 T3 revisão): `/parceiros` ganhou um link "Entrar no portal" sempre visível apontando direto para `/b2b` (a rota já resolve login e vínculo sozinha, sem duplicar a lógica na landing) e, para quem já é dono de um parceiro (`getMyPartnerHeader`), o `ApplyForm` vira um cartão "Ir para o portal" em vez de mostrar o formulário de novo (que só devolveria `already_member`). Custo se errada: baixo.
- Achado corrigido (não pedido pela revisão, encontrado ao rodar o gate): `tests/db/b2b-read-functions.test.ts` usava `current_date` (fuso da sessão, UTC) para inserir uso de "hoje", mas `b2b_partner_overview` calcula "hoje"/"este mês" em `America/Cuiaba` — entre 00h00 e 03h59 UTC os dois dias civis divergem e o teste falha de forma determinística (não é uma flake de concorrência). Corrigido usando a mesma expressão da função (`(now() at time zone 'America/Cuiaba')::date`) no fixture. Reproduzido, corrigido e confirmado verde na própria janela horária da falha. Custo se errada: baixo (é um teste, não produção; mas sem a correção o gate falharia de novo todo dia nesse horário).
- Ruling (S24 T3 revisão, minor de baixo custo aproveitado): `DecisionForm` usa `PARTNER_TEST_RATE_PER_MINUTE`/`_DAY`/`PARTNER_LIVE_RATE_PER_MINUTE`/`_DAY` de `features/b2b/limits.ts` para `min`/`max`/`defaultValue` (era `1`/`10000`/`60` etc. soltos no componente); `NewKeyDialog` usa `MAX_USABLE_KEYS_PER_ENVIRONMENT` em vez do literal `2`. Custo se errada: baixo.
- `tests/b2b/portal-pages.test.tsx` (258 linhas depois dos testes novos) dividido em `tests/b2b/parceiros-pages.test.tsx` (`/parceiros*`, público) e `tests/b2b/portal-pages.test.tsx` (`/b2b/*`, portal) para respeitar o limite de 250 linhas do lint — mesmo padrão já usado para separar `tests/b2b/admin-pages.test.tsx` na entrega anterior.
- Demais itens "Minor" do finding (posição/CSS do diálogo nas capturas antigas, screenshot com chave de teste em claro, aviso de pepper reativo, revogação do admin sem confirmação, N+1 do Admin15, texto do Ruling de 404 entre parceiros, `realPepper()` sem log, CNPJ sem máscara, `?cadastro=1` não lido) ficam em aberto por decisão explícita do revisor ("não precisa corrigir agora"); listados de novo no relatório (`task-3-report.md`) para a revisão final do branch.
- Estado (após a correção): `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build` verdes (`pnpm db:reset` antes do `test:db`); suíte unitária 3039/3039 (+8: 4 testes do `DecisionForm` — confirmação de suspender/recusar, envio direto sem confirmação, cancelar — em `tests/b2b/admin-pages.test.tsx`, e 4 em `tests/b2b/parceiros-pages.test.tsx` — selo Em breve some com a flag, "Ir para o portal" para quem já é membro, sem o link para quem não é, "Entrar no portal" para visitante); banco 1601/1604 (3 pulados = baseline, incluindo a correção do teste de fuso). Verificação manual real no navegador (build de produção local, porta 3002): cadastro completo por magic link, aprovação a `active`, tentativa de suspensão mostrando a confirmação com o texto exato do design, status só muda depois de confirmar, `curl` confirmando o link "Entrar no portal" no HTML servido.

## S24 · Task 3 — correção da re-revisão (Opus): defaultValue = min quebrava os limites aprovados

- Ruling (S24 T3 re-revisão): a correção do Minor "limites soltos no `DecisionForm`" (rodada anterior) introduziu uma quebra Important nova: `defaultValue={range.min}` usava o MÍNIMO permitido (`1` nas quatro faixas de `features/b2b/limits.ts`) como valor padrão do formulário, então aprovar/promover sem editar os campos deixava o parceiro com 1 req/min e 1 req/dia, sem aviso na tela. Corrigido com a Opção A sugerida pelo revisor: cada `Range` de limite de taxa ganhou um `default` explícito (novo tipo `RangeWithDefault`, mesmo padrão já usado por `KEY_ROTATION_GRACE_DAYS`), com os valores que existiam antes de qualquer correção desta task (60/1000 sandbox, 60/2000 produção); `min`/`max` continuam vindo da mesma fonte única, só o `defaultValue` do formulário trocou de `.min` para `.default`. `scripts/e2e-s24.sh` não precisou de ajuste: já preenche os quatro campos explicitamente em toda decisão, nunca dependeu do padrão do formulário (conferido por grep antes de decidir não mexer). Custo se errada: baixo (é um valor de UI; o servidor sempre valida contra `min`/`max` de qualquer forma — o risco era só operacional, não de segurança).
- Teste novo em `tests/b2b/admin-pages.test.tsx`: aprova sem tocar nos campos de limite e confere que o `FormData` enviado à `action` tem os quatro campos iguais ao `default` de `limits.ts`, nunca `"1"`.
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes; suíte unitária 3040/3040 (+1); banco 1601/1604 (3 pulados = baseline, sem regressão do teste de fuso corrigido na rodada anterior).

## S24 · Correção da revisão FINAL do branch (Opus, Tasks 1+2+3 juntas) — última rodada

- Ruling (revisão final, Important #1): `DecisionForm` só pedia confirmação para `to === "suspended" || "rejected"`, escrito à mão; `active -> sandbox` (rebaixar, que `keysRevokedOnTransition` já marca como revogando as chaves `live`) enviava direto, com o rádio JÁ pré-selecionado (`useState(options[0])`). Corrigido: a necessidade de confirmação agora é `keysRevokedOnTransition(status, to) !== null` (nunca mais uma lista de status escrita à mão — cobre automaticamente qualquer transição futura que passe a revogar chave); nada vem pré-selecionado (`useState<B2bPartnerStatus | null>(null)`); o botão principal voltou a ser `type="submit"` e o `<form>` ganhou `onSubmit` (intercepta clique E o Enter implícito num campo, não só o clique no botão) que chama `formRef.current.reportValidity()` antes de abrir o diálogo (evita abrir com campo obrigatório vazio) e usa um `bypassRef` (não state, para o valor estar pronto no mesmo tick do `requestSubmit()`) para deixar a confirmação passar direto na segunda chamada. `labelFor`/`confirmationFor`/`PLAN_OPTIONS` extraídos para `app/admin/parceiros/[id]/decision-copy.ts` (puro, sem JSX) só para o componente caber em 250 linhas. Custo se errada: alto seria o cenário original (rebaixar sem querer revogando produção sem aviso); a correção em si é de baixo risco (mais uma checagem antes de enviar).
- Ruling (revisão final, Important #2): `DecisionForm` ignorava plano/cobertura/limites ATUAIS do parceiro — aprovar/promover sem editar resetava a cobertura para nacional e os limites de sandbox para os padrões de negócio, mesmo para um parceiro que já tinha plano Regional (MT) definido. Corrigido: `DecisionForm` recebe `plan`/`coverageUfs`/`limits` (de `PartnerOverview`, já carregados por `getPartnerForAdmin`) como props opcionais; `app/admin/parceiros/[id]/page.tsx` passa `overview.plan`/`overview.coverageUfs`/`overview.limits`. O select de Plano usa `defaultValue={plan ?? ""}`; o checkbox Nacional inicia com `coverageUfs == null`; cada checkbox de UF ganha `defaultChecked={coverageUfs?.includes(uf) ?? false}`; cada campo de limite usa `limits?.<campo> ?? <RANGE>.default` (parceiro que nunca teve o campo cai no padrão de negócio, não em nacional/generic por acidente). Custo se errada: médio (uma aprovação de rotina alargando silenciosamente a cobertura que o parceiro enxerga) — por isso a prioridade Important.
- Ruling (revisão final, Important #3): `realPepper()` (`features/b2b/api/handler.ts`) e o `pepper` de `getB2bService()` (`features/b2b/wiring.ts`) engoliam QUALQUER exceção de `getServerEnv()` sem log — não só a falta do pepper, qualquer variável inválida/ausente do `serverSchema` inteiro (`OPENROUTER_KEY`, `AI_MODEL_*` etc.) derrubava a API B2B inteira com `503` sem pista nenhuma no log. Corrigido: os dois `catch` agora fazem `console.error("b2b pepper/env", error instanceof Error ? error.name : "erro")` — só o NOME do erro, nunca a mensagem/stack (evita ecoar um valor inválido no log). Custo se errada: baixo (só logging; nenhuma mudança de comportamento da resposta).
- Ruling (revisão final, correção barata #1): os `<dialog>` de `NewKeyDialog`, `RotateDialog`, `RevokeButton` (dono) e o novo diálogo de confirmação do `DecisionForm`/`AdminRevokeButton` ganharam `m-auto` na classe — o preflight do Tailwind remove o `margin: auto` padrão do elemento `<dialog>`, deixando-o no canto superior esquerdo e cortado (visível nas capturas antigas do E2E). Confirmado corrigido nas capturas novas.
- Ruling (revisão final, correção barata #2): `docs/superpowers/e2e/screenshots/S24-b2b-nova-chave.png` mostrava uma chave `lc_test_…` completa em claro (chave de teste local, pepper aleatório só desta trilha, banco resetável — sem risco real, mas contraria "texto claro nunca persistido em lugar nenhum" e pode disparar scanner de segredo em CI). O implementador redigiu com Pillow, mas em seguida reexecutou `scripts/e2e-s24.sh` do zero para confirmar o gate pós-correção, e o script recapturou essa tela SEM a redação (`scripts/e2e-s24.sh` não redige, só tira a captura) — a versão commitada em `c99467d` continuava com a chave legível; a re-revisão (Opus) do fix wave final pegou isso como achado residual. Corrigido diretamente pelo controlador (não é rodada de correção nova: é a adjudicação do achado, o script não muda de comportamento e não há chave real a proteger além da de teste) — retângulo sólido + nota "[chave em claro redigida]" sobre a mesma região, arquivo verificado visualmente depois. Registrado em DEBT.md (D-119): `scripts/e2e-s24.sh` precisa aplicar a redação automaticamente (ou mascarar antes do `shot`) para não repetir o problema numa próxima execução — custo se não corrigir o script: baixo (mecânico, refazer a redação manual a cada rerun até alguém ajustar o script).
- Ruling (revisão final): revogar pelo Admin15 (`KeyList.tsx`) era irreversível e sem confirmação nenhuma. Em vez de duplicar o `RevokeButton` do dono com uma Server Action nova (ele usa `revokeKeyAction`, que devolve `ActionResult` sem redirect; o admin usa `adminRevokeKeyAction`, redirect-based), criei `app/admin/parceiros/[id]/AdminRevokeButton.tsx`: mesmo texto/UX de confirmação, mas o `<dialog>` só intercepta o envio do MESMO `<form action={adminRevokeKeyAction}>` já existente (sem criar uma segunda Server Action) — barato de verdade, como o revisor sugeriu.
- `scripts/e2e-s24.sh` ajustado: o passo de suspensão agora clica "Suspender agora" na confirmação depois de enviar a decisão (antes o clique no botão principal já bastava). Roteiro completo rerodado do zero: **41/41 verificações verdes**. Verificação manual adicional (fora do roteiro fixo, via agent-browser) dos dois caminhos que o script não cobre: "Rebaixar para sandbox" (confirmação com o texto certo, valores atuais pré-preenchidos, chave revogada só depois de confirmar) e revogação pelo Admin15 (mesma confirmação do dono) — capturas em `/tmp` (não commitadas, só verificação ad-hoc).
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes; suíte unitária **3044/3044** (+4: `tests/b2b/decision-form.test.tsx`, novo arquivo dedicado — as 5 verificações de `DecisionForm` movidas de `admin-pages.test.tsx` mais 4 novas: nada pré-selecionado, confirmação para rebaixar, valores atuais como padrão, padrão nacional/plano vazio quando o parceiro nunca teve); banco 1601/1604 (3 pulados = baseline). E2E: `scripts/e2e-s24.sh`, 41/41, rodado do zero após todas as correções desta rodada.

## S24 · correções da revisão de segurança independente

Revisão de segurança independente (Opus, fora do fluxo desta sessão), sobre o commit `5b4196e` — 7 achados, TDD (vermelho capturado em `.superpowers/sdd/2026-09-25-s24-portal-b2b/tdd-red-seguranca-independente.log` antes de qualquer correção de produção).

- Ruling (S24 correções segurança independente, item 1): `insufficient_scope` não consumia `consumeRate` (uma chave válida com escopo errado martelava o endpoint de graça, sem contar contra cota nem uso). Reordenado `runApiPipeline` (`features/b2b/api/handler.ts`) para chamar `consumeRate` ANTES da checagem de escopo — mesma posição que já valia para `rate_limited` (a cota vence: se já estourada, o 429 sai mesmo com escopo errado; se não, a checagem de escopo roda depois e responde 403, já contabilizado). Escolhi reordenar em vez de um "bucket" separado para `insufficient_scope`: mais simples, reaproveita a métrica existente, e o resultado prático (a chave consome cota de qualquer jeito) é o mesmo que o revisor pediu. Coberto por dois testes novos em `tests/b2b/handler.test.ts` (403 consumindo cota; 429 vence quando a cota já estourou mesmo com escopo errado). Custo se errada: baixo (mudança de ordem local, sem novo estado; pior caso é uma chave com escopo errado consumir 1 unidade de cota a mais do que consumiria antes).
- Ruling (S24 correções segurança independente, item 1b): limite por IP em memória, por INSTÂNCIA (`Map` de módulo em `features/b2b/api/handler.ts`), aplicado antes até do pepper/`verifyApiKey` — primeiro valor de `x-forwarded-for` (a Vercel prefixa o IP real do cliente) ou, na ausência, `x-real-ip`; sem nenhum dos dois, NÃO bloqueia (só `console.warn`, para não punir tráfego atrás de um proxy sem cabeçalho identificável). Cap escolhido: **60 requisições/minuto por IP, janela fixa** — mesma ordem de grandeza do limite padrão de chave (`PARTNER_TEST_RATE_PER_MINUTE.default` = 60 em `features/b2b/limits.ts`), alto o bastante para não incomodar tráfego legítimo atrás de NAT/proxy corporativo compartilhando IP, baixo o bastante para reduzir o custo de martelar `/v1` sem key válida (hoje isso já cai em `invalid_key` sem tocar o banco, mas ainda gasta CPU/rede da função). `429` com `Retry-After`, sem consultar o banco. **Pendência do HUMANO, registrada aqui e em PROGRESS.md**: este limite é só a primeira camada, por instância — não há estado compartilhado entre lambdas/instâncias da Vercel; o limite de VERDADE, global e entre todas as instâncias, precisa ser configurado no Vercel Firewall/Edge Config pelo humano. Este código NUNCA tocou Vercel nem infraestrutura, só a aplicação. Coberto por dois testes novos em `tests/b2b/handler.test.ts` (61ª requisição da mesma origem em 429 antes de consultar a chave; ausência dos dois cabeçalhos não bloqueia, só loga). Custo se errada: médio se o cap escolhido (60/min) for baixo demais para algum parceiro legítimo atrás de um proxy compartilhado (mitigado pelo Firewall do humano, que pode allowlistar); baixo do lado da segurança (é só a primeira camada, nunca a única).
- Ruling (S24 correções segurança independente, item 2): `POST /v1/carts/match` sem `content-length` deixava `request.text()` ler o stream inteiro antes de qualquer checagem de tamanho — um corpo malicioso grande sem esse cabeçalho passava batido pela checagem existente. Substituído por `readBodyLimited` (`features/b2b/api/handler.ts`): lê `request.body` (um `ReadableStream`) pedaço a pedaço via `getReader()`, somando bytes, e corta (`reader.cancel()` + `413 payload_too_large`) ASSIM QUE passar de `maxBytes` — nunca espera o stream terminar. Testado com um `ReadableStream` artificial que nunca fecha sozinho (`tests/b2b/handler.test.ts`): confirma que o corte acontece bem antes do limite de segurança do teste (`pulls < 50`) e que `cancel()` foi chamado de verdade no stream. Custo se errada: baixo (a checagem de `content-length` continua como atalho quando o cabeçalho existe e já é grande o bastante; a mudança só afeta o caminho sem esse cabeçalho ou com um valor mentiroso).
- Ruling (S24 correções segurança independente, item 3): `withTimeout` corria uma `Promise.race` contra `setTimeout`, mas a chamada real ao Postgres/PostgREST continuava rodando em segundo plano depois do timeout "vencer" (desperdiçando conexão/CPU do banco). Criado `withAbortTimeout` (`features/b2b/api/handler.ts`): monta um `AbortController` de verdade, chama `.abort()` quando o timeout vence, e passa `controller.signal` para `lookupKey`/`consumeRate` (`ApiHandlerDeps` ganhou um segundo parâmetro opcional `signal?: AbortSignal` nas duas). `realLookupKey`/`realConsumeRate` encaminham esse `signal` para `.abortSignal()` do supabase-js (confirmado por inspeção do código-fonte que o método existe em `@supabase/postgrest-js@2.117.1`), cancelando a consulta no servidor de verdade. Escopo: só `lookupKey`/`consumeRate` (as duas chamadas de banco do próprio pipeline) — o timeout do `impl` continua com a `Promise.race` antiga, porque cancelar a lógica de negócio arbitrária de cada endpoint exigiria propagar `signal` por todo `EndpointImpl`, fora do que os 7 achados pediram (achados citam nominalmente `realLookupKey`/`realConsumeRate`). Comentário de `API_DB_TIMEOUT_MS` (`features/b2b/limits.ts`) atualizado para descrever o cancelamento real. Testado com dois testes novos (`tests/b2b/handler.test.ts`) que capturam o `AbortSignal` recebido e confirmam `.aborted === true` depois do timeout. Custo se errada: baixo (mudança aditiva de cancelamento; pior caso sem a correção já era o comportamento anterior, não uma regressão).
- Ruling (S24 correções segurança independente, item 4): o prefixo de ambiente do cabeçalho (`lc_test_`/`lc_live_`) nunca era comparado ao `environment` da linha do banco em `verifyApiKey` (`features/b2b/keys/verify.ts`) — sem escalada de privilégio hoje (o ambiente USADO na autorização é sempre o da linha, nunca o do prefixo), mas faltava a defesa em profundidade. Adicionada a comparação `parsed.environment === row.environment`, incluída na MESMA condição que já decidia `invalid_key` (`!row || !equal || !row.usable`) — logo depois do `timingSafeEqual`, que já roda incondicionalmente antes dessa linha (não há atalho de tempo novo: o hash sempre é comparado primeiro, do mesmo jeito, para os dois ambientes). Mesmo código de erro genérico (`invalid_key`) nos dois sentidos (live apresentada como test e vice-versa). Testado nas duas direções em `tests/b2b/verify.test.ts`. Custo se errada: baixo (é uma checagem a mais que só pode REJEITAR um caso que antes passava; nenhum caso hoje válido passa a falhar, porque uma chave real sempre tem o prefixo do seu próprio ambiente).
- Ruling (S24 correções segurança independente, item 5): os `grant select` em `0501_b2b_partners_api.sql` para `authenticated` eram de tabela inteira em `b2b_partners` (incluindo `decided_by`, UUID de perfil do admin que decidiu) e incluíam `created_by`/`revoked_by` (UUID de perfil de quem criou/revogou) em `b2b_api_keys`. Trocados por `grant select (<lista de colunas>)` explícitos, excluindo essas três colunas para `authenticated`; `service_role` mantém a tabela inteira (`b2b_partners`) ou a lista completa incluindo as três colunas (`b2b_api_keys`), porque o backend (funções SQL, `wiring.ts`) precisa delas. Confirmado por grep que nenhum código de aplicação lê essas três colunas via um cliente com escopo `authenticated` (só via `service_role`/RPC, que este grant não afeta). `pnpm db:reset` reaplicado do zero e `pnpm test:db` confirma verde, incluindo os três `select` novos em `tests/db/b2b-partners.test.ts` que agora esperam `42501` para `decided_by`/`created_by`/`revoked_by` (antes passavam — essa é a correção, não uma regressão). Custo se errada: baixo (grant só de leitura; menos exposição nunca quebra um fluxo que não devia depender dela).
- Ruling (S24 correções segurança independente, item 6): `scripts/e2e-s24.sh` imprimia a chave em texto claro na mensagem de falha (`bad "..." "$TESTKEY"` etc.) se a asserção correspondente falhasse. Adicionado `mask_key()` (mesmo padrão do `KeyMask` do app: prefixo do ambiente + últimos 4 caracteres) e trocadas as três chamadas (`criar chave test`, `criar chave live`, `rotação`) para usar `mask_key "$X"` em vez do valor cru. Custo se errada: baixo (só afeta a mensagem de um `FAIL`; roteiro já roda 41/41 verde, então este caminho nem é exercitado numa execução normal).
- Ruling (S24 correções segurança independente, item 7): `getKeyEnvironment` (`features/b2b/repository.ts`) lia o ambiente de QUALQUER `keyId`, sem checar posse — chamado por `rotateKey` (serviço) ANTES de `b2b_key_rotate` (que já checava posse), revelava se um `keyId` de outro parceiro existia e qual o ambiente dele, mesmo que a rotação em si fosse recusada depois. Corrigido: `getKeyEnvironment` agora recebe `actor: SessionActor`, resolve o `partnerId` do ator via `myPartnerId` e filtra o `select` por `partner_id` além de `id` — `null` para chave inexistente E para chave de outro parceiro (mesma resposta nos dois casos, de propósito). `B2bRepository.getKeyEnvironment` (`features/b2b/service.ts`) e a montagem real (`features/b2b/wiring.ts`) atualizados para passar o `actor` adiante; `rotateKey` (serviço) já tratava `null` como "chave não encontrada", então a mudança é transparente para quem chama. Testado em `tests/db/b2b-repository.test.ts`: `getKeyEnvironment` com o `keyId` de outro parceiro devolve `null`, igual a um `keyId` inexistente. Custo se errada: baixo (é uma restrição a mais; nenhum uso legítimo hoje passa um `keyId` que não seja do próprio ator).
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes. Suíte unitária **3222/3222** (+178 sobre a baseline anterior — a maior parte vem de arquivos de teste crescidos ao longo de toda a S24, não só desta rodada; desta rodada especificamente: 7 novos/alterados em `tests/b2b/handler.test.ts`, 2 novos em `tests/b2b/verify.test.ts`). Banco **1677/1680** (3 pulados = baseline; inclui os 3 `select` novos de `tests/db/b2b-partners.test.ts` e o teste novo de `tests/db/b2b-repository.test.ts` para `getKeyEnvironment`). E2E: `scripts/e2e-s24.sh` rodado do zero após `pnpm db:reset` + reseed (`scripts/e2e-s24-seed.sql`) contra o build de produção local (porta 3002) — **41/41 verificações verdes**, sem regressão nenhuma das 6 rodadas anteriores.

### Rodada 2 — reverificação independente sobre `f6c24e4`: regressões no limitador por IP + timeout do `impl`

Nova reverificação independente (Opus) sobre o commit `f6c24e4` (a correção dos 7 achados acima) encontrou 4
problemas novos, dois deles regressões Important introduzidas pelo próprio limitador por IP daquela rodada. TDD:
vermelho capturado revertendo temporariamente só o código de produção para o estado de `f6c24e4` (mantendo os
testes novos) e rodando `tests/b2b/handler.test.ts` contra ele — log em
`.superpowers/sdd/2026-09-25-s24-portal-b2b/tdd-red-ip-limiter.log` (4 de 27 falharam); produção restaurada com as
correções antes de prosseguir.

- Ruling (S24 correções segurança independente, item A): `ipRateBuckets` (`features/b2b/api/handler.ts`) crescia sem teto — um atacante variando o IP de origem (trivial com IPv6) criava uma entrada nova por IP para sempre, esgotando a memória da instância. Adicionado um teto de **10.000 IPs distintos rastreados** (`IP_RATE_LIMIT_DEFAULT_MAX_TRACKED_IPS`, exposto como `let` mutável só para o teste poder baixá-lo via `__setIpRateLimiterMaxTrackedIpsForTests` e exercitar o comportamento sem 10 mil iterações reais). Ao criar uma entrada NOVA que levaria o mapa ao teto, `recordIpAuthFailure` primeiro libera janelas já vencidas (`pruneExpiredIpBuckets`); se mesmo assim ainda estiver no teto (muitos IPs distintos ativos ao mesmo tempo — ataque de verdade em andamento), zera o mapa inteiro e loga (`console.warn`) — escolhi a opção mais simples que o revisor ofereceu (zerar tudo) em vez de uma política de despejo por LRU: mais barata de implementar e testar, com o único custo de perder a contagem em andamento de quem estava perto do limite quando o teto é atingido (pior caso vira "mais 60 tentativas até barrar de novo", nunca uma falha de disponibilidade). Testado com o teto baixado para 3 em `tests/b2b/handler.test.ts`: `__ipRateLimiterSizeForTests()` nunca ultrapassa o teto mesmo com 10 IPs novos chegando. Custo se errada: baixo (é um teto de memória; o pior caso de errar pra menos é zerar o mapa com mais frequência do que o necessário).
- Ruling (S24 correções segurança independente, item B): o balde por IP contava TODA requisição, chave válida ou não — um integrador legítimo rodando de um único IP com `live_rate_per_minute` maior que 60 ficava preso ao limite por IP (pensado para conter martelamento com chaves INVÁLIDAS), mais restritivo que o limite por parceiro que o próprio admin configurou. Corrigido separando leitura de escrita: `peekIpRateLimit` (só lê, nunca incrementa) roda no topo do pipeline, ANTES do pepper/`verifyApiKey` — um IP já sobre o teto é barrado sem tocar o banco, preservando a intenção original de "barrar antes de gastar uma consulta"; `recordIpAuthFailure` (incrementa) só roda DEPOIS que `verifyApiKey` devolve `invalid_key` de verdade — nunca para chave válida (mesmo com escopo errado, que só é checado depois da consulta da chave e nunca conta no balde do IP nem é barrado por ele) e nunca para `service_unavailable` (pepper ausente é um problema operacional, não um sinal de ataque). Escolhi manter "IP antes de tudo" para a LEITURA (não mover o limite por IP inteiro para depois de `verifyApiKey`, que o revisor ofereceu como alternativa) porque preserva a propriedade de nunca gastar uma consulta ao banco quando o IP já está sobre o teto — só o INCREMENTO precisa esperar o resultado real da autenticação. Testado: sequência de chaves inválidas do mesmo IP → 429 no 61º (sem sequer consultar a chave); chave válida bem acima do teto → nunca barrada; escopo errado (chave válida) → nunca conta no balde. Custo se errada: médio seria o cenário original (parceiro legítimo de alto volume, um IP só, sendo barrado por engano); a correção em si é de baixo risco.
- Ruling (S24 correções segurança independente, item C): `clientIp` só olhava `x-forwarded-for` e `x-real-ip`, nessa ordem — `x-forwarded-for` pode ser escrito ou reescrito por QUALQUER proxy intermediário antes de chegar à borda da Vercel, dependendo da configuração da rede do cliente; `x-vercel-forwarded-for` é escrito pela própria borda da Vercel e não pode ser forjado por um proxy anterior. Reordenada a prioridade: `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for` (fallback, só quando nenhum dos dois primeiros existe — mantido por compatibilidade com ambientes locais/de teste que não passam pela borda da Vercel). Testado: os três cabeçalhos presentes e DIFERENTES a cada tentativa confirma que `x-vercel-forwarded-for` (constante) vence — se o código usasse os outros dois (que mudam a cada volta), nunca acumularia o suficiente para bater o teto; e um teste separado confirma que, sem `x-vercel-forwarded-for`, o fallback por `x-forwarded-for` ainda funciona. Custo se errada: baixo (é só a prioridade de leitura de um cabeçalho; o pior caso de errar é voltar ao comportamento anterior, não pior que ele).
- Ruling (S24 correções segurança independente, item D): o achado 3 (rodada 1) corrigiu só `lookupKey`/`consumeRate` para usar `AbortSignal` de verdade; o `impl` de cada endpoint (`features/b2b/api/endpoints/*.ts`) faz suas PRÓPRIAS chamadas `admin.rpc(...)` e continuava com o `withTimeout` antigo (sem abort), deixando essas consultas reais (a maioria das requisições da API) rodando em segundo plano depois de um 503 por timeout. Corrigido: `ApiRequestContext` (`features/b2b/api/contract.ts`) ganhou `signal?: AbortSignal`; `runApiPipeline` (`handler.ts`) troca `withTimeout` por `withAbortTimeout` na chamada do `impl`, passando `{ ...baseCtx, signal }`; cada uma das 8 chamadas `admin.rpc(...)` nos 6 arquivos de endpoint (`schools.ts`, `school.ts` — 1 cada; `school-lists.ts`, `list-items.ts`, `carts-match.ts` — 2 cada; `list.ts` — 1) agora encadeia `.abortSignal(ctx.signal)` quando presente, mesmo padrão de `realLookupKey`/`realConsumeRate`. `withTimeout` (a versão antiga, sem abort) ficou sem nenhum uso e foi removida do arquivo (achado do lint, não do revisor). Escopo mantido só nas chamadas `.rpc(...)` explicitamente citadas pelo revisor — as duas chamadas `.from(...).select(...)` auxiliares (`normalizedNameOfSchool` em `schools.ts`, `sortOrderOfGrade` em `school-lists.ts`, usadas só para resolver o cursor de paginação, nunca a busca principal) ficaram de fora por não estarem no escopo pedido; podem ganhar o mesmo tratamento depois, se importar. Testado: um `impl` falso que demora mais que o timeout confirma que `ctx.signal` chega abortado quando o pipeline responde `503`. Custo se errada: baixo (é cancelamento aditivo; nenhuma mudança de comportamento fora do caminho de timeout).
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes. Suíte unitária **3228/3228** (+6: os testes novos de `tests/b2b/handler.test.ts` para os achados A/B/C/D, líquido de uma reescrita do teste antigo de limite por IP em dois). Banco **1677/1680** (3 pulados = baseline, sem mudança de schema nesta rodada). E2E: `scripts/e2e-s24.sh` rodado do zero após `pnpm db:reset` + reseed — **41/41 verificações verdes**, sem regressão de nenhuma rodada anterior.

## S23 · Comissão, repasses e inadimplência

Plano: `docs/superpowers/plans/2026-09-26-s23-repasses.md`. Migration `0403_repasses.sql` (aditiva sobre 0401/0402,
ambas já no staging), `features/payouts/**`, telas `/admin/repasses` (Admin13), `/admin/inadimplencia` (Admin14),
`/papelaria/desempenho` (Pap07) e a seção "Pix pela plataforma" em Pap03.

**Ruling 1 — "Pix pela plataforma" não custodia dinheiro; é um registro declarativo.** O adapter Pix da S21 coleta
para UMA conta (a da plataforma), sem split de pagamento; não existe hoje uma forma real de a plataforma receber o
Pix do pai e repassar automaticamente à papelaria. `payout_confirm_sale` registra a venda (`sale_payments`) como
CONFIRMADA por quem chama (papelaria ao declarar "Vendi" com escola opcional, ou admin) — não cria cobrança nem
reconsulta PSP nenhum. Isso também fecha D-105 (S22): `lead_conversion_signals.pix_confirmed` passa a refletir
`sale_payments` de verdade em vez de `false` fixo. Custo se errado: se a S23+ um dia tiver um PSP real com split,
essa função vira o ponto único a trocar (confirmação passa a vir de um webhook, não de um clique).

**Ruling 2 — comissão é uma COBRANÇA separada da papelaria, nunca uma dedução de um pagamento custodiado.**
`payout_confirm_sale` grava `commission` (o que a plataforma tem a cobrar) e, se houver config de escola/APM ativa,
`repasse_due` (saído da própria comissão, nunca mais que ela — `least(...)` defensivo). Nenhum dos dois toca
`stationery_wallets`/`credit_ledger` (S21): a papelaria continua com 100% do que o pai pagou direto a ela; a
comissão apurada fica só registrada, sem instrumento de cobrança nesta fatia (D-122, nova, renumerada por colisão com a S24). Decisão deliberada: um
instrumento de cobrança automática da comissão (nova fatura, ou débito do saldo) é escopo maior que "gerar
registros/instruções" pedido pelo PLAN, e misturaria dois razões (comissão E crédito pré-pago) que hoje são
propositalmente separados.

**Ruling 3 — escola do lead não é resolvida automaticamente.** `leads.list_id` não tem FK para `schools`
(0600 marca isso "fora do escopo, polimórfica"); tentar casar por `school_name`/`municipality_id` seria uma
adivinhação, não uma fonte. `sale_payments.school_id` só é preenchido se quem confirma escolher explicitamente —
Pap03 ganhou um seletor de escola (`listSchoolOptions`, relaxado para qualquer ator autenticado: nome/id de escola
já é público em `/escolas/[inep]`, S04, não é dado sensível). Sem escolha, fica nulo e não há repasse — nunca
inventa.

**Ruling 4 — inadimplência é uma régua de 3 estágios sobre `invoices` (S21), nunca um saldo em cache.**
`payout_settings` guarda `grace_days`/`block_days`; `payout_delinquency_status` classifica `em_dia` (≤ grace_days de
atraso) / `atraso` (entre os dois) / `pausado` (> block_days) a partir da fatura aberta mais antiga — sempre
calculado, nunca armazenado. Sem `payout_settings` publicado, todo mundo fica `em_dia` (falha ABERTA, mesmo
espírito de D-102: não pausar ninguém por falta de configuração). `pausado` é aplicado via `create or replace` em
`billing_can_receive_lead` e `billing_charge_lead_delivery` (0401, já no staging) — aditivo, sem editar o arquivo;
preserva 100% do comportamento de saldo já existente (suíte inteira da S21 continua verde). Sem override manual de
"pausar"/"reativar" nesta fatia (D-121, nova, renumerada por colisão com a S24): menos um estado que pode divergir do calculado.

**Ruling 5 — D-100/D-101 (S21) corrigidos sem tocar SQL.** D-100: `attachPixChargeIfNeeded`
(`features/billing/service.ts`) SEMPRE criava uma cobrança nova, mesmo com uma pendente ainda válida no PSP; a
lógica de "reconsultar antes de decidir" que `payInvoice` já tinha foi extraída para dentro dessa mesma função
(único lugar agora), e `buyPackage`/`buyPass`/`payInvoice` passaram a chamá-la com a fatura inteira (não só o
`providerChargeId`). D-101: `findAnyInvoiceByChargeId` (por qualquer status) + `billing_flag_late_payment`
(idempotente por fatura+txid) — o webhook/cron, quando não acha fatura ABERTA para um txid, reconsulta o PSP e,
só se ele confirmar `paid`, registra o alerta (nunca por confiar no corpo do webhook). Fila de alertas exposta em
Admin13 (D-101 pedia "tela de inadimplência/conciliação"; entrou em Repasses, que já é a tela de conciliação de
dinheiro).

**Ruling 6 — D-107 (S22) era um falso positivo, verificado por teste, não por migration.** A revisão de segurança
da S22 registrou D-107 assumindo que `lead_create` (0303) não recusava um solicitante membro da PRÓPRIA papelaria
escolhida. Rodando `tests/db/lead-create.test.ts` isolado (`"recusa o solicitante que é membro da papelaria"`)
ANTES de qualquer mudança, o teste já passava — a checagem (`exists (select 1 from stationery_members ...)`) está
na 0303 desde a S14, para QUALQUER `member_role` (não filtra por 'owner'), cobrindo dono e staff. Em vez de uma
`create or replace` sem necessidade (risco de transcrição num corpo de ~150 linhas para uma mudança de
comportamento zero), adicionei só o teste de regressão que faltava (membro NÃO-owner, `tests/db/lead-create.test.ts`)
e fechei D-107 como "verificado, não bug". Custo se errado: nenhum — o comportamento correto já existia; o único
risco seria um FUTURO reviewer reabrir a mesma dúvida sem achar este registro.

**Achado durante o Task 2 (fora do pedido, corrigido).** `listConfirmableLeadsForStationery` checava só
`actor.role in ('admin', 'stationery_member')`, sem conferir que o `stationery_member` era vínculo DA papelaria
pedida — qualquer dono de papelaria podia listar os leads confirmáveis de OUTRA papelaria trocando o
`stationeryId`. Corrigido com `requireStationeryAccess` (mesmo predicado de `requireMemberOrAdmin` da S21).
Achado por leitura de código ao escrever `getPerformanceSummary` (que precisava do mesmo helper), não por um
teste vermelho específico — sem CVE real conhecido (nenhuma tela desta fatia expõe esse parâmetro ao cliente ainda),
mas corrigido antes de qualquer tela usar.

**Ruling 7 — Pap07 fica sem "respondido em 1h" nem comparação de bairro (D-120, nova, renumerada por colisão com a S24).** O funil, o ticket médio
(só vendas com Pix pela plataforma confirmado — nunca inventa valor de venda fora dela) e "declarado × confirmado"
(reaproveita `lead_conversion_signals` da S22) entraram; tempo de resposta agregado (`lead_events`) e comparação
anônima de bairro com k-anonimato ≥ 3 papelarias ficaram de fora por tempo da fatia.

Verificação: `pnpm db:reset && pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build`, todos
verdes. `pnpm test`: 2994 (2971 + 23 novos: schemas/service do payouts + D-100/D-101 em `tests/billing/
service.test.ts`). `pnpm test:db`: 70 arquivos (1 skip), 1597 testes, 3 skipped (1567 + 30 novos: 19 em
`tests/db/payouts.test.ts`, 6 de regressão D-108–D-111/D-099/D-107, 5 em `tests/payouts/repository.test.ts`). E2E
(`scripts/e2e-s23.sh`): 25/25, ver `docs/superpowers/e2e/S23.md`.

## S23 · Dívida (bloco pronto para o DEBT.md; IDs já atribuídos)

- (baixa) D-120: Pap07 sem "respondido em até 1h" (agregação de `lead_events`) nem comparação anônima de bairro
  (k-anonimato ≥ 3). Dona: futura fatia de melhoria.
- (baixa) D-121: Admin14 sem "Cobrar"/"Pausar leads"/"Reativar" manuais do design de referência — a régua é 100%
  automática. Dona: futura fatia de melhoria.
- (média) D-122: comissão apurada em `payout_ledger` não tem instrumento de cobrança da papelaria (nem debita
  `credit_ledger`, nem gera fatura) — só registro para o admin cobrar manualmente fora do sistema. Dona: futura
  fatia (cobrança automática da comissão).

## S23 · correções da revisão de segurança (Opus, rodada única sobre `a51b62b`)

Migration `0403_repasses.sql` EDITADA NO LUGAR (ainda não aplicada em nenhum ambiente além do local desta sessão —
sem PR, sem apply em staging). Um Ruling por item pedido na revisão. Vermelho antes do fix: para os dois
BLOQUEANTES, capturado por verificação direta no Postgres local (`has_function_privilege` antes/depois do `revoke`;
um `insert`+`select` em `audit_log` antes/depois do `audit_row_change('pix_key','beneficiary_name')`) e, em seguida,
codificado como teste permanente em `tests/db/payouts.test.ts` (describe `"S23 · correções da revisão de segurança
(Opus, rodada única)"`) — os testes novos falhavam contra o código anterior à correção e passam depois; não há um
log de terminal separado para esta rodada porque a verificação foi feita consulta a consulta contra o banco real,
não só lendo o SQL.

**BLOQUEANTE 1 — EXECUTE aberto para anon/authenticated em 8 funções `SECURITY DEFINER` novas.** Causa raiz: no
Postgres, toda função nova recebe `EXECUTE` para `PUBLIC` por padrão; o padrão já estabelecido nas migrations 0401
e 0402 (`revoke execute ... from public, anon, authenticated, service_role; grant execute ... to service_role;`
logo após cada função) não tinha sido replicado nas 8 funções principais da 0403 nem nas 5 funções de gatilho.
Corrigido função a função (revoke total, grant só a `service_role`; funções de gatilho ficam só com o revoke, sem
grant, porque só o mecanismo de trigger as chama). `payout_check_admin` ganhou o mesmo cotejo de `sub` do JWT contra
o ator informado que `billing_check_admin` (0401) já tinha — sem isso, um `stationery_member` autenticado poderia
chamar a RPC informando o UUID de outro ator. Teste novo varre `has_function_privilege` para anon/authenticated/
service_role nas 9 funções principais (as 8 + `payout_reverse_entry`, criada nesta mesma rodada) e nas 5 de
gatilho. Custo se o revoke tivesse ficado incompleto: qualquer usuário autenticado (ou anônimo, se a chave
publicável vazasse) poderia confirmar vendas, publicar configuração de repasse ou gerar lotes diretamente via RPC,
contornando toda a UI e as Server Actions.

**BLOQUEANTE 2 — `audit_log` guardando `pix_key` e `beneficiary_name`.** O gatilho `school_payout_settings_audit`
usava `audit_row_change()` sem excluir nenhuma coluna, gravando a chave Pix e o nome do beneficiário em texto
simples num log que é append-only e nunca é apagado. Corrigido para `audit_row_change('pix_key',
'beneficiary_name')`, mesmo padrão já usado em outras tabelas sensíveis (ex.: `pix_copy_paste`,
`idempotency_key` em 0401). Teste novo insere/atualiza `school_payout_settings` e confirma, por leitura direta do
JSONB de `audit_log`, que nenhuma das duas chaves aparece em nenhuma linha. Custo se não corrigido: qualquer leitor
do `audit_log` (hoje só `service_role`/admin via ferramenta de banco, mas o log é pensado para retenção longa e
possível exportação futura) teria acesso a uma chave Pix de terceiro (escola/APM) que não é nem papelaria nem
plataforma.

**IMPORTANTE 3 — régua de inadimplência contando recarga de crédito abandonada.** `payout_delinquency_status`
contava qualquer `invoices` aberta e vencida; uma recarga de crédito pré-paga (`credit_package`) nunca entregue
(cliente desistiu antes de pagar) não é uma dívida — ninguém deve nada a ninguém nesse caso, ao contrário de uma
parcela de passe de temporada não paga. Corrigido: a régua agora filtra `kind = 'season_pass_installment' and
is_demo = false`. Também corrigido, no mesmo function body, o cálculo de "hoje" para `(p_at at time zone
'America/Cuiaba')::date` (era um `::date` cru, dependente do fuso da sessão — normalmente UTC — o que podia
classificar errado uma fatura vencida há exatamente N dias perto da virada de meia-noite em Cuiabá). Dois testes
negativos novos confirmam que uma recarga de crédito vencida e uma parcela de passe de DEMONSTRAÇÃO vencida NUNCA
entram na régua (`status === "em_dia"` mesmo com centenas de dias de atraso). O roteiro de E2E trocou a fatura de
teste por uma parcela de passe real e ganhou um controle negativo com uma recarga vencida há 400 dias. Custo se não
corrigido: uma papelaria com um cliente que desistiu de recarregar crédito ficaria pausada sem dever nada, perdendo
leads novos sem motivo.

**IMPORTANTE 4 — sinal "Pix pela plataforma" contável só pela própria declaração.** `lead_conversion_signals`
contava `pix_confirmed` para QUALQUER linha em `sale_payments`, inclusive uma confirmada só pela própria papelaria
(`confirmed_role = 'stationery_member'`) — o mesmo ator que já contribui o sinal "declarou venda". Isso deixava a
regra de "2 de 3 sinais" praticamente refém de um único ator mal-intencionado (declarar a venda E confirmar o Pix
sozinho, sem nenhuma confirmação externa). Corrigido: `pix_confirmed` só conta quando existe uma linha com
`confirmed_role in ('admin', 'system')`. Teste novo confirma que uma confirmação só da papelaria não move
`pix_confirmed` para `true`. Custo se não corrigido: uma papelaria poderia inflar sozinha a conversão de um lead
(e, por consequência, seu histórico de "declarado × confirmado" em Pap07) sem nenhuma verificação externa.

**IMPORTANTE 5 — conluio: repasse por qualquer confirmação que escolhesse uma escola.** Era possível a própria
papelaria, ao confirmar "Pix pela plataforma", escolher a escola do repasse — um combinado entre papelaria e
alguém na escola/APM (declarar uma escola fictícia ou usar informação privilegiada) geraria `repasse_due` sem
nenhuma revisão. Ruling: **repasse só nasce quando quem confirma é `admin` ou `system`** — nunca por confirmação
direta da papelaria, mesmo que ela informe a escola certa. Implementado na PRÓPRIA função `payout_confirm_sale`
(defesa na fonte da verdade, não só na UI): a inserção em `payout_ledger` com `entry_type = 'repasse_due'` só
acontece quando `p_actor_role in ('admin', 'system')`. Isso obrigou a redesenhar a UX: o seletor de escola SAIU do
formulário de confirmação da papelaria (Pap03/`ConfirmSaleForm`) — mantê-lo lá seria enganoso, já que nunca gera
repasse — e uma tela NOVA (`ConfirmSalesAdminList`, dentro do Admin13) lista as vendas confirmáveis de TODAS as
papelarias para o admin revisar e confirmar com a escola correta antes de qualquer repasse existir. Sobre o teto de
`declared_sale_cents`: já existe e é coerente — `sale_payments.amount_cents` e `leads.declared_sale_cents` têm o
MESMO `check (... between 1 and 10000000)` (R$ 100.000,00), não precisou de mudança. Teste novo confirma que uma
papelaria confirmando sozinha (mesmo com escola) produz `repasseCents: 0` e `repasseTarget: null`; um teste
positivo confirma que a confirmação do admin com escola produz `commission` E `repasse_due` normalmente. Custo se
não corrigido: um esquema de conluio papelaria+escola desviaria repasse de dinheiro real sem nenhuma revisão
humana — o pior cenário de todos os achados desta rodada.

**IMPORTANTE 6 — sem função de estorno.** `payout_ledger` é append-only por design (gatilho `payout_ledger_no_truncate`
com `enable always`), mas não existia nenhum caminho para corrigir um lançamento errado (comissão ou repasse
lançados por engano, ou depois anulados por uma contestação de venda). Criada `payout_reverse_entry(p_entry_id,
p_actor_id, p_reason)`: só admin (`payout_check_admin`), busca o lançamento original com `for update`, aceita só
`entry_type in ('commission', 'repasse_due')`, é idempotente (uma segunda chamada com o mesmo `p_entry_id` devolve
o MESMO id de estorno em vez de duplicar, checado por `reverses_entry_id = p_entry_id`), e insere uma linha
compensatória com o valor negativo e o novo `entry_type` (`commission_reversed`/`repasse_reversed` — dois valores
novos no `check` de `entry_type`). O comentário de cabeçalho da migration (linha ~102, que já citava
`repasse_reversed`/`commission_reversed` como conceito futuro) foi atualizado para apontar para esta função
implementada. Teste novo cobre: recusa para não-admin, `not_found` para id inexistente, idempotência na segunda
chamada, e soma líquida zero em `payout_ledger` (comissão + estorno = 0; repasse + estorno = 0) para os dois tipos.
Custo se não corrigido: qualquer erro humano de confirmação, ou uma disputa aceita depois do fato, ficaria sem
correção possível no ledger — só um novo lançamento manual fora do padrão, quebrando a auditabilidade.

**Menores (todos aplicados):**
- `actor_role` gravado em `payout_ledger` agora vem sempre do papel REAL do ator que confirmou (`p_actor_role`,
  já validado contra `stationery_member`/`admin`/`system` no corpo da função), nunca um valor fixo — o `check`
  de `actor_role` foi alargado para aceitar os três valores.
- `back` recebido de `formData` em `confirmSaleAction` passa por `safeNextPath` (extraída de `features/auth/
  redirect.ts`, agora com um `fallback` opcional em vez do fixo `/conta`) antes de qualquer `redirect()` —
  recusa qualquer caminho que não comece com `/` ou que contenha `//` (open redirect).
- `getSaleForLead` ganhou `requireStationeryAccess` (busca a `stationery_id` do lead primeiro): antes, qualquer
  ator com acesso a QUALQUER papelaria conseguia ler o `sale_payments` de um lead de OUTRA papelaria pelo id.
- `payout_confirm_sale` recusa (`stationery_unavailable`) uma papelaria com `status = 'suspended'`, mesmo que o
  lead e o ator sejam válidos.
- Pap07 (`getPerformanceSummary`) trocou o `.limit(500)` (que cortava silenciosamente o funil de uma papelaria com
  mais de 500 leads) por 4 contagens `count: "exact", head: true` em paralelo — sem limite, e sem baixar linha
  nenhuma para contar.

Verificação: `pnpm db:reset && pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build`, todos
verdes (3252 testes unitários; 1721 de banco, 3 skipped pré-existentes — as duas rodadas de `db:reset`+`test:db`
concorrentes que rodaram por engano numa tentativa anterior foram descartadas e refeitas em sequência, uma de cada
vez, depois de identificado que a colisão de duas suítes de banco simultâneas contra o mesmo Postgres local é que
causava falhas espúrias em testes sem relação nenhuma com esta fatia). E2E (`scripts/e2e-s23.sh`) refeito do zero
(`pnpm db:reset` + reseed + `pnpm build` + `PORT=3003 pnpm start` novo): 26/26 (era 25/25 antes da rodada; o
roteiro ganhou uma etapa extra para confirmar a venda 1 pelo admin, com escola, separada da venda 2 pela própria
papelaria, sem escola). Achado e corrigido no meio do processo: o próprio roteiro tinha um bug (login redundante
do admin já autenticado na etapa 3, causando `Element not found: #email`) — não era uma falha da aplicação; trocado
por uma navegação simples (`ab admin open`), já que a sessão do admin seguia válida desde a etapa 1.

## S23 · correções da revisão de segurança (rodada 2, Opus, sobre `28f93b5`)

Reverificação da rodada 1 achou 0 bloqueantes, 1 importante funcional e 1 menor funcional. Migration
`0403_repasses.sql` editada NO LUGAR de novo (ainda só local). Vermelho real antes do fix: revertida temporariamente
só `supabase/migrations/0403_repasses.sql` para o conteúdo de `28f93b5` (com os testes novos já escritos por cima),
`pnpm db:reset` + rodada dos testes novos — as 5 asserções nova falharam exatamente como esperado (função
`payout_admin_validate_sale` inexistente; `payout_reverse_entry` sem recusar lote já criado), log salvo em
`docs/superpowers/logs/s23-security-round2-red.log`; migration restaurada e `pnpm db:reset` de novo antes de
qualquer verificação verde.

**1) Repasse perdido: papelaria confirma antes do admin.** Causa raiz: `payout_confirm_sale` é idempotente por
design (`unique(sale_payments.lead_id)`, 2ª chamada devolve o id existente sem tocar em nada) — bom contra corrida
concorrente da MESMA confirmação, ruim quando é uma confirmação DIFERENTE (papelaria primeiro, admin depois): a
venda sumia de `listConfirmableSalesForAdmin` (que excluía qualquer lead com `sale_payments` já existente,
independente de quem confirmou) e nunca virava repasse nem contava o sinal Pix. Ruling: criei
`payout_admin_validate_sale(p_actor_id, p_lead_id, p_school_id)` como o ÚNICO ponto de entrada do admin (a
`confirmSale` do repositório TS agora despacha para ela sempre que `actor.role === 'admin'`, nunca mais chama
`payout_confirm_sale` diretamente para admin) — ela cobre os dois casos com uma função: lead sem `sale_payments`
nenhum delega para `payout_confirm_sale('admin', ...)` (comportamento idêntico ao de antes, cobre "ordem inversa");
lead já confirmado só pela papelaria (`confirmed_role = 'stationery_member'`) é uma VALIDAÇÃO — sem duplicar a
comissão (só lê o `payout_ledger` já existente para aplicar o mesmo teto `least(declarado × bps, comissão já
apurada)`), grava um repasse_due novo se houver escola/config, e registra a validação numa tabela nova,
`sale_payment_admin_validations` (append-only, `unique(sale_payment_id)`, mesma imutabilidade de `sale_payments`/
`payout_ledger`), que também passou a alimentar `pix_confirmed` em `lead_conversion_signals` — a validação do admin
é a mesma verificação externa que uma confirmação direta dele já dava. `listConfirmableSalesForAdmin` deixou de
excluir vendas confirmadas só pela papelaria e ainda não validadas (agora só sai da fila quando plenamente
processada: admin/system direto, OU papelaria + validação); o campo novo `awaitingValidation` rotula esse caso na
tela (Admin13: "Confirmada pela papelaria · aguardando validação", botão "Validar" em vez de "Confirmar" — mesma
`<form>`, mesma ação, o banco decide sozinho). Custo se não corrigido: toda venda que a papelaria confirmasse antes
do admin olhar a fila perderia o repasse PARA SEMPRE (sem repasse, sem sinal Pix, sem jeito de recuperar depois) —
o pior tipo de bug funcional aqui, porque é silencioso (nada dá erro, o dinheiro simplesmente nunca é repassado).

**2) Estorno de repasse já liquidado (num lote).** `payout_reverse_entry` (rodada 1) só checava `entry_type in
('commission', 'repasse_due')`, sem considerar que um `repasse_due` pode já ter sido somado a um LOTE
(`payout_batches`, via um lançamento `repasse_settled` que soma TUDO que existir para a escola/APM até aquele
momento, sem ligação por linha a cada `repasse_due` coberto). Ruling: recusar (hint `already_settled`) estornar um
`repasse_due` quando existe um `repasse_settled` posterior para a MESMA escola/APM — MAIS ESTRITO do que só "lote
executado" (a redação original do pedido): mesmo um lote ainda `pending` (dinheiro nenhum moveu) já tem
`total_cents` fixo e foi mostrado ao admin como uma instrução a executar; estornar por baixo dele não corrige o
lote (imutável) e só desconta o total FUTURO — podendo até deixá-lo negativo, exatamente o "pendente negativo
descontado em silêncio" que o pedido queria evitar. Optei por RECUSAR (não por um ajuste de lote automático): a
correção de um repasse já batido em lote precisa da decisão de um humano sobre o que fazer com o lote em si
(cancelar? gerar um lote negativo manual?), fora do escopo de uma função de estorno de UM lançamento. Comissão
nunca cai nessa checagem (não tem conceito de lote — D-122, cobrança manual). Custo se a checagem tivesse ficado só
em "executado" (a redação literal do pedido): um repasse ainda `pending` estornado deixaria o "Repasse pendente" da
tela incoerente com o `total_cents` já fixado do lote, até compensar sozinho com repasses futuros — um bug sutil
que só apareceria numa janela de tempo específica (lote gerado mas ainda não executado).

Verificação: `pnpm db:reset && pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build`, todos
verdes (3252 unitários; 1729 de banco, 3 skipped pré-existentes — 8 testes novos: 6 em `tests/db/payouts.test.ts`
["S23 · correções da revisão de segurança (Opus, rodada 2)"] + 1 de imutabilidade da tabela nova + 1 em
`tests/payouts/repository.test.ts`). E2E (`scripts/e2e-s23.sh`) refeito do zero, com uma etapa nova exercitando
exatamente a ordem "papelaria confirma primeiro, admin valida depois": 30/30 (era 26/26 na rodada 1). Achado no
processo (ambiental, não da aplicação): outra trilha (S25, worktree T2) rodou `agent-browser close --all` no meio
de uma tentativa de E2E, derrubando as sessões `t3s23-*` desta trilha a meio caminho (uma delas chegou a mostrar uma
página de bloqueio de segurança de terceiros, sinal claro de sessão de browser corrompida por outro processo) —
refeito do zero numa janela sem colisão; registrado como lembrete (não dívida): fechar sessões do agent-browser só
pelo nome exato, nunca com `--all`, quando várias trilhas rodam em paralelo no mesmo host.
## S25

### Task 1 (migration 0502 e testes de banco)

- Ruling: eventos de webhook nascem de gatilhos NOVOS sobre tabelas de evento imutáveis JÁ EXISTENTES (`list_status_events` da 0103, `claims` da 0104) em vez de qualquer alteração nas migrations 0103/0104 ou de uma tabela de evento própria da S25 — `list_status_events` já distingue 1ª publicação (`from_status` = status anterior, ex. `approved`) de troca de versão numa lista já publicada (`from_status` nulo, `reason = 'troca de versão'`) e de arquivamento (`to_status = 'archived'`), então `list.published`/`list.updated`/`list.archived` saem de UM gatilho só, sem inventar heurística. `school.approved` usa a transição `claims.status -> 'approved'`, a MESMA que a 0104 usa para marcar `schools.verification_status = 'verified'`. Custo se errada: baixo a médio — se a distinção da 0103 mudar de sentido numa fatia futura, os dois eventos (`published`/`updated`) trocariam de rótulo sem erro de banco (silencioso); mitigado pelos testes de `webhook-events.test.ts`, que fixam o comportamento esperado por fato real.
- Ruling: filtro de fila por cobertura de UF do parceiro (`coverage_ufs is null or uf = any(coverage_ufs)`) — não pedido explicitamente pelo PLAN/SPEC-2, mas decorre de "webhooks assinados" fazerem sentido só para quem tem interesse na região; sem o filtro, um parceiro Regional (ex. só SP) receberia eventos de escola de Cuiabá/MT sem nunca poder usá-los. Custo se errada: baixo — parceiro nacional (`coverage_ufs = null`) continua recebendo tudo; um parceiro regional que precisasse mesmo assim de eventos fora da UF pediria ajuste (campo aditivo, sem migração de dado).
- Ruling: segredo do webhook guardado CIFRADO (AES-256-GCM, chave só de servidor `B2B_WEBHOOK_ENCRYPTION_KEY`) em vez de só hash (como as chaves de API da S24) — o servidor PRECISA do segredo em claro para ASSINAR as próprias chamadas HTTP de saída (webhooks são o inverso das chaves de API: aqui é ListaCerta quem autentica a chamada, não quem a recebe). "Revelar" (fiel ao botão da tela B2B05) decifra sob demanda só para dono/admin, diferente de "mostrado uma vez" das chaves de API — decisão registrada porque diverge do padrão anterior; nunca logado, nunca cacheado fora da resposta da Server Action. Custo se errada: médio — se a chave de cifra (`B2B_WEBHOOK_ENCRYPTION_KEY`) vazar, todos os segredos de webhook são recuperáveis (mesma exposição que qualquer segredo simétrico guardado cifrado com chave única; mitigação: variável só de servidor, nunca commitada, rotacionável trocando `secret_key_version` e recifrando — recifra em lote fica como dívida, não implementada nesta fatia).
- Ruling: até 3 endpoints por parceiro (não especificado no PLAN) — limite arbitrário para impedir que um parceiro cadastre uma quantidade ilimitada de endpoints (cada evento sairia N vezes, um por endpoint). Custo se errada: baixo (constante fácil de mudar; nenhum dado migra).
- Ruling: retry exponencial (1, 2, 4, ... minutos, teto de 360 min) com dead letter em 24 h OU 10 tentativas (o que vier primeiro) — o PLAN só pede "retry" e o SPEC-2 só diz "reenvio com backoff por até 24 h"; os números exatos (base, teto, 10 tentativas) são Ruling de implementação, no mesmo espírito do retry de notificações da S11 (1/2/4/8 min, dead na 5ª tentativa), mas com teto mais alto e mais tentativas porque o SLA aqui é 24 h (não minutos). Falha PERMANENTE (4xx exceto 429, redirecionamento, URL rejeitada pelo anti-SSRF) vai para `dead` na hora, sem gastar as 24 h — só falha TRANSIENTE (429/5xx/rede/timeout) usa o backoff. Custo se errada: baixo (constantes de retry; ajustável sem migração).
- Ruling: reenvio manual (`b2b_webhook_resend`) cria uma NOVA linha de entrega (com `event_id` derivado, `:resend:<uuid>`) em vez de reabrir a entrega original — preserva o log de tentativas da entrega original intacto (o log é append-only por linha de ENTREGA; reabrir a original geraria tentativas antigas e novas misturadas sob o mesmo `delivery_id`, dificultando a leitura da tela B2B05, que mostra "Tentativas" por linha da tabela). Custo se errada: baixo (mais uma linha na fila; não há limite de reenvios nesta fatia — dívida se um parceiro abusar do botão).
- Ruling: dois bugs de tipagem SQL pegos pelos próprios testes (documentados em `docs/superpowers/logs/s25-task1-red.txt`): CASE com branches em texto puro atribuído a coluna enum precisa de cast explícito (`(case ...)::tipo`); parâmetro de função `smallint` recusa literal inteiro sem cast na resolução de sobrecarga (trocado para `integer` com cast interno). Custo de não ter pego: alto (funções chamadas em produção sempre falhariam) — mitigado por TDD antes de qualquer código de aplicação depender delas.
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes. Unitária **3228/3228** (sem teste novo nesta task — só banco). Banco **1697/1700** (3 pulados = baseline; **+20 novos**: 7 em `tests/db/webhook-events.test.ts`, 13 em `tests/db/webhooks-schema.test.ts`). Build de produção local OK (rotas `/v1/**` inalteradas; nenhuma rota nova de app nesta task, só migration + testes).

### Task 2 (domínio: assinatura, fila com lease, anti-SSRF; leitura pública do widget)

- Ruling: anti-SSRF do envio de webhook usa `undici.Agent` + `buildConnector` com um `connect()` customizado que troca `hostname` pelo endereço IP já validado (`resolvePublicAddress`) e preserva `servername`/Host com o domínio original — é o mecanismo de *pinning* que a própria `undici` usa internamente (confirmado lendo `lib/core/connect.js` da dependência: para HTTPS, `tls.connect({ host: hostname, servername, port })`); sem isso, uma segunda resolução DNS diferente no momento do `connect()` (rebinding) poderia apontar para um IP privado mesmo depois da checagem. Testado de ponta a ponta com um servidor HTTP local real (não só mock de DNS) cobrindo 2xx/4xx/5xx/429/redirect/timeout/resposta grande. Custo se errada: alto (é a defesa central contra SSRF) — mitigado por 18 testes cobrindo o módulo isoladamente, incluindo o caminho de rede real.
- Ruling: `undici` adicionado como `dependencies` direto (não só transitivo) — `require('undici')` sem essa entrada resolvia (por acidente) para uma cópia em `node_modules` do HOME do usuário, fora do projeto e do `pnpm-lock.yaml`; travar a versão do projeto evita depender de um acidente de resolução do Node fora do controle do repositório. Custo se errada: baixo (é só uma dependência declarada explicitamente; o comportamento em produção/CI, que não tem esse `node_modules` do HOME, já dependeria dela mesmo sem a entrada).
- Ruling: dois bugs de serialização pegos pelos próprios testes: (1) parâmetro de função `smallint` recusa literal inteiro sem cast (já corrigido na Task 1); (2) passar `bytea` por RPC via PostgREST exige o formato de texto hex `\x<hex>` — confirmado por um teste de repositório contra o PostgREST REAL (`tests/db/webhooks-repository.test.ts`), não só contra `pg` direto, porque essa camada de serialização (JSON → PostgREST → cast SQL) é invisível para quem só testa com `pg`.
- Ruling: leitura pública do widget REAPROVEITA as funções `b2b_v1_*` da S24 (mesmo ambiente sempre `live`, cobertura do parceiro) em vez de escrever funções novas — a regra "o que é público" já tem teste de vazamento dedicado (`tests/db/b2b-api-leak.test.ts`); duplicar a lógica arriscaria as duas implementações divergirem silenciosamente. Custo se errada: baixo (é reaproveitamento; qualquer correção na regra pública da S24 beneficia o widget automaticamente).
- Ruling: rate limit de primeira camada do widget (`lib/rate-limit/memory-bucket.ts`, balde em memória por IP+`partnerId`, 30 req/min) — mesma ressalva já registrada para a API B2B (S24/PROGRESS): é só a primeira camada; o limite de verdade entre instâncias é o Firewall da Vercel (pendência humana, mesma linha do PROGRESS, agora também cobrindo `/api/widget/*`).
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes. Unitária **3273/3273** (+45: sign 6, crypto 5, ip-range 4, safe-fetch 18, dispatcher 5, sender 4, memory-bucket 3). Banco **1699/1702** (3 pulados = baseline; +2 em `tests/db/webhooks-repository.test.ts`). Build de produção local OK, com `/api/webhooks/dispatch` e `/api/widget/**` registradas.

### Task 3 (telas B2B04/B2B05 + E2E)

- Ruling: `B2B_FEATURES.widget`/`.webhooks` viram `true` nesta task (nav do `PortalShell` ganha os dois itens); Campanhas/Insights/Faturamento continuam `false` (S26). O selo "Em breve" de `/parceiros` some sozinho para widget/webhooks (já condicionado à flag desde a S24).
- Ruling: até 3 endpoints por parceiro na UI (`EndpointsSection.tsx`), refletindo o limite já decidido na Task 1; sem ação de excluir endpoint nesta fatia (D-130).
- Ruling (achado real do E2E, não hipotético): "Rotacionar" usava `window.confirm` — um diálogo nativo do navegador que a automação de teste (e qualquer harness baseado em CDP) não consegue confirmar de forma confiável sem um handler dedicado. Trocado por confirmação inline de dois cliques ("Rotacionar" → "Confirmar rotação (invalida o segredo atual)" → "Cancelar"), sem `window.confirm`. Custo se errada: baixo (é só a forma da confirmação; a ação continua exigindo dois cliques deliberados).
- Ruling (achado real do E2E): criar um endpoint chamava `onSaved()` imediatamente após o sucesso, o que desmontava o próprio formulário (via `EndpointsSection` trocando `showNew` para `false` e chamando `router.refresh()`) ANTES de o dono ver o segredo em claro — quebrava por completo o "copie agora" (o PLAN e o SPEC-2 não têm exceção para isso). Corrigido: o segredo criado fica visível até um "Já copiei" explícito; só então a lista atualiza. Custo de não ter pego no E2E: alto (o dono nunca veria a única chance de copiar o segredo em produção) — só apareceu rodando o roteiro de ponta a ponta contra o app real, não nos testes unitários dos Server Actions (que testam o retorno da action, não a árvore de componentes React).
- Ruling (achado real do E2E): "Revelar" e "Rotacionar" eram mutuamente exclusivos no layout (um escondia o outro) — corrigido para os dois ficarem sempre visíveis juntos quando o segredo está mascarado ou revelado.
- Ruling: `SaveEndpointInputSchema` (`features/webhooks/schemas.ts`) usava `z.url({ hostname: z.regexes.domain })`, que rejeita qualquer host literal — travava a criação de endpoint mesmo com `APP_ENV=local` (a exceção de loopback documentada desde a Task 1). Corrigido para validar só a FORMA da URL (`z.url({ protocol: /^https?$/ })`); a política de segurança de verdade continua só no CHECK do banco e em `lib/net/safe-fetch.ts` (revalidado a cada envio) — Zod não deve duplicar (pior, endurecer) uma política de segurança que já vive numa camada mais confiável.
- E2E real, ponta a ponta, contra o build de produção local (`scripts/e2e-s25.sh`, `scripts/e2e-s25-seed.sql`, `scripts/e2e-webhook-receiver.mjs`): parceiro varejista já ativo (dono real, sem repetir o cadastro/aprovação da S24), lista publicada real, reivindicação pronta para aprovar. Widget: configurar, snippet com `partner_id` real, `/api/widget/**` com CORS aberto e dados reais (busca de escola, listas, itens). Webhooks: criar endpoint apontando para um receptor HTTP local (loopback, só por causa de `APP_ENV=local`), ver o segredo uma vez, revelar, rotacionar. Eventos reais (`list.updated` de uma republicação, `school.approved` de uma aprovação de reivindicação de verdade) disparam entregas; despacho real assina com HMAC-SHA256 e o receptor CONFIRMA a assinatura recebida (aceite "assinatura verificável por teste" também coberto ponta a ponta, além dos testes de unidade de `sign.ts`); falha forçada no receptor → `failed` com retry agendado → (avançando o relógio da linha para 24h) `dead` → "Reenviar" pela UI cria uma nova entrega preservando o histórico da original → sucesso. **22/22 verificações**, sem falha.
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes. Unitária **3273/3273** (sem teste novo nesta task — só telas e E2E). Banco **1699/1702** (3 pulados = baseline, sem mudança de schema nesta task). Build de produção local OK. E2E: **22/22**, `docs/superpowers/e2e/S25.md`, capturas em `docs/superpowers/e2e/screenshots/S25-*.png` (segredo redigido na captura que o mostrava em claro).

## S25 · correções da revisão de segurança (Opus, sobre `ba26b08`)

Rodada única de correções sobre a S25 já mesclada com `origin/main` (`ba26b08`, não staged em nenhum ambiente
além do local: a migration `0502` foi editada NO LUGAR, sem migration nova). 1 Bloqueante, 3 Importantes e 6
Menores. Vermelho capturado antes de cada correção (`docs/superpowers/logs/s25-security-review-red.txt` para o
Importante 4/ip-range; os demais, nos próprios arquivos de teste de banco alterados, rodados contra a migration
ainda sem a correção — ver histórico desta sessão).

- Ruling (Bloqueante 1): os gatilhos de webhook (`webhook_on_list_status_event`, `webhook_on_claim_approved`)
  ignoravam por completo os filtros de visibilidade pública da S24 (`is_demo` × ambiente, município habilitado,
  escola não suspensa) — um parceiro `active` podia receber evento de escola/lista DEMONSTRATIVA, e uma escola
  suspensa ou de município desabilitado gerava evento mesmo assim. Corrigido com duas funções NOVAS em `0502`
  (`b2b_webhook_list_gate`/`b2b_webhook_school_gate`) que espelham a MESMA regra de `b2b_v1_visible_lists`/
  `b2b_v1_school_base` (0501, já staged — não alterada) sem duplicar a lógica linha a linha: só os 3 critérios
  (município habilitado, escola não suspensa, `is_demo`) são recalculados, porque a 0501 não expõe esses
  critérios "crus" (só embutidos na consulta pública final, cujo filtro de ambiente é fixo por chamada, não
  reaproveitável para decidir POR PARCEIRO qual ambiente ele deve receber). `b2b_webhook_enqueue` ganhou o
  parâmetro `p_is_demo`: `active` só recebe dado real, `sandbox` só recebe dado demo. Fato sobre lista/escola fora
  do gate não enfileira NADA (nem erro, nem tentativa) — silêncio, não falha. Testado com lista demo × parceiro
  active/sandbox, escola de município desabilitado, escola suspensa (`tests/db/webhook-events.test.ts`, describe
  "visibilidade pública"). Custo se errada: alto (é exatamente o tipo de vazamento que a S24 gastou uma revisão de
  segurança inteira evitando na API `/v1`) — mitigado por 3 testes novos dedicados, além dos existentes migrados
  para usar lista REAL explicitamente (`seedRealSchoolAndList`/`newPublishedList` atualizados).
- Ruling (Importante 2): o gatilho imutável de `b2b_webhook_delivery_attempts` (`enable always`) bloqueava
  qualquer DELETE, inclusive o vindo de ON DELETE CASCADE (apagar a entrega/o endpoint/o parceiro) — confirmado
  empiricamente que `pg_trigger_depth()` é 2 dentro do gatilho quando o DELETE vem de uma cascata de FK (a própria
  RI é implementada como um gatilho interno) e 1 quando é um DELETE direto na tabela. Corrigido permitindo DELETE
  só quando `pg_trigger_depth() > 1`; UPDATE continua sempre bloqueado, em qualquer profundidade. Sem isto,
  `b2b_webhook_purge_old` quebrava para sempre (`500`) assim que a primeira entrega com tentativa registrada
  completasse 30 dias — um bug que só apareceria em produção depois de um mês rodando. A nova tabela de auditoria
  `b2b_webhook_secret_events` (Menor, abaixo) recebeu o MESMO tratamento preventivamente. Testado: purgar uma
  entrega com tentativa; apagar um endpoint e depois um parceiro inteiro, os dois com histórico de tentativas.
  Custo se errada: alto (disponibilidade do despacho, silenciosa até completar 30 dias) — mitigado por 2 testes
  dedicados rodando a sequência real (`claim` → `mark_delivery` → apagar o pai).
- Ruling (Importante 3): `b2b_webhook_resend` não tinha cota (um clique repetido, ou uma automação contra a
  Server Action, recriava entregas sem limite) e nem `resend` nem `b2b_webhook_claim_deliveries` conferiam se o
  ENDPOINT estava `active` ou o PARCEIRO `active`/`sandbox` — um endpoint desativado ou parceiro suspenso podia
  continuar recebendo despacho de entregas já enfileiradas antes da mudança de estado. Corrigido com duas cotas
  independentes (no máximo 5 reenvios por entrega original — a raiz mais os filhos `:resend:` —, e no máximo 20
  reenvios por hora por parceiro, todas as origens) e checagem de estado nos dois lugares; `b2b_webhook_endpoint_update`
  ganhou a MESMA checagem de estado do parceiro que já existia só na criação (achado adjacente: um parceiro
  suspenso conseguia editar a URL/eventos do próprio endpoint). Entrega de endpoint desativado/parceiro suspenso
  fica só na fila (nunca é reivindicada), sem erro. Testado: cota de 5 reenvios (6º recusado), reenvio recusado
  com endpoint desativado/parceiro suspenso, `claim` nunca reivindica nesses dois casos. Custo se errada: médio
  (abuso de recursos — flood do próprio parceiro/endpoint —, não um vazamento de dado de terceiro).
- Ruling (Importante 4): `lib/net/ip-range.ts` classificava IPv6 negando faixa por faixa (default ALLOW) — uma
  faixa reservada esquecida da lista passava como pública. Confirmado com o código ANTERIOR que 7 de 8 endereços
  disfarçados citados pelo revisor (`::127.0.0.1`, `::a9fe:a9fe`/metadata, `::ffff:7f00:1`, `100::1`, Teredo ×2,
  6to4) eram classificados como PÚBLICOS incorretamente (log em `docs/superpowers/logs/s25-security-review-red.txt`).
  Reescrito para DEFAULT-DENY usando `node:net.BlockList`: só é público dentro de `2000::/3` (unicast global
  atual, RFC 4291) e fora de Teredo/6to4/documentação (que caem DENTRO desse bloco). Loopback, link-local, ULA,
  multicast, IPv4-mapeado, discard-only e NAT64 já ficam de fora só por estarem fora de `2000::/3` — não precisam
  de entrada própria, o que elimina a classe inteira de bug "faixa esquecida". Testado com os 8 casos do revisor
  mais Teredo/6to4 e um endereço público real (Google DNS) para confirmar que o prefixo `2001:` sozinho não
  dispara o bloqueio de Teredo por engano (Teredo é `2001:0000::/32`, não qualquer coisa que comece com `2001:`).
  Custo se errada: alto (é a defesa central de IPv6 contra SSRF) — mitigado por 7 testes dedicados.
- Ruling (Menor): a exceção de loopback (`http://127.0.0.1`, só para o E2E) passou a exigir `APP_ENV=local` **e**
  a ausência de `process.env.VERCEL` (variável que a própria Vercel injeta em todo deploy) — defesa em
  profundidade contra um `APP_ENV=local` configurado por engano num ambiente real da Vercel reabrir a exceção de
  SSRF.
- Ruling (Menor): HTTPS restrito à porta 443 (`lib/net/safe-fetch.ts`) — reduz o uso do envio de webhook como
  sonda de porta contra um host público arbitrário. Sem suporte a 8443 nesta fatia (ninguém pediu); registrado
  como comentário no código para não crescer por engano, e como dívida (D-134) o fato de a checagem valer só no
  ENVIO, não na criação/atualização do endpoint (Zod e o CHECK do banco continuam aceitando qualquer porta).
- Ruling (Menor): `lib/rate-limit/memory-bucket.ts` fazia `buckets.clear()` (zerar TUDO) ao atingir o teto de
  10 000 chaves rastreadas — descartava a cota em andamento de todo mundo, inclusive quem nem estava perto do
  limite. Trocado por despejar só a chave MAIS ANTIGA (primeira do `Map`, que preserva ordem de inserção) por
  chamada, abrindo uma vaga de cada vez. Testado enchendo o mapa até o teto e confirmando que só uma entrada
  desaparece por chave nova.
- Ruling (Menor): auditoria de criar/rotacionar/revelar o segredo do webhook. `b2b_partner_events` (0501) já está
  staged e seu CHECK de `event_type` não cobre estes três eventos — em vez de alterar uma migration já aplicada
  em staging, criada `b2b_webhook_secret_events` (tabela irmã, imutável, `partner_id` com `on delete cascade` —
  ao contrário de `b2b_partner_events`, que usa `restrict` — para não travar a exclusão de um parceiro, Importante
  2 acima). `actor_id` fora do grant de `authenticated` (mesmo padrão de `decided_by`/`created_by` na 0501). Isto
  RESOLVE o D-128 (registrado na Task 1 desta mesma fatia).
- Ruling (Menor): `b2b_webhook_endpoint_create` ganhou `pg_advisory_xact_lock` por parceiro (mesmo padrão de
  `b2b_partner_apply`, 0501) para duas criações concorrentes não passarem as duas pela checagem do limite de 3
  endpoints antes de qualquer uma inserir.
- Dívida nova (D-133, baixa): `app/api/widget/**` responde `access-control-allow-origin: *` para qualquer
  origem — correto para o DADO (público, sem cookie), mas sem allowlist do domínio cadastrado do parceiro, o
  widget de um parceiro pode ser embutido em site de terceiro não autorizado. Registrada para quando o portal
  ganhar um campo de "domínios autorizados".
- Estado: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes.
  Unitária **3279/3279** (+6: 2 em `safe-fetch.test.ts`, 3 em `ip-range.test.ts`, 1 em `memory-bucket.test.ts`).
  Banco **1707/1710** (3 pulados = baseline; +8: 3 em `webhook-events.test.ts` — visibilidade pública —, 5 em
  `webhooks-schema.test.ts` — purge/cascata, cota de reenvio, estado do endpoint/parceiro). E2E `scripts/e2e-s25.sh`
  refeito do zero (`pnpm db:reset` + reseed): **22/22**, sem regressão de nenhuma verificação anterior.

## S26 · Campanhas de marca, insights e faturamento B2B

### S26 · Task 1 (migration 0503 e testes de banco)

- Ruling: bid/orçamento de campanha (`bid_cents`, `daily_budget_cents`, `total_budget_cents`) é **declarado pelo
  próprio parceiro marca** na criação, não um preço de tabela da plataforma — não fere "nunca inventar preço":
  é o anunciante decidindo quanto paga pelo próprio inventário, mesmo racional de um leilão de mídia.
  Custo se errada: baixo (é só o parceiro se auto-limitando; sem impacto em terceiros).
- Ruling: o bloqueio Procon (Lei 12.886, alerta `restrictive_brand_or_spec`) é decidido **inteiramente dentro de
  `b2b_campaign_serve`** (categoria alvo da campanha × categorias com o alerta na versão publicada da lista), não
  como um estado gravado na campanha — a mesma campanha pode servir numa lista e ser bloqueada noutra, e o estado
  da campanha (`approved`) não muda por isso. Nenhum outro caminho decide elegibilidade: domínio (Task 2) e UI só
  formatam o que essa função devolve. Custo se errada: alto (é o requisito legal central da fatia) — mitigado por
  teste dedicado com 3 cenários (categoria bloqueada, sem alerta, alerta em categoria diferente).
- Ruling: `is_demo` da campanha é **fixado na criação** a partir do status do parceiro no momento (`sandbox` →
  demo; `active` → real) e nunca recalculado depois — se o parceiro trocar de status, campanhas antigas mantêm o
  ambiente com que nasceram (evita uma campanha sandbox virar real, ou vice-versa, sem revisão). `b2b_campaign_serve`
  só cruza campanha e lista do MESMO `is_demo`. Custo se errada: médio (vazamento de dado demo/real entre ambientes)
  — mitigado por teste dedicado.
- Ruling: a contagem crua de insights (`b2b_insights_raw`) não tem k-anonimato embutido e é **`service_role`-only**
  (revogada de `authenticated`/`anon`/`public`, mesmo padrão das funções `b2b_v1_*` da 0501) — a supressão por
  k-anonimato mínimo (`b2b_insights_settings.min_k`, configurável em banco) e a supressão complementar (evitar
  recuperar a célula oculta por subtração do total) são do domínio TypeScript (Task 2), testadas por unidade
  (mais rápido de cobrir as combinações de fronteira do que em SQL). Custo se errada: alto (é o requisito de
  privacidade central da tela B2B08) — a defesa em profundidade é o próprio grant: mesmo um bug na supressão do
  domínio não expõe a contagem crua a um parceiro via SQL direto, porque a função nem é executável por
  `authenticated`.
- Ruling: linha de "uso de API" no extrato (`b2b_statement_generate`) fica **sempre `pricing_status =
  'unavailable'`** nesta fatia — não existe tabela de preço por request excedente da API B2B (mesmo racional do
  `billing_unavailable` da S21/D-102: nunca inventar preço). Linhas de campanha (CPM/CPC) sempre `'priced'`, porque
  o valor é o bid que o próprio parceiro declarou. Custo se errada: baixo (é conservador: mostra menos, nunca
  inventa mais).
- Ruling: sem integração de pagamento real. `b2b_statements`/`b2b_statement_line_items` são só um **snapshot
  imutável** (extrato) + `payment_instruction` (texto livre para o admin agir manualmente fora do sistema).
  Nenhuma função debita `credit_ledger` nem chama gateway. Duplicar o mesmo período (`partner_id`,
  `period_start`, `period_end`) é recusado (`23505`/`duplicate_period`) — reemissão de um período fica fora do
  escopo desta fatia (dívida, ver abaixo).
- Ruling: clique só é aceito se existir uma **impressão prévia no mesmo dia com o mesmo `dedupe_key`**
  (`b2b_campaign_record_event`) — reduz clique inflado sem exibição correspondente, sem precisar de cookie de
  terceiro nem de nenhum dado pessoal (o `dedupe_key` é um hash hexadecimal anônimo fornecido pelo chamador).
  Custo se errada: baixo (só descarta clique suspeito; nunca gera falso positivo de fraude visível ao parceiro).
- Ruling: orçamento esgotado (diário ou total) **pausa a campanha automaticamente** dentro do próprio gatilho de
  acúmulo (`b2b_campaign_event_accrue`), sem job externo — evita servir/cobrar (mesmo que só informativamente)
  além do que o parceiro autorizou. Retomar (`paused` → `approved`) com o orçamento TOTAL já esgotado é recusado
  (`23514`/`budget_exhausted`); só o orçamento diário zera a cada dia (não há bloqueio de retomada por ele).
- Achado da implementação (não é dívida, é comportamento correto do Postgres): `truncate` em
  `b2b_campaign_events` falha com `0A000` (bloqueado pela FK de `b2b_campaign_ledger`, antes mesmo do gatilho
  disparar) em vez de `42501` — os dois bloqueiam a imutabilidade; o teste aceita ambos os códigos.
- Dívida nova (D-143, baixa): não há caminho para reemitir/corrigir um extrato de período já gerado (o registro é
  imutável por desenho) — hoje, se o admin errar `payment_instruction` ou gerar um período antes da hora, a única
  saída é gerar um extrato para um período diferente; falta uma nota de retificação ou reemissão explícita.
- Dívida nova (D-144, média): `b2b_campaign_serve` não tem cota nem cache — cada chamada varre `b2b_campaigns`
  com `order by random()`; em volume alto de listas publicadas servidas simultaneamente isso pode custar caro
  (mesmo racional de N+1/cota que apareceu em outras fatias B2B, ex. D-113); sem medição real de tráfego ainda,
  então fica registrado em vez de otimizado às pressas.
- Dívida nova (D-145, baixa): `target_cities` usa `ibge_code` (texto livre validado contra `municipalities` na
  criação), mas não há tela nem endpoint para o parceiro BUSCAR o código pelo nome da cidade — a Task 3 (telas)
  precisa de um seletor de município (nome → ibge_code) na Nova Campanha (B2B07), hoje só um campo de código.
- Estado ao final da Task 1: `pnpm typecheck && pnpm lint` verdes; `pnpm db:reset && pnpm test:db`: **1769/1772**
  (3 pulados = baseline; migration 0503 só local, não aplicada em staging — ver PROGRESS.md).

### S26 · Task 2 (domínio: Procon, k-anonimato, cobrança CPM/CPC, extrato)

- Ruling: `features/campaigns/schemas.ts` recebe o formulário em REAIS (`bidReais`, `dailyBudgetReais`,
  `totalBudgetReais`) e `CampaignService.createCampaign` converte para centavos (`Math.round(reais * 100)`) antes
  de chamar o repositório — o banco (0503) só conhece centavos; a fronteira do formulário fica em reais, mais
  natural para o parceiro digitar. Custo se errada: baixo (erro de arredondamento de centavo, não de ordem de
  grandeza — coberto por teste).
- Ruling: `InsightsService.query` (uso do próprio parceiro) deriva o `is_demo` do AMBIENTE do parceiro chamador
  (sandbox → demo; active → real) — o parceiro nunca escolhe qual ambiente consultar; só o admin (`queryAsAdmin`)
  pode escolher explicitamente, para auditoria/depuração. Isto espelha o mesmo Ruling da Task 1 sobre
  `b2b_campaign_serve`.
- Ruling: a formatação do extrato (`formatStatementForDisplay`) soma um "total" só com as linhas `priced` e
  ACRESCENTA o texto "+ itens indisponíveis" quando há alguma linha sem preço — nunca soma zero silenciosamente
  no lugar de um valor desconhecido nem omite que falta informação.
- Estado ao final da Task 2: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build`
  verdes. Unitária **3336/3336** (+22 nesta Task: 8 de k-anonimato, 4 de extrato/formatação, 6 de service.ts,
  4 de schemas.ts). Banco **1769/1772** (sem mudança de migration nesta Task; 3 pulados = baseline).

### S26 · Task 3 (telas B2B06-09, Admin16 e E2E)

- Ruling: geração do extrato (`b2b_statement_generate`) não ganhou tela de admin nesta fatia — só é chamada pelo
  seed do E2E (simulando um fechamento de período). Faltaria uma Server Action + botão (ou um cron mensal, mesmo
  padrão do despacho de webhooks/notificações) para o admin gerar o extrato de cada parceiro sem depender de
  script manual. Registrado como D-146 (média): sem isso, a tela B2B09 do parceiro fica vazia até alguém rodar
  a função manualmente no banco.
- Ruling: `NovaCampanhaForm` (B2B07) só permite escolher UMA série (`<select>` simples), embora o schema e a
  migration aceitem até 3 (`targetGradeStages`) — cortado do MVP por tempo, sem mudar a API; registrado como
  D-147 (baixa).
- Estado ao final da Task 3: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build`
  verdes. Unitária **3336/3336**. Banco **1769/1772** (3 pulados = baseline; uma rodada intermediária teve 1 falha
  isolada, não reprodutível, em `publication-service.test.ts`/`payouts.test.ts` — flutuação já conhecida da suíte
  de banco sob paralelismo, confirmada não relacionada à S26 ao rodar de novo). E2E real com `agent-browser`
  (`scripts/e2e-s26.sh`): **17/17**, sem regressão.

## S26 · correções da revisão de segurança (rodada única, sobre `941ca25`)

Revisão não achou bloqueantes (serve/record ainda não estavam ligados a nenhuma tela/rota — só infraestrutura de
domínio e banco). Todos os achados corrigidos na PRÓPRIA migration `0503_b2b_campaigns.sql` (editada no lugar,
nunca aplicada em staging) e no domínio TypeScript correspondente.

- Ruling (Importante 1 — k-anonimato vazava nos limites): o desenho anterior (`features/campaigns/
  insights-service.ts`) suprimia uma SEGUNDA célula NOMEADA (a de menor contagem entre as visíveis) quando
  exatamente uma cidade ficava abaixo de `minK`, para evitar `total - visíveis = oculta`. Mas essa segunda célula
  suprimida vinha do conjunto VISÍVEL (>= k) e a primeira do conjunto PEQUENO (< k) — quando a soma das duas caía
  exatamente em `k+1`, as únicas contagens inteiras possíveis satisfazendo "uma >= k, a outra < k, soma = k+1" são
  únicas (`k` e `1`), revelando as DUAS por dedução, não só uma. Provado concretamente rodando a função do commit
  `941ca25` (`docs/superpowers/logs/s26-security-fix-red-green.txt`): k=5, cidades 100/5/1, soma oculta = 6 = k+1,
  dedução única = (5, 1). Corrigido por desenho: cidades abaixo de `minK` NUNCA são nomeadas — todas as pequenas
  somam numa célula ANÔNIMA "outras" (sem id/nome), só mostrada quando a PRÓPRIA soma atinge `minK` (aí é, por
  definição, um agregado k-anônimo, não importa a composição interna). Se mesmo agregada a soma não chega a
  `minK`, a célula inteira é omitida (nem número, nem nome) e um flag `partial` avisa que existe dado oculto —
  SEM revelar quanto. O TOTAL deixou de ser a soma bruta real: agora é sempre a soma só do que já foi exibido
  (cidades nomeadas + "outras", quando existir) — como nunca referencia um valor não mostrado, não há mais nada
  para "descontar" por subtração, eliminando a CLASSE inteira de vazamento por limite (não só o caso S=k+1).
  Também trocada a unidade de contagem de LISTA para ESCOLA distinta (`count(distinct sc.id)`, não `sl.id`, em
  `b2b_insights_raw`) — uma escola com várias listas na mesma etapa (séries diferentes, anos diferentes) inflava
  a amostra sem ganhar anonimato de verdade. Testes: 9 cenários de fronteira em `tests/campaigns/
  insights-service.test.ts` (S=k+1, várias ocultas, cidade com 1 escola sozinha, agregado que não atinge `minK`
  nem agregado, ordenação determinística) + teste de banco confirmando a contagem por escola (`tests/db/
  campaigns.test.ts`, "conta ESCOLA distinta... uma escola com 5 séries"). Custo se errada: alto (é o requisito
  central da tela B2B08 e o motivo de o PLAN pedir "teste de k-anonimato" explicitamente).
- Ruling (Importante 2 — record_event não revalidava elegibilidade): `b2b_campaign_record_event` só checava
  `status = 'approved'` da campanha — uma chamada para uma lista bloqueada por Procon, de ambiente errado
  (is_demo), fora de segmentação ou com orçamento esgotado GRAVARIA o evento mesmo assim, porque só
  `b2b_campaign_serve` aplicava essas regras. Corrigido extraindo a elegibilidade inteira para UMA função,
  `b2b_campaign_eligible(p_campaign_id, p_list_version_id)` (que por sua vez usa `b2b_campaign_list_context` para
  a leitura de lista/escola/categoria bloqueada, também extraída), chamada por `b2b_campaign_serve` E por
  `b2b_campaign_record_event` — nenhuma das duas reimplementa a regra. `list_version_id` da tabela de eventos
  virou `not null` (antes aceitava `null`; sem lista não há como revalidar nada). Custo se errada: alto (é
  exatamente o tipo de furo que a Task 1 desta fatia gastou uma migration inteira evitando no `serve`). Testado:
  3 cenários novos em `tests/db/campaigns.test.ts` (Procon, is_demo, lista nula/inexistente).
- Ruling (Importante 3 — dedupe forjável): o `dedupe_key` era escolhido inteiramente pelo chamador (só validado
  por formato hex) — qualquer cliente podia gerar uma chave nova a cada chamada e inflar impressão/clique sem
  limite. Corrigido com uma camada nova, `features/campaigns/tracking-service.ts` (ainda não ligada a nenhuma
  tela/rota — infraestrutura para quando a página pública da lista ganhar o slot patrocinado, fora do escopo desta
  fatia): a chave é derivada no SERVIDOR por HMAC-SHA256 (segredo `B2B_CAMPAIGN_TRACKING_SECRET`, ≥32 caracteres,
  lido direto de `process.env` — não faz parte do `serverSchema` de `lib/env.ts` porque nada consome esta camada
  ainda) sobre IP truncado (privacidade: zera o último octeto IPv4 / mantém só ~/48 IPv6) + user-agent + lista +
  campanha + dia; a impressão emite um TOKEN assinado que o clique precisa apresentar (verificado em tempo
  constante, `timingSafeEqual`) — sem token, nem chega a chamar o banco (o banco também exige impressão prévia
  com a MESMA `dedupe_key`, defesa em profundidade: duas checagens independentes, uma em TS e uma em SQL). Limite
  de 20 impressões e 10 cliques por minuto por (IP truncado, lista, campanha), mesma camada de balde em memória já
  usada pelo widget/API B2B (`lib/rate-limit/memory-bucket.ts`) — primeira camada só; o Firewall da Vercel
  continua sendo a de verdade (mesma ressalva de sempre, D-001/D-113 etc.). Testado: 11 casos (determinismo,
  sensibilidade a cada insumo, truncagem de IP, token inválido/adulterado/de outra campanha, limite por minuto).
- Ruling (Importante 4 — CPM arredondava por evento): `ceil(bid_cents::numeric / 1000)` a cada impressão inflava
  sistematicamente um bid pequeno (ex.: 1 centavo/mil = 0,001 centavo real por impressão virava 1 centavo POR
  EVENTO — 1000x). Corrigido acumulando EXATO, sem arredondar: `accrued_total_cents` (campanha),
  `b2b_campaign_ledger.amount_cents`/`balance_after_cents` e `b2b_statement_line_items.amount_cents` viraram
  `numeric(14,3)` (milésimos de centavo); o arredondamento para reais só acontece na FORMATAÇÃO do extrato
  (`statement-service.ts`, exibição, nunca no acúmulo). `unit_price_cents` (o bid em si) continua inteiro — é o
  valor que o parceiro declarou, sempre redondo. Invariante testada: `amount_cents = quantidade × bid / 1000`
  (CPM) ou `× bid` (CPC), exato, em `tests/db/campaigns.test.ts`. PostgREST devolve `numeric` como string (não
  float, para não perder precisão) — `features/campaigns/repository.ts` ganhou um `numericAsNumber` (mesmo padrão
  já usado para `quantity`) aplicado a `accrued_total_cents` e ao `amount_cents` do extrato. Custo se errada: alto
  (inflar 1000x o "acúmulo informativo" de um parceiro real, mesmo sem ser dinheiro de verdade, é um erro grosseiro
  de produto que mina a confiança no extrato).
- Ruling (Importante 5 — extrato sem filtro de ambiente): `b2b_statement_generate` somava QUALQUER campanha do
  parceiro no período (inclusive uma com `is_demo = true`, sandbox) e QUALQUER uso de chave (inclusive
  `environment = 'test'`) — um parceiro `active` com uma campanha sandbox residual ou uma chave de teste ativa
  veria esse uso no extrato REAL. Corrigido com `and c.is_demo = false` no agrupamento de campanhas e
  `join b2b_api_keys k ... and k.environment = 'live'` na soma de uso de API. Testado: cenário com uma campanha
  sandbox E uma chave `test` gerando dado que NUNCA aparece no extrato de um parceiro `active`
  (`tests/db/campaigns.test.ts`, "extrato filtra is_demo").
- Ruling (Menor): `resumeCampaignAction`/`CampaignService.resumeCampaign` prometiam ao DONO retomar uma campanha
  pausada, mas `b2b_campaign_transition` só permitia ADMIN mover para `approved`, em qualquer origem — o dono
  literalmente não conseguia usar o botão "Retomar" da B2B06. Corrigido tornando a checagem de admin ESPECÍFICA
  da transição real de aprovação (`pending_review -> approved/rejected`); `paused -> approved` (retomar) passou a
  aceitar dono OU admin. `decided_by`/`decided_at` também pararam de ser reescritos quando o dono retoma (só
  registram a decisão de admin de verdade). Testado: dono retoma com sucesso sem virar "decisor" no lugar do
  admin original; dono e admin recusados igualmente quando o orçamento total já se esgotou.
- Ruling (Menor): `getCampaignById` (queries.ts) lia qualquer campanha por id SEM checar ator nenhum — o
  repositório usa o cliente de SERVIÇO (ignora RLS), então isto expunha qualquer campanha de qualquer parceiro a
  quem chamasse a função (hoje sem nenhuma tela chamando, mas exportada e pronta para uso incorreto). Corrigido
  exigindo `actor` e checando posse (`CampaignService.getCampaignForActor`, mesmo padrão de `StatementService
  .listForPartner`): sem vínculo com o parceiro dono da campanha (nem admin), `forbidden`.
- Ruling (Menor): `callerBrandEnvironment`/`isPartnerMemberOrAdmin`/`myPartnerId` (wiring.ts) não filtravam
  `member_role = 'owner'` explicitamente — corretas hoje só porque `b2b_partner_members` tem `unique(profile_id)`
  (0501: um perfil pertence a NO MÁXIMO um parceiro, para sempre) e `'owner'` é o único papel que existe. Mesmo
  assim, o filtro agora é EXPLÍCITO nas três funções, documentando a dependência do invariante do banco em vez de
  confiar só em "achou uma linha".
- Ruling (Menor): gatilho `b2b_campaign_events_accrue` não era `enable always` — uma sessão com
  `session_replication_role = replica` (usada em limpeza de teste de outras fatias) pularia o acúmulo/pausa por
  orçamento. Corrigido com `alter table ... enable always trigger`, mesmo padrão dos gatilhos de imutabilidade já
  existentes na mesma migration.
- Ruling (Menor): guarda documentada para "toda exibição futura precisa do selo Patrocinado" —
  `features/campaigns/repository.ts::servedSchema` já validava `sponsored: z.literal(true)`; comentário novo
  explica por que é de propósito (o `.parse()` estoura alto se o banco um dia devolver outra coisa) e
  `tests/campaigns/serve-guard.test.ts` (3 casos) prova isso explicitamente, incluindo campo ausente.
- Estado final: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes.
  Unitária **3354/3354** (+18 desde a Task 3: 9 reescritos de k-anonimato, 11 de tracking-service, 3 de
  serve-guard, 3 de getCampaignForActor — menos os removidos do desenho antigo). Banco **1775/1778** (3 pulados =
  baseline; +6: 3 de revalidação de elegibilidade do record_event, 1 de retomada pelo dono, 1 de filtro is_demo do
  extrato, 1 de acúmulo CPM exato). Duas rodadas de `test:db` tiveram 1 falha isolada cada, em arquivos ALHEIOS a
  esta fatia (`publication-service.test.ts`, `payouts.test.ts`, `submissions.test.ts`) — confirmada não
  reprodutível e não ligada à S26 ao rodar de novo (flutuação já conhecida da suíte sob paralelismo). E2E
  `scripts/e2e-s26.sh` refeito do zero (`pnpm db:reset` + reseed do `scripts/e2e-s26-seed.sql`, atualizado para
  passar `list_version_id` real — 0503 agora exige não nulo): **20/20**, sem regressão de nenhuma verificação
  anterior (17 originais + 3 novas sobre o texto atualizado de insights).

## S26 · correções da revisão de segurança (rodada 2, reverificação sobre `1e35153`)

Sem bloqueantes. 3 importantes corrigidos na própria `0503_b2b_campaigns.sql` (editada no lugar, ainda só local) e
em `features/campaigns/tracking-service.ts`; 2 menores resolvidos direto (um virou correção, o outro dívida).

- Ruling (Importante 1 — eventos contornavam o k-anonimato): mesmo já sem `list_version_id` (events) e sem
  `event_id` (ledger) no grant de `authenticated` da 1ª rodada, o dono ainda podia ler as tabelas linha a linha
  (`event_type`/`day`/`created_at` em `b2b_campaign_events`; `entry_type`/`day`/`amount_cents`/`created_at` em
  `b2b_campaign_ledger`) — o CARIMBO DE HORA de cada evento, combinado com a própria segmentação da campanha
  (cidade, série, categoria, que o dono já conhece porque ele mesmo definiu), pode bastar para inferir qual
  escola/família específica gerou um evento isolado, contornando o k-anonimato pensado para os insights. Corrigido
  criando `b2b_campaign_performance(p_actor_id, p_campaign_id)`, única forma pretendida de o dono/admin ver
  desempenho: agregado por DIA, com a MESMA supressão por k mínimo (escolas distintas) dos insights — dia com
  menos de `min_k` escolas contribuindo vem com `impressions`/`clicks`/`accrued_cents` nulos e `suppressed = true`.
  Testado: dia com 5 escolas (>= k padrão) aparece com os números reais; dia com 2 (< k) some por inteiro; admin
  também acessa; um terceiro sem vínculo recebe `not_found` (nunca revela que a campanha existe). Custo se errada:
  alto (é a mesma classe de vazamento do Importante 1 da rodada 1, só que pela porta dos fundos das tabelas em vez
  dos insights).
- Ruling (Importante 2 — dedupe ainda fraco): 3 ajustes sobre o desenho da rodada 1. (a) User-agent SAIU do HMAC
  da `dedupe_key` — é um valor que o PRÓPRIO cliente escolhe e envia, então incluí-lo só dava um jeito grátis de
  gerar chaves novas trocando o cabeçalho a cada chamada; agora a chave é só IP truncado em /24 + lista + campanha
  + dia. (b) O limite de eventos por minuto passou a ser chaveado por (IP /24, CAMPANHA) — SEM a lista — somando
  TODAS as listas daquela campanha; antes, chavear por lista deixava a mesma rede /24 abrir uma cota nova só
  visitando outra lista da mesma campanha. (c) O token de impressão ganhou timestamp embutido e vida curta de 10
  minutos, verificado no clique (antes o token nunca expirava). O IP precisa vir de `lib/net/client-ip.ts::clientIp`
  (reaproveitado, mesmo critério já usado pela API B2B/widget: `x-vercel-forwarded-for` -> `x-real-ip` ->
  `x-forwarded-for`) quando isto for ligado a uma rota de verdade. Testado: 6 casos novos (token expira depois de
  10 min, token "do futuro" além de 5s de tolerância é recusado, token malformado não lança, limite soma listas
  diferentes da mesma campanha, limite é por campanha — outra campanha tem cota própria). O teto por instância
  (em vez de compartilhado entre instâncias) virou dívida D-148 (média), com Ruling de que é **obrigatório**
  resolver antes de ligar a uma rota pública — diferente do racional "primeira camada, Firewall resolve o resto"
  aceito em outras fatias, porque aqui o abuso infla diretamente o "acúmulo informativo" cobrável de um parceiro
  terceiro.
- Ruling (Importante 3 — retomada não respeitava quem pausou): campanha ganhou `pause_origin` (`owner`/`admin`/
  `budget_auto`, preenchido só enquanto `status = 'paused'`, limpo em qualquer outra transição). Pausa do ADMIN só
  o admin retoma (`forbidden` para o dono, mesmo com orçamento disponível); pausa do DONO ou automática por
  orçamento (`budget_auto`) o dono também retoma — no caso `budget_auto` ele TEM permissão, mas esbarra no
  orçamento esgotado (`budget_exhausted`), uma falha diferente de `forbidden` (o teste dos 3 casos confere
  exatamente essa distinção). `CampaignsTable.tsx` (B2B06) esconde o botão "Retomar" e mostra um aviso quando
  `pauseOrigin === 'admin'`, para não prometer ao dono uma ação que o banco recusaria (mesmo racional da correção
  "resumeCampaignAction coerente" da rodada 1).
- Ruling (Menor, resolvido — concorrência de orçamento): `b2b_campaign_record_event` trava a linha da campanha
  (`for update`) ANTES de checar elegibilidade (que inclui o orçamento), não só dentro do gatilho de acúmulo —
  sem isto, duas chamadas concorrentes perto do teto podiam as duas passar pela checagem e as duas inserir,
  estourando o orçamento por mais de um evento. A trava foi colocada em `record_event` (caminho de ESCRITA), NUNCA
  em `b2b_campaign_eligible` (que `serve()` também usa, em volume de LEITURA bem maior — travar ali serializaria
  leituras concorrentes à toa). Resolvido em código, sem virar dívida (o pedido permitia resolver "se for barato",
  e era).
- Dívida nova (D-149, baixa): diferença de "outras" ao longo do tempo — repetir a mesma consulta de insights
  conforme escolas publicam/removem listas pode, em tese, isolar a contribuição de uma escola por diferenciação
  entre duas leituras. Sem solução simples nesta fatia (limitar frequência de consulta, ou privacidade
  diferencial de verdade); registrada para revisão futura.
- Estado final: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes.
  Unitária **3360/3360** (+6: expiração/tolerância de relógio/token malformado do tracking-service, limite por
  campanha somando listas). Banco **1778/1781** (+3: privilégio por coluna de `list_version_id`/`event_id`, os 3
  casos de `pause_origin`, `b2b_campaign_performance`; 3 pulados = baseline). E2E `scripts/e2e-s26.sh`: **20/20**,
  sem regressão (nada no roteiro pausa/retoma campanha nem lê as tabelas afetadas diretamente).

## S26 · correções da revisão de segurança (rodada 3, reverificação sobre `1d4d0f2`)

- Ruling (Importante — grant por coluna ainda contornava o k-anonimato): a rodada 2 já tinha tirado
  `list_version_id`/`event_id` do grant de `authenticated`, mas as colunas restantes (`event_type`/`day`/
  `created_at`/`updated_at` em `b2b_campaign_events`; `entry_type`/`day`/`amount_cents`/`balance_after_cents`/
  `created_at`/`updated_at` em `b2b_campaign_ledger`) continuavam legíveis linha a linha pelo cliente de sessão.
  Isso ainda é suficiente: o CARIMBO DE HORA de cada linha, cruzado com a segmentação que o próprio dono já
  conhece (cidade, série, categoria), pode isolar uma contagem por escola/dia abaixo de `min_k` — exatamente o
  vazamento que `b2b_campaign_performance` (rodada 2) foi criada para evitar, só que pela porta dos fundos das
  tabelas em vez da função. Corrigido revogando **todo** select de `authenticated` nas duas tabelas — nenhuma
  coluna, nenhuma policy de RLS para esse papel (`b2b_campaign_events_select_member_or_admin` e
  `b2b_campaign_ledger_select_member_or_admin` foram REMOVIDAS, não só esvaziadas: com grant zero a policy nunca
  seria avaliada mesmo, mas mantê-la seria uma pista falsa numa auditoria futura). Único jeito de o dono/admin
  verem qualquer coisa sobre eventos/livro-razão: `b2b_campaign_performance` (desempenho agregado por dia,
  já com a supressão k) e o extrato (`b2b_statements`/`_line_items`, que não referencia lista/escola nenhuma).
  `service_role` continua com a tabela inteira (as funções internas — inclusive `b2b_campaign_performance`, que é
  `SECURITY DEFINER` e roda com o dono da função, não com o grant do chamador — precisam). Nenhuma tela ou query
  da aplicação lia estas tabelas com o cliente de SESSÃO (só a função via cliente de SERVIÇO já era usada); a
  única mudança de código foi o próprio grant/RLS na migration. Testado: `has_table_privilege('authenticated', ...,
  'select')` falso nas duas tabelas; `has_column_privilege` falso em TODA coluna de cada uma (loop, não só as duas
  óbvias); `pg_policies` sem nenhuma linha com `authenticated` no array de `roles` para essas tabelas;
  `service_role` continua com a tabela inteira; e um teste de sessão real (`withClaims`) confirmando `42501` para
  dono E admin tentando ler `b2b_campaign_events`/`b2b_campaign_ledger` direto. Custo se errada: alto (3ª vez que a
  mesma classe de vazamento aparece nesta fatia — cada rodada fechou uma porta e deixou outra aberta; esta rodada
  fecha a família inteira revogando TUDO em vez de restringir coluna por coluna).
- Estado final: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes.
  Unitária **3360/3360** (sem mudança de contagem: só migration e teste de banco mudaram nesta rodada). Banco
  **1778/1781** (mesma contagem da rodada 2: os testes foram reescritos/ampliados, não somados; 3 pulados =
  baseline; uma rodada intermediária teve 2 falhas isoladas em `submissions.test.ts`, arquivo alheio a esta fatia,
  confirmadas não reprodutíveis ao rodar de novo). E2E `scripts/e2e-s26.sh`: **20/20**, sem regressão (nada no
  roteiro lê `b2b_campaign_events`/`b2b_campaign_ledger` direto).

## S26 · merge de origin/main (PR #45, S15) — renumeração de dívida

`origin/main` avançou com a S15 (PR #45) enquanto esta branch tinha D-140–D-146 escritos (Task 1, Task 3,
rodada 2 da revisão de segurança). A S15 já tinha ocupado D-140–D-142 (renumerados lá de D-123–D-125 por colisão
com S23/S25). Nesta resolução de merge, os itens da S26 foram renumerados para D-143–D-149 (mesmo conteúdo, só o
número mudou) — ver `docs/superpowers/DEBT.md`, nota de numeração. Sem conflito de conteúdo: `docs/superpowers/
PROGRESS.md` só teve a mesma linha "Em paralelo"/"S15" editada dos dois lados, resolvida por união (mantendo os
dois "✓").

## S18 · correções da revisão (rodada única sobre `7df909a`)

Revisão não achou bloqueantes na refatoração de D-057 (confirmado: movimento puro, sem lógica alterada). 4 itens
pedidos, todos corrigidos ou verificados nesta rodada, worktree T3.

1. **Área da família (`app/conta`) sem skip-link/`id="conteudo"`/foco visível.** Corrigida a nota do plano
   (`docs/superpowers/plans/2026-09-27-s18-estados-a11y.md`): não existe (nem existiu) um componente `ContaShell`
   — `/conta` é `app/conta/layout.tsx` (compartilhado pelas 8 páginas) + cada `page.tsx` com o próprio `<main>`.
   `<SkipLink />` entra uma vez no `layout.tsx` (mesmo padrão de `app/(site)/layout.tsx`); `id="conteudo"` em
   TODOS os `<main>` já existentes das 8 páginas (9 ocorrências — `app/conta/notificacoes/page.tsx` tem dois
   `<main>`, um por branch de erro/sucesso) — nenhum `<main>` novo criado, nenhuma duplicação. Foco visível
   acrescentado aos 4 links/botão sem substituto em `app/conta/page.tsx` (hub da conta): "Buscar lista da
   escola", "Ver suas cotações...", "Privacidade e dados" e "Sair" — nenhum dos outros 7 arquivos sob `/conta`
   tinha link/botão sem `focus-visible` (checado um a um). Teste em `tests/a11y/conta.test.tsx`.
2. **Capturas `S18-03`/`S18-04` idênticas.** Confirmado por md5 (mesmo hash, 46835 bytes) antes de investigar.
   Os dois estados são reais e diferentes (a asserção de `disabled` que roda ENTRE as duas capturas já provava
   isso: `true` na primeira, `false` na segunda) — o defeito era só na CAPTURA, não no produto nem na asserção.
   Causa: não identificada com certeza (a explicação mais provável é uma janela de corrida entre o
   `location.reload()`/clique e o `shot()`, que só dorme 1 s antes de capturar); em vez de adivinhar a causa,
   `scripts/e2e-s18.sh` ganhou uma folga maior antes de cada captura do passo 3 (2 s em vez de 1 s implícito do
   `shot()`) e uma checagem de md5 dentro do próprio roteiro que FALHA (`bad`) se as duas capturas saírem
   idênticas — nunca mais um par de capturas iguais passa em silêncio. Regeradas e confirmadas diferentes (ver
   gate desta rodada).
3. **Foco visível ausente em `SearchForm.tsx:45` e nos 3 checkboxes da pesquisa (ADR-005).** Verificado achado a
   achado, sem tocar em nenhum dos quatro: os quatro têm `outline-none` no elemento de FORM (input/checkbox) mas
   o elemento PAI (o `<div>` ou `<label>` que os envolve) já tem o substituto — `focus-within:outline-verde-fundo`
   em `SearchForm.tsx` (linha 33) e `has-focus-visible:outline-verde-fundo` nos três `<label>` da pesquisa
   (`OpcaoMultipla.tsx`, `PerguntaCompraIdeal.tsx`, `TelaFinal.tsx`) — mesmo padrão já usado em
   `components/stationeries/fields.tsx` (`has-[:focus-visible]:ring-2`). Conferido que a variante `has-focus-
   visible:` do Tailwind v4 compila para CSS real (não é classe morta): `.next/static/chunks/*.css` do build
   desta sessão tem `.has-focus-visible\:outline-verde-fundo:has(:focus-visible){outline-color:var(--verde-fundo)}`.
   Falso positivo da revisão (grep de `outline-none` sem checar o elemento pai) — nenhum código mudado nestes 4
   pontos, para não arriscar mudar lógica/texto da pesquisa (ADR-005, regra explícita do pedido). Varredura
   ampla: os 16 arquivos do repositório com `outline-none` foram checados um a um — os outros 12 têm o
   substituto no MESMO elemento (`focus-visible:ring-*`/`focus-visible:outline-*`); nenhum achado real de foco
   ausente em todo o repositório. Custo se esta análise estiver errada: reabrir os 4 pontos com o achado
   original (nenhuma mudança de código a desfazer, já que nada foi tocado).
4. **Nota sobre o padrão de refatoração do roteador.** `supabase/functions/_shared/ai/router.ts` →
   `router-helpers.ts` (D-057, commit `0df7936`) usou o mesmo padrão de `features/claims/repository.ts` →
   `repository-evidence.ts`/`repository-tokens.ts` (commit `02dd693`): a fábrica principal (`createRouter`)
   mantém as closures que capturam `deps` (`fakeAllowed`, e agora também `resolve`, que envolve a função pura
   `resolveRoute` do arquivo-irmão com os argumentos já capturados), em vez de exportar o estado como um objeto
   de contexto explícito (o padrão usado nos módulos de `leads`/`stationeries`/`cart`, que são coleções de
   funções top-level sem estado fechado). Os dois padrões (closure→sub-fábrica para módulos com UM estado
   fechado por chamada; funções top-level puras para módulos sem estado) foram escolhidos caso a caso conforme a
   forma original de cada arquivo, não por uma regra única — registrado aqui só para quem for ler o diff de
   D-057 entender por que os dois grupos de arquivos-irmãos têm formas de composição diferentes.

Gate desta rodada: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build`
verdes (ver relatório da rodada). E2E das partes tocadas (`/conta`, `/admin/denuncias/[id]`) repetido com
`scripts/e2e-s18.sh` — PASS, capturas `S18-03`/`S18-04` confirmadas diferentes por md5 dentro do próprio roteiro.

## S28 · Excelência de produto e design

Fase 1 (diagnóstico) e medição "antes", worktree `S28-excelencia`, branch `slice/S28-excelencia-produto`, base `1b9fb28`. Entradas: `docs/MELHORIAS.md`, `docs/superpowers/specs/2026-09-28-s28-excelencia-design.md`, `docs/superpowers/plans/2026-09-28-s28-excelencia.md`, `docs/superpowers/evidencias/S28/antes/`.

- Ruling: spec da S28 aprovado em modo autônomo (as perguntas da skill `superpowers:brainstorming` foram respondidas com SPEC, PLAN, `docs/design`, código da `main` e desenho da pesquisa com mães; nenhum humano consultado) — o PLAN e a ADR-006 mandam registrar o spec como Ruling e não esperar aprovação — se estiver errado, refazer `MELHORIAS.md` e o plano, sem código perdido porque nada foi implementado ainda.
- Ruling: a instrumentação PostHog (ADR-007, aprovada pelo humano em 28/09/2026, plano gratuito) é hospedada pela S28 (item M01), e não pela S19 — a S19 ainda não foi mesclada e a S28 precisa dos funis; a ADR-007 previa a S19 como encaixe — se estiver errado, mover `lib/analytics/*` para a S19 sem mudar o esquema de eventos. Continua desligada sem `NEXT_PUBLIC_POSTHOG_KEY`, sem nenhum dado pessoal de menor nem do responsável, só identificadores pseudônimos (uuid do perfil, INEP, slug de série, IBGE).
- Ruling: PostHog sem o SDK `posthog-js`: cliente mínimo próprio de `fetch` para a API de captura, via proxy `/ingest`, sem autocaptura e sem replay de sessão no piloto — o piloto é celular em 4G e a autocaptura pode ler texto de tela; a ADR-007 trata replay como opcional — se estiver errado, adicionar o SDK adiado atrás da mesma camada de consentimento e esquema (cerca de um dia).
- Ruling: consentimento (revisado após o ADR-007 aceito, 29/09/2026) — o critério de aceite do ADR-007 diz "E2E confirmando que nada é enviado antes do consentimento", então nada sai do navegador antes do aceite (`sendBeforeConsent = false` em `lib/analytics/config.ts`); eventos anteriores ao aceite ficam só em fila de memória descartável (sem cookie, sem `localStorage`, sem `identify`) e só são liberados se o aceite vier na mesma página; recusa e revogação descartam a fila e desligam o envio. Substitui a leitura anterior ("só anônimo em memória"), que enviava eventos antes da escolha — custo se estiver errada: perde o funil de quem não decide o aviso; reabrir para `sendBeforeConsent = true` exige nova decisão do humano sobre o ADR-007.
- Ruling: custo de IA guarda o uso real devolvido pelo provedor (tokens e custo em dólar do OpenRouter) e converte para reais só com `usd_brl_rate` configurado em `ai_settings`; sem taxa, relatório em dólar e "BRL indisponível" — regra "nunca inventar" (CLAUDE.md) — se estiver errado, definir a taxa; nada a desfazer.
- Ruling: o top 15 tem M01 (PostHog) e M02 (custo de IA e consultas lentas) como itens fixos; M09 (acessibilidade), M08 (desempenho) e M15 (`DESIGN.md`) entram por exigência de aceite da ADR-006 mesmo com prioridade I÷E menor que 2 — sem eles a fatia não cumpre o aceite mensurável — se estiver errado, trocar por M22 ou M26 com novo Ruling.
- Ruling: itens que exigem ação só do humano ficam fora da fatia (M16 código de 6 dígitos por depender do template do e-mail hospedado, M17 carrinho anônimo por exigir revisão de segurança de RLS, M21 WhatsApp por credencial e gasto, M32 preço de varejo por afiliado) — exceções de autonomia do CLAUDE.md — se estiver errado, reabrir com o humano; o custo é só a espera.
- Ruling: medição de desempenho e acessibilidade em build de produção local (`next start`) com Supabase local e dados de demonstração, não no preview da Vercel (público, apontado ao staging e sem dados de demonstração completos) — reprodutível e sem tocar staging; Lighthouse 12, mediana de 3 execuções, 4G simulado — se estiver errado, repetir no preview antes do PR (o script aceita `BASE`).
- Ruling: `pesquisa com mães` só entra como hipótese (vocabulário das dores e canais), sem percentual, porque o repositório só tem dados de teste apagados e uma resposta real; os dados do staging da pesquisa não foram consultados nesta fase — se estiver errado, recalibrar `MELHORIAS.md` quando houver 100 respostas completas.

## Orquestrador único e decisões do humano (2026-09-28)

- Ruling: uma única sessão orquestra S19, S28 e S20; as 4 sessões pares ativas foram avisadas e confirmaram parada; WIP da D-081 (S19 Task 6) revisado e commitado (`5cc39fd`) em vez de descartado — motivo: diff pequeno, coerente com a D-081 e com teste verde — custo se estiver errada: reverter um commit isolado.
- Ruling: S28 continua no worktree `.claude/worktrees/S28-excelencia`, branch `slice/S28-excelencia-produto` (igual a `origin/main` `1b9fb28`), com portas da trilha 2 — motivo: já alinhado ao PLAN; a branch local `slice/S28-excelencia` do T2 nasceu sobre os commits da S19 e não pôde ser recriada (classificador) — custo: nenhum, só o nome da branch difere do pedido.
- Ruling: skills da S28 (`impeccable`, `tripled-ui`, `design-intelligence`) vêm de `.claude/skills` na `main` (`1b9fb28`), com `superpowers:brainstorming` em modo autônomo — decisão do humano; item removido de "Aguardando humano".
- Ruling: plano de cobrança do staging (D-102) = 10 leads grátis por papelaria sem validade (`free_leads_validity_days = null`), faixa única R$ 5,00 por lead (1 item em diante), passe de temporada R$ 1.500,00 de novembro a março em até 3x — valores do humano. Complementos exigidos pelo schema e escolhidos pelo orquestrador: `pass_included_leads = 300` (R$ 1.500 ÷ R$ 5, sem inventar desconto) e pacotes de crédito R$ 50, R$ 100 e R$ 250 (10, 20 e 50 leads ao preço unitário) — motivo: `billing_plan_publish` exige 1–6 pacotes e leads incluídos no passe; derivar do preço unitário não inventa preço novo — custo se estiver errada: publicar nova versão do plano (a anterior é arquivada, histórico preservado).
- Ruling: ADR-007 (PostHog) aceito pelo humano no plano gratuito, sem dado pessoal de menor nem do responsável, só identificadores pseudônimos; instrumentação entra na S28, não na S19 — motivo: a S19 já passou pela revisão de segurança Opus e está em correção; incluir telemetria de cliente agora exigiria nova rodada; a S28 já mexe nos funis que os eventos medem — custo: S19 fecha sem telemetria de produto (Sentry continua cobrindo erros).
- Ruling: Google OAuth ativo no staging (humano); o E2E do staging inclui login com Google usando o navegador do humano (claude-in-chrome), porque o agent-browser não tem conta Google — custo: se a sessão do Chrome não estiver logada, o passo vai para "Aguardando humano".
- Ruling: supera o Ruling da S21 (ledger, "NÃO publicar plano de cobrança provisório") — os valores agora vêm do humano. A publicação no staging foi barrada pelo classificador ("Permission Grant": criar/promover admin); fica em "Aguardando humano" com o SQL exato — custo: o lead real ponta a ponta no staging espera o humano.
- Ruling: auditoria impeccable da Fase 2 feita com `PRODUCT.md` escrito pelo orquestrador a partir de CLAUDE.md, SPEC e guia de marca (a skill pede entrevista com o humano; a regra de autonomia proíbe perguntas) — se estiver errado, o humano edita `PRODUCT.md`; nenhuma auditoria depende de um texto específico dele.
- Ruling: a auditoria da área Escola foi feita no fluxo de reivindicação e no código, sem sessão de membro aprovado, porque o banco local não tem reivindicação aprovada e `seed:demo-claims` nunca aprova — se estiver errado, semear um membro e repetir `/escola/*` na Fase 4.
- Ruling: Fase 2 sem nenhuma correção de código, como manda o plano (correções entram nas tasks 8 a 21) — custo se estiver errada: nenhum.
- Ruling: os tokens do projeto se chamam `--tinta`, `--papel`, `--verde-*`, `--texto-2/3`, `--linha`, `--campo`, `--aviso-*`, `--erro-*`, `--demo-*` (utilitários Tailwind `bg-tinta`, `text-texto-2`), não `lc-*` como o plano dizia; o `DESIGN.md` usa os nomes reais — se estiver errado, renomear tokens é mudança grande e sem ganho.
- Ruling: ajustes ao plano da S28 aceitos pelo orquestrador (tokens reais sem `lc-`; M33 dentro da Task 13; Task 18 com foco Verde Fundo, tokens `erro-*`, borda de campo e confirmação unificada; Task 20 com escopo explícito e checagens próprias no script de medição; Task 15 com ação primeiro no mobile; Task 8 sem nomes de varejistas sem parceria real; Task 30 com membro de escola semeado) — motivo: achados das auditorias da Fase 2 e regra de nunca inventar parceria — custo se estiver errada: reverter texto do plano, sem código
- Ruling: Task 12 (M04) reaproveita `components/submissions/prepareUpload.ts` (S07 já reduzia fotos por canvas, ao contrário do que a auditoria dizia) e acrescenta só a escada de reserva `features/submissions/image-reduction.ts` (lados 2000/1600 e qualidades 0,85 a 0,55) quando a primeira passada ainda passa de 4 MB, mais a mensagem de orientação — motivo: evitar módulo duplicado; custo se estiver errada: remover a escada
- Ruling: Task 13 (M06) mostra duas saídas na busca vazia ("Enviar a lista da escola" e "Ver escolas de Cuiabá"); "Avisar quando a lista sair" depende de escola escolhida (o "me avise" é por lista) e não existe quando a busca não achou escola — o teste de consulta é `tests/db/published-lists.test.ts` (o glob do `test:db` cobre `tests/db/**`) — custo se estiver errada: adicionar o link quando houver escola sem lista
- Ruling: Task 15 (M12) troca "Responder no WhatsApp" por "Abrir e responder o pedido" no cartão de lead do celular — o lead não carrega telefone do responsável (é o responsável que chama a papelaria; "Nome, e-mail e telefone não passam pela ListaCerta"), então não há link `wa.me` para a papelaria; a ação principal vira botão de 48 px que abre o pedido, e as métricas descem para depois da lista no celular (sem verde em zero) — custo se estiver errada: trocar o rótulo se um dia houver canal de resposta pela plataforma.
- Ruling: Task 17 (M07) remove `app/loading.tsx` da raiz (introduzido na S18) — um `loading.tsx` na raiz envolve toda rota em Suspense e força streaming; medido com `scripts/e2e-soft-404.sh` no build local, `/escolas/00000000`, `/escolas/abc`, série inválida e `/reivindicar` respondiam 200 (soft-404, D-043 de volta) e voltaram a 404 sem ele. Esqueletos (`components/ui/Skeleton.tsx`) só em `papelaria`, `escola` e `carrinho/[id]` (árvores privadas; o script ganhou checagem 307 para `/papelaria` e `/escola`); `escolas/[inep]/[serie]` fica SEM loading por ser indexável — custo se estiver errada: rotas sem loading próprio navegam sem indicador (estado anterior à S18); teste `tests/a11y/loading-and-buttons.test.tsx` vigia a ausência. CLS < 0,1 medido na Task 30.
- Ruling: Task 18 (M15) adiou M34 (admin recolhível no celular) para a Task 20, onde a rolagem horizontal das 17 rotas do admin é tratada de qualquer forma; nesta task entram `components/ui/{Button,Field,ConfirmDialog}.tsx`, foco Verde Fundo, tokens `erro-*` no lugar de todo `red-*`/hex de erro (troca mecânica em ~30 arquivos, vigiada por teste), borda de campo por regra global em `@layer base` (cobre os `input.bg-campo` existentes sem migrar todos) e `ConfirmDialog` no lugar de `window.confirm` (ActionForm) e dos diálogos de aluno e chave B2B; os diálogos do admin de parceiros ficam com o padrão `<dialog>` próprio (mesmo comportamento) — custo se estiver errada: migrar os dois restantes.
- Ruling: Task 19 exige `B2B_CAMPAIGN_TRACKING_SECRET` com `APP_ENV=production` (não `NODE_ENV=production` como o plano dizia) e dá o desligamento explícito `B2B_CAMPAIGN_TRACKING=0` — o preview e o staging da Vercel rodam com `NODE_ENV=production`, e exigir o segredo ali derrubaria o ambiente de staging que hoje funciona sem ele; a produção real é marcada por `APP_ENV=production` — custo se estiver errada: trocar a condição em `lib/env.ts`. O humano define o segredo na Vercel antes do go-live (anotado no PROGRESS ao fim da fatia).
- Ruling: Task 20 (M09) corrige por regras globais em `@layer base` de `app/globals.css` (botão, resumo e `select` com 44 px; campo de texto com 44 px, `min-width: 0` e borda; rótulo de caixa/rádio com 44 px; `fieldset` sem largura mínima; `.overflow-x-auto` posicionado) em vez de editar as centenas de ocorrências uma a uma, mais correções locais onde a regra não alcança (links de tabela/abas, admin, `main`/`h1`, tabelas de docs); medido por `checks.md` (`scripts/s28-medir.mjs`, 390 px, 60 rotas) — 0 falhas nas rotas acessíveis. Admin: menu recolhível no celular (`AdminNav`, resolve M34 da Task 18). `/escola` (painel) não é medível com a conta de demonstração (exige membro de escola aprovado; segue o Ruling da auditoria — a Task 30 semeia o membro). B2B medido com `parent@listacerta.test` vinculado a um parceiro ativo por INSERT local em `b2b_partner_members` (banco local, some no `db:reset`). Lighthouse 1 execução nas páginas novas (desempenho 95 a 100, acessibilidade 100); a mediana de 3 fica para a Task 30 — custo se estiver errada: regra global ruim para um componente específico, corrigir com classe local.
