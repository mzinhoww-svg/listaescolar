import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { createPayoutStore } from "./repository";
import { PayoutService } from "./service";

/** Composição do serviço de comissão/repasse/inadimplência (repositório real sobre o cliente de serviço do processo). */
export function getPayoutService(): PayoutService {
  return new PayoutService({ store: createPayoutStore(createAdminClient()) });
}
