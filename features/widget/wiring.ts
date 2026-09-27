import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import * as repo from "./repository";
import { WidgetService, type WidgetRepository } from "./service";

function realRepository(): WidgetRepository {
  const client = createAdminClient();
  return {
    getMyWidgetConfig: (actor) => repo.getMyWidgetConfig(client, actor),
    saveWidgetConfig: (actor, input) => repo.saveWidgetConfig(client, actor, input),
  };
}

export function getWidgetService(): WidgetService {
  return new WidgetService({ repo: realRepository() });
}
