import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Logo } from "@/components/brand/Logo";
import { Wordmark } from "@/components/brand/Wordmark";

const srcOf = (el: HTMLElement) => decodeURIComponent(el.getAttribute("src") ?? "");

it("horizontal aponta para logo-horizontal.svg", () => {
  render(<Logo variant="horizontal" />);
  const img = screen.getByRole("img", { name: "ListaCerta" });
  expect(srcOf(img)).toContain("/brand/logo-horizontal.svg");
});

it("símbolo aponta para simbolo.svg", () => {
  render(<Logo variant="simbolo" />);
  expect(srcOf(screen.getByRole("img", { name: "ListaCerta" }))).toContain("/brand/simbolo.svg");
});

it("horizontal-negativo aponta para o arquivo negativo", () => {
  render(<Logo variant="horizontal-negativo" />);
  expect(srcOf(screen.getByRole("img", { name: "ListaCerta" }))).toContain(
    "/brand/logo-horizontal-negativo.svg",
  );
});

it("Wordmark renderiza lista e certa em caixa baixa", () => {
  render(<Wordmark />);
  expect(screen.getByText("lista")).toBeInTheDocument();
  expect(screen.getByText("certa")).toBeInTheDocument();
});
