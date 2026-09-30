import { describe, expect, it } from "vitest";

import { attentionItems } from "@/features/admin/attention";
import type { DashboardCounts } from "@/features/admin/dashboard";

const cat = (c: Record<string, number>) => ({ unavailable: false as const, counts: Object.entries(c).map(([state, count]) => ({ state, count })) });
const unavailable = { unavailable: true as const, counts: [] as [] };
const counts = (o: Partial<DashboardCounts>): DashboardCounts => ({ schools: cat({}), lists: cat({}), claims: cat({}), stationeries: cat({}), leads: cat({}), ...o });

describe("attentionItems (UX-110)", () => {
  it("soma o que espera decisão e liga cada fila", () => {
    const items = attentionItems(
      counts({ claims: cat({ submitted: 2, awaiting_verification: 1, approved: 9 }), lists: cat({ human_review: 3 }), stationeries: cat({ under_review: 1 }) }),
      4,
    );
    expect(items).toEqual([
      { key: "claims", label: "Reivindicações para decidir", count: 3, href: "/admin/reivindicacoes" },
      { key: "lists", label: "Listas em revisão", count: 3, href: "/admin/revisao" },
      { key: "stationeries", label: "Papelarias aguardando aprovação", count: 1, href: "/admin/papelarias?aba=pendentes" },
      { key: "disputes", label: "Contestações abertas", count: 4, href: "/admin/contestacoes" },
    ]);
  });
  it("categoria indisponível vira count null (nunca zero inventado)", () => {
    const items = attentionItems(counts({ claims: unavailable }), null);
    expect(items.find((i) => i.key === "claims")?.count).toBeNull();
    expect(items.find((i) => i.key === "disputes")?.count).toBeNull();
  });
});
