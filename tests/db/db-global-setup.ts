import { ensureTestBillingPlan } from "./billing-fixtures";

// Setup global dos testes de banco (`vitest.db.config.ts`): garante um plano de cobrança ATIVO (S21) antes de
// qualquer teste, em qualquer arquivo. Necessário porque o gatilho `leads_billing_charge` (AFTER INSERT em
// `public.leads`, enable always) roda para toda inserção de lead, inclusive as de `seedLead`/`lead_create` usadas
// por testes de outras fatias (S06/S09/S14) que não sabem nada de cobrança. Sem isso, a ordem alfabética dos
// arquivos decidiria se um plano já existe quando eles rodam (frágil: já causou "sem plano ativo" intermitente).
// Idempotente (`ensureTestBillingPlan` só publica se não houver plano ativo); roda uma vez por arquivo de teste
// (setupFiles do Vitest), o que é barato e nunca sobrescreve um plano que o próprio teste tenha publicado antes.
export default async function setup(): Promise<void> {
  await ensureTestBillingPlan();
}
