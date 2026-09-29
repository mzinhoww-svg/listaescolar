import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SchoolCard } from "@/components/schools/SchoolCard";
import type { SchoolListItem } from "@/features/schools/search/types";

const school: SchoolListItem = {
  id: "1",
  inep: "99029001",
  name: `Escola Municipal de Educação Básica ${"Professor Doutor Fulano de Tal ".repeat(2)}Anexo`.slice(0, 90),
  network: "municipal",
  neighborhood: "Bairro com nome bem comprido também",
  municipalityId: "m",
  municipalityName: "Cuiabá",
  verificationStatus: "registered",
  isDemo: true,
  rank: 1,
};

describe("nome longo (Review Focus 4)", () => {
  it("o nome da escola quebra em vez de estourar o cartão", () => {
    expect(school.name).toHaveLength(90);
    const { getByText } = render(<ul><SchoolCard school={school} /></ul>);
    const el = getByText(school.name);
    expect(el.className).toMatch(/break-words|\[overflow-wrap:anywhere\]/);
  });
});
