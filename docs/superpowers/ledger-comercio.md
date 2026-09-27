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
