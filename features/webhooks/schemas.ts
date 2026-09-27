import { z } from "zod";

import { WEBHOOK_EVENTS } from "./events";

// Zod nas fronteiras do domínio de webhooks (S25): Server Actions e serviço.

// Zod só confere a FORMA (URL http/https plausível, ≤ 500 caracteres); a política de segurança de verdade — só
// HTTPS, exceto loopback com APP_ENV=local — é do banco (CHECK da 0502) e de `lib/net/safe-fetch.ts` (revalidada
// a cada envio). Um `hostname` estrito aqui rejeitaria `http://127.0.0.1` mesmo no ambiente local do E2E.
export const SaveEndpointInputSchema = z
  .object({
    url: z.url({ protocol: /^https?$/ }).max(500),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
  })
  .strict();
export type SaveEndpointInput = z.infer<typeof SaveEndpointInputSchema>;

export const EndpointIdInputSchema = z.object({ endpointId: z.uuid() }).strict();
export const ResendInputSchema = z.object({ deliveryId: z.uuid() }).strict();
