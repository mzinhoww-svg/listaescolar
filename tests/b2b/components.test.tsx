import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ComingSoonBadge } from "@/components/b2b/ComingSoonBadge";
import { EndpointDoc } from "@/components/b2b/EndpointDoc";
import { KeyMask } from "@/components/b2b/KeyMask";
import { KpiCard } from "@/components/b2b/KpiCard";
import { ScopeChips } from "@/components/b2b/ScopeChips";
import { SchemaTable, type ObjectJsonSchema } from "@/components/b2b/SchemaTable";
import { KeyStatusBadge, PartnerStatusBadge } from "@/components/b2b/StatusBadge";
import { UsageChart } from "@/components/b2b/UsageChart";
import { ENDPOINTS } from "@/features/b2b/api/endpoints";

describe("ComingSoonBadge", () => {
  it("mostra Em breve", () => {
    render(<ComingSoonBadge />);
    expect(screen.getByText("Em breve")).toBeInTheDocument();
  });
});

describe("KeyMask", () => {
  it("nunca mostra o segredo, só ambiente e last4", () => {
    render(<KeyMask environment="live" last4="7f2a" />);
    expect(screen.getByText((t) => t.includes("lc_live_") && t.includes("7f2a"))).toBeInTheDocument();
  });
});

describe("ScopeChips", () => {
  it("traduz escopos reais e mostra estado vazio", () => {
    render(<ScopeChips scopes={["schools:read", "carts:match"]} />);
    expect(screen.getByText("Escolas (leitura)")).toBeInTheDocument();
    expect(screen.getByText("Casamento de SKUs")).toBeInTheDocument();
    render(<ScopeChips scopes={[]} />);
    expect(screen.getByText("Nenhum escopo.")).toBeInTheDocument();
  });
});

describe("KpiCard", () => {
  it("mostra valor e rótulo", () => {
    render(<KpiCard value="42" label="chamadas de API no mês" />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("chamadas de API no mês")).toBeInTheDocument();
  });
});

describe("UsageChart", () => {
  it("vazio: nenhuma chamada; com dado: sem a mensagem de vazio", () => {
    const { rerender } = render(<UsageChart callsByDay={[{ day: "2026-09-01", count: 0 }]} />);
    expect(screen.getByText("Nenhuma chamada registrada no período.")).toBeInTheDocument();
    rerender(<UsageChart callsByDay={[{ day: "2026-09-01", count: 5 }]} />);
    expect(screen.queryByText("Nenhuma chamada registrada no período.")).not.toBeInTheDocument();
  });
});

describe("StatusBadge (parceiro e chave)", () => {
  it("rótulo por status do parceiro", () => {
    render(<PartnerStatusBadge status="suspended" />);
    expect(screen.getByText("Suspensa")).toBeInTheDocument();
  });
  it("chave revogada, ativa e em carência", () => {
    const { rerender } = render(<KeyStatusBadge status="revoked" expiresAt={null} />);
    expect(screen.getByText("Revogada")).toBeInTheDocument();
    rerender(<KeyStatusBadge status="active" expiresAt={null} />);
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    rerender(<KeyStatusBadge status="active" expiresAt={future} />);
    expect(screen.getByText(/Expira em \d dias?/)).toBeInTheDocument();
  });
});

describe("SchemaTable", () => {
  it("sem esquema não renderiza nada; com propriedades mostra tipo e obrigatoriedade", () => {
    const { container } = render(<SchemaTable schema={undefined} caption="x" />);
    expect(container).toBeEmptyDOMElement();
    const schema: ObjectJsonSchema = { properties: { q: { type: "string", minLength: 2, maxLength: 80 } }, required: ["q"] };
    render(<SchemaTable schema={schema} caption="Parâmetros de consulta" />);
    expect(screen.getByText("q")).toBeInTheDocument();
    expect(screen.getByText("Sim")).toBeInTheDocument();
  });
});

describe("EndpointDoc", () => {
  it("cada endpoint real do contrato documenta método, caminho, escopo e ao menos um exemplo ilustrativo", () => {
    for (const { entry } of ENDPOINTS) {
      const { unmount } = render(<EndpointDoc entry={entry} />);
      expect(screen.getByText(entry.method)).toBeInTheDocument();
      expect(screen.getByText(entry.path)).toBeInTheDocument();
      expect(screen.getByText("Exemplo de resposta (ilustrativo)")).toBeInTheDocument();
      unmount();
    }
  });
});

// UX-128 · exemplo copiável e descrições dos parâmetros
import { CurlSample, curlCommand } from "@/components/b2b/CurlSample";

describe("UX-128 · primeira chamada copiável", () => {
  it("curl usa a chave do ambiente (lc_test_ no sandbox, lc_live_ em produção) e nunca uma chave real", () => {
    expect(curlCommand("test", "https://listacerta.example")).toContain("lc_test_SUA_CHAVE");
    expect(curlCommand("live", "https://listacerta.example")).toContain("lc_live_SUA_CHAVE");
    expect(curlCommand("test", "https://listacerta.example")).toContain("https://listacerta.example/v1/schools?uf=MT&limit=5");
  });

  it("botão 'Copiar exemplo' copia o comando e avisa", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CurlSample environment="test" origin="https://listacerta.example" />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar exemplo" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("lc_test_SUA_CHAVE"));
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
  });

  it("nenhum parâmetro do contrato fica com descrição vazia", () => {
    for (const e of ENDPOINTS) {
      const { container, unmount } = render(<EndpointDoc entry={e.entry} />);
      const cells = [...container.querySelectorAll("tbody td:nth-child(4)")].map((c) => c.textContent);
      expect(cells.filter((t) => t === "—"), e.entry.id).toEqual([]);
      unmount();
    }
  });
});
