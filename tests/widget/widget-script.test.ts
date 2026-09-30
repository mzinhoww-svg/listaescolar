import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SRC = readFileSync("public/widget.js", "utf8");
const PID = "11111111-1111-4111-8111-111111111111";

function load() {
  const script = document.createElement("script");
  script.setAttribute("src", "https://listacerta.example/widget.js");
  script.setAttribute("data-partner-id", PID);
  Object.defineProperty(document, "currentScript", { value: script, configurable: true });
  new Function(SRC)();
}

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function root(): ShadowRoot | HTMLElement {
  const m = document.getElementById("listacerta-widget") as HTMLElement;
  return m.shadowRoot ?? m;
}

describe("widget.js (origem externa)", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="listacerta-widget"></div>';
    vi.useRealTimers();
  });
  afterEach(() => vi.unstubAllGlobals());

  function stub(schools: unknown) {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/widget/config")) return json({ data: { accentColor: "#0B6B4A", cartTargetDomain: "loja.example.com" } });
      if (url.includes("/api/widget/schools?")) return schools instanceof Error ? Promise.reject(schools) : json({ data: schools });
      return json({ data: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("traz estilo próprio (não depende de /widget.css) e envia sem credenciais", async () => {
    const f = stub([]);
    load();
    await tick();
    const r = root();
    expect(r.querySelector("style") ?? (r as ShadowRoot).adoptedStyleSheets?.length).toBeTruthy();
    expect(SRC).not.toContain("widget.css");
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ credentials: "omit" });
    expect(r.querySelector("input")).not.toBeNull();
  });

  it("mostra o resultado como botão", async () => {
    stub([{ inep: "1", name: "Escola Alfa" }]);
    load();
    await tick();
    const input = root().querySelector("input") as HTMLInputElement;
    input.value = "alfa";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 350));
    expect(root().textContent).toContain("Escola Alfa");
  });

  it("diz quando a busca não acha escola", async () => {
    stub([]);
    load();
    await tick();
    const input = root().querySelector("input") as HTMLInputElement;
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 350));
    const status = root().querySelector('[role="status"]');
    expect(status?.textContent).toMatch(/nenhuma escola/i);
  });

  it("diz quando a rede falha", async () => {
    stub(new Error("net"));
    load();
    await tick();
    const input = root().querySelector("input") as HTMLInputElement;
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 350));
    expect(root().querySelector('[role="status"]')?.textContent).toMatch(/não foi possível|tente de novo/i);
  });

  it("nunca interpreta dado da API como HTML", async () => {
    stub([{ inep: "1", name: "<img src=x onerror=alert(1)>" }]);
    load();
    await tick();
    const input = root().querySelector("input") as HTMLInputElement;
    input.value = "img";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 350));
    expect(root().querySelector("img")).toBeNull();
    expect(root().textContent).toContain("<img");
  });

  it("recusa cor e domínio malformados vindos da configuração", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ data: { accentColor: "red;}body{display:none", cartTargetDomain: "evil.com/x?" } })));
    load();
    await tick();
    const m = document.getElementById("listacerta-widget") as HTMLElement;
    expect(m.style.getPropertyValue("--listacerta-accent")).not.toContain("display");
  });
});
