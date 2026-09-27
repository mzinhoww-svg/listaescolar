import "server-only";

import { z } from "zod";

import { SchoolResponseSchema } from "@/features/b2b/api/endpoints/schools";
import { ListResponseSchema } from "@/features/b2b/api/endpoints/school-lists";
import { ItemResponseSchema } from "@/features/b2b/api/endpoints/list-items";
import { createAdminClient } from "@/lib/supabase/admin";

// Leitura pública do widget (S25): reaproveita as MESMAS funções `b2b_v1_*` (S24, já testadas contra vazamento em
// `tests/db/b2b-api-leak.test.ts`) — sem duplicar a lógica de "o que é público". Ambiente sempre `live` (o widget
// é para o usuário final, nunca sandbox); cobertura sempre a do PRÓPRIO parceiro do `partnerId` do `<script>`.
// Sem `partnerId` habilitado (widget ligado e parceiro active/sandbox), tudo devolve `null` (o Route Handler vira
// 404 sem detalhe — nunca revela se o parceiro existe).

const publicConfigSchema = z.object({
  partnerId: z.uuid(),
  tradeName: z.string(),
  accentColor: z.string(),
  cartTargetDomain: z.string(),
  coverageUfs: z.array(z.string()).nullable(),
});
export type WidgetPublicConfig = z.infer<typeof publicConfigSchema>;

export async function getWidgetPublicConfig(partnerId: string): Promise<WidgetPublicConfig | null> {
  const parsedId = z.uuid().safeParse(partnerId);
  if (!parsedId.success) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("b2b_widget_config_public", { p_partner_id: partnerId });
  if (error || !data) return null;
  const parsed = publicConfigSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function searchWidgetSchools(partnerId: string, q: string, limit = 10) {
  const config = await getWidgetPublicConfig(partnerId);
  if (!config) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("b2b_v1_schools", {
    p_environment: "live",
    p_coverage_ufs: config.coverageUfs,
    p_city: null,
    p_uf: null,
    p_q: q,
    p_has_lists: true,
    p_after_name: null,
    p_after_inep: null,
    p_limit: limit,
  });
  if (error) return null;
  return z.array(SchoolResponseSchema).parse(data ?? []);
}

export async function widgetSchoolLists(partnerId: string, inep: string, year?: number) {
  const config = await getWidgetPublicConfig(partnerId);
  if (!config) return null;
  const admin = createAdminClient();
  const { data: school, error: schoolError } = await admin.rpc("b2b_v1_school", { p_environment: "live", p_coverage_ufs: config.coverageUfs, p_inep: inep });
  if (schoolError || !school) return null;
  const { data, error } = await admin.rpc("b2b_v1_school_lists", {
    p_environment: "live",
    p_coverage_ufs: config.coverageUfs,
    p_inep: inep,
    p_year: year ?? null,
    p_after_year: null,
    p_after_sort: null,
    p_after_id: null,
    p_limit: 50,
  });
  if (error) return null;
  return z.array(ListResponseSchema).parse(data ?? []);
}

export async function widgetListItems(partnerId: string, listId: string) {
  const config = await getWidgetPublicConfig(partnerId);
  if (!config) return null;
  const parsedListId = z.uuid().safeParse(listId);
  if (!parsedListId.success) return null;
  const admin = createAdminClient();
  const { data: list, error: listError } = await admin.rpc("b2b_v1_list", { p_environment: "live", p_coverage_ufs: config.coverageUfs, p_list_id: listId });
  if (listError || !list) return null;
  const { data, error } = await admin.rpc("b2b_v1_list_items", { p_environment: "live", p_coverage_ufs: config.coverageUfs, p_list_id: listId, p_after_position: null, p_limit: 500 });
  if (error) return null;
  return z.array(ItemResponseSchema).parse(data ?? []);
}
