# ADR-005 · Pesquisa com mães fora do PLAN

Data: 25/09/2026 · Status: aceita (decisão do humano, Aurimar Nogueira, em conversa de sessão) · Não altera ADR-001 a ADR-004.

## Contexto

O fundador pediu uma pesquisa pública com mães (evidência de dor para o pitch pré-seed e captação de lista de espera para janeiro de 2027), com spec própria e vinculante em `docs/superpowers/specs/2026-09-25-pesquisa-maes-design.md`. Essa fatia não está no `docs/PLAN.md` (que vai de S00 a S27). O CLAUDE.md manda registrar mudança de escopo em `docs/decisions/` antes de codar; este ADR é esse registro.

## Decisão

- **Escopo isolado.** Rotas em `app/pesquisa/**` e `app/api/pesquisa/**`, componentes em `components/pesquisa/**`, lib em `lib/pesquisa/**`, tabelas `survey_responses` e `survey_leads`. Nenhum arquivo fora desse escopo muda, exceto configuração compartilhada estritamente necessária (registrada como Ruling abaixo quando ocorrer).
- **Tabelas `survey_*` são protegidas de reset.** Nenhuma fatia do PLAN, nenhum `db:reset` de staging e nenhuma migration futura pode truncar, recriar ou apagar `survey_responses` ou `survey_leads`: elas guardam respostas reais de pessoas reais, não dado demonstrativo. A limpeza permitida é só `delete` filtrado por `source_group = 'e2e-teste'`.
- **Migração futura para produção.** Quando a S20 criar o projeto Supabase de produção, migrar os dados de `survey_*` do staging (ListaEscolar) para lá é uma tarefa própria da S20, não automática nem implícita nesta fatia.
- **Backup.** A página `/pesquisa/resultados` expõe exportação CSV (respostas e leads) sob demanda; não há job agendado de exportação automática nesta fatia (fora do escopo aprovado — YAGNI da spec, seção 2). O CSV sob demanda é o backup até que exista um.
- **Autorização do fundador, por escrito, nesta feature (25/09/2026):** aplicar migration aditiva no projeto Supabase existente ListaEscolar (staging; não existe produção); criar variáveis de ambiente na Vercel; apagar linhas com `source_group = 'e2e-teste'`; mesclar o PR na `main` sem esperar revisão pessoal do fundador, desde que CI esteja verde, a revisão independente de spec e qualidade por subagente esteja registrada no PR, os 7 cenários ponta a ponta estejam verdes no preview, e nenhuma alteração saia do escopo deste ADR. Fora desses limites (dado fora de `survey_*`/`source_group = 'e2e-teste'`, dinheiro, segredo, force push, RLS) continuam valendo as regras permanentes do CLAUDE.md, inclusive parar e avisar.

## Rulings desta fatia

- Ruling: número do ADR — ADR-004 já existe (trilhas paralelas); este registro usa ADR-005 — o pedido do humano citou "ADR-004" sem ver o índice atual — custo: nenhum, é só numeração.
- Ruling: branch única `claude/vigilant-einstein-75bp5d` (atribuída pelo ambiente cloud) em vez de `slice/SNN-nome` — a sessão cloud proíbe push para branch diferente da designada — custo: nenhum, o nome da branch não afeta o histórico.
- Ruling: nome de variável do Supabase — a spec (seção 9) cita `SUPABASE_SERVICE_ROLE_KEY` (nome legado); o código usa `SUPABASE_SECRET_KEY` por regra permanente do CLAUDE.md — seguimos o CLAUDE.md, que rege nomes de variável no código; a Vercel já tem `SUPABASE_SECRET_KEY` cadastrada — custo: nenhum.
- Ruling: prefixo de migration `0700_pesquisa_maes.sql` — as trilhas do PLAN usam 01xx a 06xx (Dados, Pipeline, Comércio, Cobrança, B2B, pós-trilhas); esta fatia é isolada e sem FK com o restante do schema, então um prefixo 07xx evita qualquer colisão futura — custo: nenhum.
- Ruling: skills `/superpowers:*` não estão instaladas nesta sessão — seguido o mesmo processo manualmente (spec → plano em `docs/superpowers/plans/` → implementação com subagentes por tarefa e revisão de spec/qualidade → revisão final da branch → verificação antes de concluir), como o próprio prompt de execução original deste repositório já prevê como alternativa — custo: nenhum, é o mesmo padrão já usado nas 27 fatias anteriores.
- Ruling: sem Docker/daemon disponível nesta sessão cloud, `pnpm db:start`/`db:reset` (Supabase local) não funcionam e `pnpm test:db` recusa host remoto por desenho. Os testes de integração da seção 10 da spec rodam por dois caminhos: arquivos Vitest de integração ficam no repo (para rodar localmente quando houver Docker) e a verificação real desta sessão contra o ListaEscolar (staging) é feita chamando a mesma lógica de repositório a partir de um script Node autenticado com a service key, com limpeza por `source_group = 'e2e-teste'` ao final — custo: a suíte `test:db` não cobre esta fatia nesta sessão; falta rodá-la localmente quando o Docker estiver disponível para confirmar contra Postgres local também.
