// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OfflineNotice } from "@/components/ui/OfflineNotice";

const setOnline = (v: boolean) => Object.defineProperty(window.navigator, "onLine", { configurable: true, value: v });
afterEach(() => setOnline(true));

describe("UX-006 · aviso Sem conexão", () => {
  it("online: nada aparece", () => {
    render(<OfflineNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("evento offline mostra o aviso em role=status; online troca para 'Conexão de volta' e depois some", () => {
    render(<OfflineNotice backMs={50} />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toMatch(/Sem conexão/);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByRole("status").textContent).toMatch(/Conexão de volta/);
  });
  it("já nasce offline quando o navegador está offline", () => {
    setOnline(false);
    render(<OfflineNotice />);
    expect(screen.getByRole("status").textContent).toMatch(/Sem conexão/);
  });
  it("some depois de voltar (temporizador)", async () => {
    render(<OfflineNotice backMs={20} />);
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("animação só com movimento permitido e pelos tokens", () => {
    setOnline(false);
    const { container } = render(<OfflineNotice />);
    const html = container.innerHTML;
    expect(html).toContain("motion-safe:");
    expect(html).toContain("duration-mov-base");
  });
});
