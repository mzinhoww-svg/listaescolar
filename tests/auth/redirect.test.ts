import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/features/auth/redirect";

describe("safeNextPath", () => {
  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["javascript:alert(1)"],
    [""],
    ["%2f%2fevil.com"],
    ["/%2f%2fevil.com"],
    ["/%5cevil.com"],
    ["evil.com"],
    ["/\nfoo"],
    ["/.//evil.com"],
    ["/..//evil.com"],
    ["/%2e//evil.com"],
    ["/%2E%2E//evil.com"],
    ["/a/../b"],
    ["/\t/evil.com"],
    ["/%09/evil.com"],
    ["/%2f/evil.com"],
    ["/\r\n/evil.com"],
    ["/%0d%0aSet-Cookie:x=1"],
    [null],
    [undefined],
    [42],
    [["/conta"]],
  ])("rejeita %j", (input) => {
    expect(safeNextPath(input)).toBe("/conta");
  });
  it.each([["/conta"], ["/escola/turmas"], ["/admin/importacoes?x=1"], ["/escolas/123#topo"], ["/admin/importacoes?x=1#a"], ["/"]])("aceita %s", (input) => {
    expect(safeNextPath(input)).toBe(input);
  });
});
