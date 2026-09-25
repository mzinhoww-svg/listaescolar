import { describe, expect, it } from "vitest";
import { cleanText } from "@/supabase/functions/_shared/ai/extraction-normalize";

// D-030: só sequências com forma de tag saem; "< 5 anos" e "a > b" são dado da lista e ficam.
describe("cleanText (D-030)", () => {
  it.each([
    ["Idade < 5 anos", "Idade < 5 anos"],
    ["a > b", "a > b"],
    ["5<6", "5<6"],
    ["Cola 2 > 1 unidade", "Cola 2 > 1 unidade"],
    ["< 5 anos", "< 5 anos"],
    ["  Caderno   96  folhas ", "Caderno 96 folhas"],
  ])("preserva %j", (input, expected) => {
    expect(cleanText(input, 300)).toBe(expected);
  });

  it.each([
    ["<b>x</b>", "x"],
    ["<img src=x onerror=1>Caderno", "Caderno"],
    ["Lápis </script> preto", "Lápis preto"],
    ["<!-- c -->Régua", "Régua"],
    ["Caderno <script", "Caderno"],
    ["<br/>", ""],
  ])("remove marcação em %j", (input, expected) => {
    expect(cleanText(input, 300)).toBe(expected);
  });

  it("remove controle/bidi e limita o tamanho", () => {
    expect(cleanText("a\u0000b‮c", 300)).toBe("abc");
    expect(cleanText("x".repeat(400), 300)).toHaveLength(300);
  });
});
