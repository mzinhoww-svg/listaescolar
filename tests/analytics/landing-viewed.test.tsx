import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@/lib/analytics/track", () => ({ track: (...a: unknown[]) => track(...a) }));

import { LandingViewed } from "@/components/analytics/LandingViewed";
import { buildEvent } from "@/lib/analytics/sanitize";

afterEach(() => {
  track.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("landing_viewed: utm_* (revisão M4)", () => {
  it("envia só utm_source, utm_medium e utm_campaign; utm_content e utm_term nunca saem", () => {
    window.history.replaceState(null, "", "/?utm_source=insta&utm_medium=social&utm_campaign=volta&utm_content=mae-da-ana&utm_term=fulano");
    render(<LandingViewed />);
    expect(track).toHaveBeenCalledTimes(1);
    const props = track.mock.calls[0]![1] as Record<string, unknown>;
    expect(props).toMatchObject({ path: "/", utm_source: "insta", utm_medium: "social", utm_campaign: "volta" });
    expect(props).not.toHaveProperty("utm_content");
    expect(props).not.toHaveProperty("utm_term");
  });

  it("mesmo que alguém passe utm_content/utm_term ao evento, o esquema os descarta", () => {
    const r = buildEvent("landing_viewed", { path: "/", utm_source: "a", utm_content: "x", utm_term: "y" }, { is_internal: true, app_env: "local" });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.properties).not.toHaveProperty("utm_content");
      expect(r.properties).not.toHaveProperty("utm_term");
    }
  });
});
