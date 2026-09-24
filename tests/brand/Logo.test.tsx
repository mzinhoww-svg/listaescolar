import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Logo } from "@/components/brand/Logo";
import { Wordmark } from "@/components/brand/Wordmark";

const srcOf = (el: HTMLElement) => decodeURIComponent(el.getAttribute("src") ?? "");

it("horizontal compõe símbolo + wordmark em texto, sem logo-horizontal.svg", () => {
  const { container } = render(<Logo variant="horizontal" />);
  const imgs = screen.getAllByRole("img", { name: "ListaCerta" });
  expect(imgs).toHaveLength(1);
  expect(srcOf(imgs[0]!)).toContain("/brand/simbolo.svg");
  expect(screen.getByText("lista")).toBeInTheDocument();
  expect(screen.getByText("certa")).toBeInTheDocument();
  expect(container.innerHTML).not.toContain("logo-horizontal");
});

it("símbolo aponta para simbolo.svg", () => {
  render(<Logo variant="simbolo" />);
  expect(srcOf(screen.getByRole("img", { name: "ListaCerta" }))).toContain("/brand/simbolo.svg");
});

it("horizontal-negativo usa símbolo negativo e texto Papel", () => {
  const { container } = render(<Logo variant="horizontal-negativo" />);
  expect(srcOf(screen.getByRole("img", { name: "ListaCerta" }))).toContain(
    "/brand/simbolo-negativo.svg",
  );
  expect(screen.getByText("lista")).toBeInTheDocument();
  expect(container.innerHTML).not.toContain("logo-horizontal");
  expect(container.querySelector("[data-wordmark]")?.className).toContain("text-papel");
});

it("Wordmark renderiza lista e certa em caixa baixa", () => {
  render(<Wordmark />);
  expect(screen.getByText("lista")).toBeInTheDocument();
  expect(screen.getByText("certa")).toBeInTheDocument();
});
