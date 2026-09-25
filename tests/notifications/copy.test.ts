import { describe, expect, it } from "vitest";
import { EVENT_CATALOG, NOTIFICATION_EVENTS, type NotificationEvent } from "@/features/notifications/catalog";
import { pushPayload, renderNotification } from "@/features/notifications/copy";
import { isSafeLinkPath, notificationParamsSchema } from "@/features/notifications/params";

const FULL = { school_name: "Escola Modelo", grade_label: "4º ano", school_year: 2027, lead_code: "LC-5TJ1", status_code: "approved" };
const PII = [/[\w.+-]+@[\w-]+\.[\w.]+/, /\(?\d{2}\)?\s?9?\d{4}-?\d{4}/, /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/];

describe("catálogo", () => {
  it("os dez eventos do SPEC §6; o catálogo é exaustivo por tipo", () => {
    expect([...NOTIFICATION_EVENTS].sort()).toEqual(["claim_updated", "lead_expired", "lead_quote_sent", "lead_received", "list_published", "publication_orphaned", "submission_failed", "submission_not_published", "submission_published", "submission_ready"]);
    const all: Record<NotificationEvent, unknown> = EVENT_CATALOG; // evento novo sem entrada quebra o typecheck
    expect(Object.keys(all)).toHaveLength(NOTIFICATION_EVENTS.length);
  });
  it("publication_orphaned é só da central (sem canal externo); os demais aceitam push e e-mail", () => {
    expect(EVENT_CATALOG.publication_orphaned.external).toBe(false);
    expect(NOTIFICATION_EVENTS.filter((e) => EVENT_CATALOG[e].external)).toHaveLength(9);
  });
});

describe("renderNotification", () => {
  it.each(NOTIFICATION_EVENTS)("%s: título e corpo em pt-BR, sem e-mail, telefone ou CPF", (event) => {
    const r = renderNotification(event, FULL);
    expect(r.title.length).toBeGreaterThan(3);
    expect(r.body.length).toBeGreaterThan(3);
    for (const re of PII) expect(`${r.title} ${r.body}`).not.toMatch(re);
  });
  it("params com campo extra (nome, e-mail, telefone, CPF) é recusado", () => {
    for (const extra of [{ student_name: "Joana" }, { email: "a@b.co" }, { phone: "65999990000" }, { cpf: "12345678901" }]) {
      expect(() => renderNotification("submission_ready", { ...FULL, ...extra })).toThrow();
      expect(notificationParamsSchema.safeParse({ ...FULL, ...extra }).success).toBe(false);
    }
  });
  it("params ausentes não quebram: o texto degrada sem inventar escola", () => {
    expect(renderNotification("submission_ready", {}).body).not.toMatch(/undefined|null/);
  });
});

describe("pushPayload (tela de bloqueio)", () => {
  it.each(NOTIFICATION_EVENTS)("%s: título genérico e só o caminho do link, sem escola, código ou status", (event) => {
    const p = pushPayload(event, "/cotacao/LC-5TJ1");
    expect(Object.keys(p).sort()).toEqual(["title", "url"]);
    expect(p.title).not.toMatch(/Escola|LC-|approved|4º/);
  });
  it("links só relativos do próprio site", () => {
    for (const ok of ["/enviar-lista/abc", "/escolas/51000001/ef-4?ano=2027"]) expect(isSafeLinkPath(ok)).toBe(true);
    for (const bad of ["https://evil.example/x", "//evil.example", "/a//b", "javascript:alert(1)", "relativo", "/<script>"]) expect(isSafeLinkPath(bad)).toBe(false);
    expect(() => pushPayload("lead_received", "https://evil.example")).toThrow();
  });
});
