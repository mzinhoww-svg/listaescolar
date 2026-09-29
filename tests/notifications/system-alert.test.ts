import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) q[m] = () => q;
      q.range = async () => rows();
      return q;
    },
  }),
}));

import { renderNotification } from "@/features/notifications/copy";
import { notificationParamsSchema } from "@/features/notifications/params";
import { listNotifications } from "@/features/notifications/queries";

describe("system_alert (revisão S19, I1)", () => {
  beforeEach(() => rows.mockReset());

  it("params aceitam alert_kind fechado e alert_count numérico; recusam outros valores", () => {
    expect(notificationParamsSchema.safeParse({ alert_kind: "dead_jobs", alert_count: 4 }).success).toBe(true);
    expect(notificationParamsSchema.safeParse({ alert_kind: "ai_error_rate", alert_count: 30 }).success).toBe(true);
    expect(notificationParamsSchema.safeParse({ alert_kind: "outro", alert_count: 1 }).success).toBe(false);
    expect(notificationParamsSchema.safeParse({ alert_kind: "dead_jobs", alert_count: -1 }).success).toBe(false);
  });

  it("renderNotification monta título e corpo por tipo, sem dado pessoal", () => {
    const dead = renderNotification("system_alert", { alert_kind: "dead_jobs", alert_count: 4 });
    expect(dead.title).toMatch(/alerta/i);
    expect(dead.body).toContain("4");
    const ai = renderNotification("system_alert", { alert_kind: "ai_error_rate", alert_count: 30 });
    expect(ai.body).toContain("30");
    expect(ai.body).not.toBe(dead.body);
    expect(renderNotification("system_alert", {}).body).not.toMatch(/undefined|null/);
  });

  it("listNotifications não lança para o admin que tem um alerta", async () => {
    rows.mockReturnValue({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          event_type: "system_alert",
          params: { alert_kind: "dead_jobs", alert_count: 4 },
          link_path: "/admin",
          is_demo: false,
          read_at: null,
          created_at: "2026-09-28T10:00:00Z",
        },
      ],
      count: 1,
      error: null,
    });
    const out = await listNotifications({ userId: "u" } as never, 1);
    expect(out.items[0]?.eventType).toBe("system_alert");
  });
});
