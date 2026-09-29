# ADR-007 · Instrumentação de produto com PostHog

Data: 27/09/2026 · Status: **aceito** em 28/09/2026 pelo humano (Aurimar Nogueira), no plano gratuito do PostHog, com a condição de nenhum dado pessoal de menor nem do responsável nos eventos (só identificadores pseudônimos); instrumentação na S28 (Ruling do orquestrador). Proposta original de 27/09/2026 · Não altera ADR-001 a ADR-006.

Nota de numeração: o pedido citou "ADR-004", mas esse número já é o das trilhas paralelas (e ADR-005 e ADR-006 também existem). Este registro usa o próximo número livre, ADR-007.

## Contexto

O produto já registra o que é de negócio no próprio banco: leads e `lead_events` (S14), conversão e contestação (S22), cobrança (S21/S23), decisões de IA (`ai_decisions`) e jobs de OCR (`jobs`). O que falta é enxergar o **caminho** até esses fatos: de onde a família chegou, onde desistiu, quanto tempo a leitura da lista leva do ponto de vista de quem espera, e em que passo a papelaria trava antes de receber o primeiro lead. Sem isso, a S28 (ADR-006) e o piloto em Cuiabá decidem melhorias sem medir funil.

## Decisão (proposta)

1. **PostHog Cloud** para eventos de produto, funis e (opcionalmente) session replay.
2. **Supabase continua sendo a fonte de verdade** de leads, `lead_events`, conversão, cobrança e publicação. O PostHog recebe **espelhos de eventos** para análise; nenhuma regra de negócio, cobrança, repasse ou métrica exibida ao usuário lê o PostHog. Divergência entre os dois se resolve pelo banco.
3. Plano de eventos em [`docs/tracking-plan.md`](../tracking-plan.md), com nomes `snake_case` e propriedades tipadas para três funis: família, envio de lista e papelaria.
4. Regras obrigatórias (valem para qualquer implementação):
   - **Sem PII nos eventos.** Nada de nome, e-mail, telefone, CPF, endereço, apelido ou série de estudante, nome de responsável, texto livre, conteúdo de lista enviada, número de pedido completo ou IP. Escola, série e cidade entram só como identificadores públicos (INEP, slug de série, código IBGE). Propriedades validadas por esquema (Zod) antes do envio; propriedade fora do esquema é descartada.
   - **Session replay com máscara de todos os inputs** (`maskAllInputs`) e de qualquer texto marcado como sensível; replay desligado por padrão nas áreas `/conta/**`, `/escola/**`, `/papelaria/**`, `/admin/**` e `/b2b/**`.
   - **Cookieless até o consentimento:** antes do aceite, `persistence: 'memory'`, sem cookie nem `localStorage`, sem replay; depois do aceite (consentimento versionado da S17), persistência normal. Revogar o consentimento chama `opt_out_capturing` e `reset`.
   - **Projetos separados:** um projeto PostHog para staging/preview e outro para produção; chaves só por variável de ambiente (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, e `POSTHOG_PERSONAL_API_KEY` só no servidor, se for usada), nunca no código.
   - **Flag `is_internal`** em todo evento de conta da equipe, domínio de teste (`@listacerta.test`, `.invalid`), E2E (`source_group='e2e-teste'`) e ambiente não produtivo; os funis de produção filtram `is_internal = false`.
   - **Proxy `/ingest`** via `rewrites` do Next (`/ingest/:path*` → host do PostHog), para não depender de domínio de terceiro bloqueável e não expor o host no cliente; o proxy não repassa cookie de sessão do app.
   - **`identify` só no login ou no envio com telefone**, sempre com o **id interno do perfil (uuid)** como `distinct_id`. O telefone e o e-mail **nunca** vão para o PostHog (nem como propriedade de pessoa); o gatilho do `identify` é o evento, o identificador é o uuid.
   - Nada de menor: nenhum evento carrega dado de estudante (S15), nem mesmo o apelido.
5. **Encaixe proposto: S19 · Segurança e observabilidade.** A S19 já trata de observabilidade sem dado pessoal (Sentry com escopo por perfil) e de CSP; instrumentação de produto cabe no mesmo lugar, e a CSP precisa conhecer o `/ingest`. Texto proposto para acrescentar ao prompt da S19, se este ADR for aprovado:
   > Instrumentação de produto com PostHog conforme ADR-007 e `docs/tracking-plan.md`: SDK no cliente com proxy `/ingest` (rewrites do Next), cookieless até o consentimento, replay com inputs mascarados e desligado nas áreas logadas sensíveis, `identify` por uuid no login e no envio com telefone, `is_internal`, projetos separados para staging e produção, eventos de servidor para os fatos que nascem no banco (`ocr_completed`, `list_auto_approved`, `list_published`, `lead_received`, `lead_converted`). Aceite: teste que falha se algum evento sair com propriedade fora do esquema ou com PII; E2E confirmando que nada é enviado antes do consentimento.

   Consequência para a S28: os funis e métricas de ganho do `docs/MELHORIAS.md` passam a poder usar o PostHog, se a S19 com este ADR estiver mesclada antes.

## Alternativas rejeitadas

- **Tabela própria de eventos no Supabase.** Daria controle total e dado no mesmo banco, mas exige construir funis, retenção, coortes, replay e painéis do zero, e colocaria tráfego de alta frequência (cliques, visualizações) no mesmo Postgres que atende o produto e o RLS. O custo de construir e manter supera o benefício no piloto; a fonte de verdade de negócio já está no banco.
- **Google Analytics 4.** Modelo centrado em sessão e marketing, amostragem e limites de cardinalidade, sem session replay nem funis de produto no mesmo nível, e com histórico de exigir banner de cookies desde o primeiro acesso; o controle sobre PII e sobre o envio antes do consentimento é menor que o do PostHog com proxy próprio e modo em memória.

## Custo

- **Dinheiro:** PostHog Cloud tem camada gratuita; o volume do piloto deve caber nela, mas o plano pago é gasto e **só o humano contrata** (CLAUDE.md, exceção de gasto). A implementação deve funcionar desligada (sem chave, nenhum envio) até lá.
- **Credenciais:** criar as duas contas/projetos PostHog e cadastrar as chaves na Vercel é ação do humano.
- **Privacidade:** mais um operador de dados pessoais indiretos (identificador de perfil, comportamento de navegação); entra na página de privacidade (S17) como placeholder a validar juridicamente, sem afirmar conformidade.
- **Desempenho:** SDK no cliente pesa no celular em 4G; carregar de forma adiada e só nas páginas que medem funil, e medir o impacto no Lighthouse da S28.
- **Se estiver errada:** trocar de ferramenta custa reinstrumentar o cliente; o plano de eventos e as regras continuam valendo porque não dependem do fornecedor.
