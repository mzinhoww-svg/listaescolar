import { afterEach, describe, expect, it, vi } from "vitest";
import { kickDispatch } from "@/features/notifications/kick";
import { KickLeadNotifier } from "@/features/leads/notifier";

afterEach(() => vi.unstubAllGlobals());

describe("kickDispatch", () => {
  it("sem segredo ou origem: não faz nada; com os dois: um POST com Bearer; erro de rede nunca lança", async () => {
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    await kickDispatch({});
    await kickDispatch({ NOTIFICATIONS_DISPATCH_SECRET: "curto", NEXT_PUBLIC_SITE_URL: "https://x.example" });
    expect(f).not.toHaveBeenCalled();
    await kickDispatch({ NOTIFICATIONS_DISPATCH_SECRET: "segredo-de-teste-16+", NEXT_PUBLIC_SITE_URL: "https://x.example/" });
    expect(f).toHaveBeenCalledWith("https://x.example/api/notifications/dispatch", expect.objectContaining({ method: "POST", headers: { authorization: "Bearer segredo-de-teste-16+" } }));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rede"); }));
    await expect(kickDispatch({ NOTIFICATIONS_DISPATCH_SECRET: "segredo-de-teste-16+", NEXT_PUBLIC_SITE_URL: "https://x.example" })).resolves.toBeUndefined();
  });
  it("KickLeadNotifier só pede o despacho (não carrega dado do lead)", async () => {
    await expect(new KickLeadNotifier().notifyNewLead({ stationeryId: "s", leadId: "l", code: "LC-5TJ1" })).resolves.toBeUndefined();
  });
});
