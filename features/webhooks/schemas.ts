import { z } from "zod";

import { WEBHOOK_EVENTS } from "./events";

// Zod nas fronteiras do domínio de webhooks (S25): Server Actions e serviço.

export const SaveEndpointInputSchema = z
  .object({
    url: z.url({ protocol: /^https?$/, hostname: z.regexes.domain }).max(500),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
  })
  .strict();
export type SaveEndpointInput = z.infer<typeof SaveEndpointInputSchema>;

export const EndpointIdInputSchema = z.object({ endpointId: z.uuid() }).strict();
export const ResendInputSchema = z.object({ deliveryId: z.uuid() }).strict();
