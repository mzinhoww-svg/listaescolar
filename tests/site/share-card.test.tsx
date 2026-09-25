import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShareListCard } from "@/components/share/ShareListCard";
import { encodeShortCode } from "@/features/short-links/code";

describe("ShareListCard", () => {
  const code = encodeShortCode({ inep: "51000123", gradeSlug: "ef-1" });
  const setup = () => render(<ShareListCard inep="51000123" gradeSlug="ef-1" origin="https://listacerta.example" />);

  it("mostra título, cópia e o link curto correto", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Compartilhar esta lista" })).toBeTruthy();
    expect(screen.getByText("Para o grupo de pais e o mural da escola.")).toBeTruthy();
    expect(screen.getByText(`https://listacerta.example/l/${code}`)).toBeTruthy();
  });

  it("QR com role img e aria-label com o link", () => {
    setup();
    const qr = screen.getByRole("img");
    expect(qr.getAttribute("aria-label")).toContain(`https://listacerta.example/l/${code}`);
    expect(qr.querySelectorAll("path")).toHaveLength(1);
  });

  it("Baixar QR é um link simples com ?download=1", () => {
    setup();
    const a = screen.getByRole("link", { name: /Baixar QR/ });
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe(`/l/${code}/qr?download=1`);
    expect(a.getAttribute("prefetch")).toBeNull();
  });
});
