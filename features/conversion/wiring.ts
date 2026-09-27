import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { createConversionStore } from "./repository";
import { ConversionService } from "./service";

/** Composição do serviço de conversão/contestação (repositório real sobre o cliente de serviço do processo). */
export function getConversionService(): ConversionService {
  return new ConversionService({ store: createConversionStore(createAdminClient()) });
}
