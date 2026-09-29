import { describe, it, expect } from "vitest";
import { countPrimaryPerRegion } from "@/lib/ux-checks";

const doc = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("countPrimaryPerRegion", () => {
  it("acusa duas ações principais no mesmo main", () => {
    const r = countPrimaryPerRegion(doc(`<main><a class="rounded-botao bg-tinta">A</a><button class="rounded-botao bg-tinta">B</button></main>`));
    expect(r.find((x) => x.region === "main")!.count).toBe(2);
  });
  it("aceita uma principal no main e outra num dialog", () => {
    const r = countPrimaryPerRegion(doc(`<main><a class="rounded-botao bg-tinta">A</a><dialog open><button class="rounded-botao bg-tinta">B</button></dialog></main>`));
    expect(r.every((x) => x.count <= 1)).toBe(true);
  });
  it("conta a principal só na região mais interna (form dentro do main)", () => {
    const r = countPrimaryPerRegion(doc(`<main><a class="bg-tinta">A</a><form><button class="bg-tinta">B</button></form></main>`));
    expect(r.find((x) => x.region === "main")!.count).toBe(1);
    expect(r.find((x) => x.region === "form")!.count).toBe(1);
  });
  it("ignora dialog fechado e elementos sem bg-tinta", () => {
    const r = countPrimaryPerRegion(doc(`<main><button class="border-tinta">A</button><dialog><button class="bg-tinta">B</button></dialog></main>`));
    expect(r).toEqual([{ region: "main", count: 0 }]);
  });
  it("numera regiões repetidas e reconhece data-region", () => {
    const r = countPrimaryPerRegion(doc(`<form></form><form></form><div data-region="cta"><a class="bg-tinta">A</a></div>`));
    expect(r.map((x) => x.region)).toEqual(["form", "form[2]", "data-region=cta"]);
  });
});
