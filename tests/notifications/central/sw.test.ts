import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Listener = (e: unknown) => void;
function load() {
  const listeners: Record<string, Listener> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: "https://listacerta.example" },
    addEventListener: (t: string, l: Listener) => { listeners[t] = l; },
    registration: { showNotification: (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); return Promise.resolve(); } },
    clients: { openWindow: (u: string) => { opened.push(u); return Promise.resolve(); }, matchAll: () => Promise.resolve([]) },
  };
  vm.runInNewContext(readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8"), { self, URL, Promise, JSON });
  return { listeners, shown, opened };
}
const pushEvent = (data: unknown) => { const waits: Promise<unknown>[] = []; return { data: { json: () => data }, waitUntil: (p: Promise<unknown>) => waits.push(p), waits }; };

describe("public/sw.js", () => {
  it("push mostra o título genérico recebido e guarda só o caminho relativo; sem corpo com dados", async () => {
    const { listeners, shown } = load();
    const e = pushEvent({ title: "Sua cotação chegou", url: "/cotacao/LC-5TJ1" });
    listeners.push!(e);
    await Promise.all(e.waits);
    expect(shown[0]!.title).toBe("Sua cotação chegou");
    expect(shown[0]!.options).toMatchObject({ data: { url: "/cotacao/LC-5TJ1" } });
    expect(shown[0]!.options.body).toBeUndefined();
  });
  it("payload inválido ou com URL externa: título padrão e URL '/'", async () => {
    const { listeners, shown } = load();
    for (const bad of [null, { title: 5, url: "https://evil.example" }, { title: "x", url: "//evil.example" }]) {
      const e = pushEvent(bad);
      listeners.push!(e);
      await Promise.all(e.waits);
    }
    expect(shown.every((s) => (s.options.data as { url: string }).url === "/")).toBe(true);
    expect(shown[0]!.title).toBe("ListaCerta");
  });
  it("clique abre só caminho relativo do mesmo site; URL externa é ignorada", async () => {
    const { listeners, opened } = load();
    for (const url of ["/enviar-lista/abc", "https://evil.example/x", "//evil.example", "javascript:alert(1)"]) {
      const waits: Promise<unknown>[] = [];
      listeners.notificationclick!({ notification: { data: { url }, close: vi.fn() }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    }
    expect(opened).toEqual(["https://listacerta.example/enviar-lista/abc", ...Array(3).fill("https://listacerta.example/")]); // URL insegura vira a página inicial do próprio site
  });
});
