import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/site/channels", () => ({ getPurchaseChannels: vi.fn() }));

import SchoolError from "@/app/escolas/[inep]/error";
import SearchError from "@/app/escolas/error";
import Home from "@/app/(site)/page";
import { getPurchaseChannels } from "@/features/site/channels";

describe("error.tsx", () => {
  it.each([
    ["busca", SearchError],
    ["perfil", SchoolError],
  ])("%s: retry refaz a consulta (refresh) e chama reset e a mensagem técnica não vaza", (_n, Comp) => {
    const reset = vi.fn();
    const { container } = render(<Comp error={Object.assign(new Error("password authentication failed for user x"), { digest: "d1" })} reset={reset} />);
    refresh.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(container.textContent).not.toMatch(/password|authentication|d1/);
  });
});

describe("home", () => {
  it("busca primeiro, sem contagens inventadas", async () => {
    vi.mocked(getPurchaseChannels).mockResolvedValue(null);
    const { container } = render(await Home());
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(container.querySelector('form[method="get"][action="/escolas"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "Privada" })).toHaveAttribute("href", "/escolas?rede=privada");
    expect(container.textContent).not.toMatch(/\d+ escolas/);
  });
});
