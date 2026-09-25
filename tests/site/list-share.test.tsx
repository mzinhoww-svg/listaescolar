import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSchoolByInep = vi.fn();
const getPublishedList = vi.fn();
vi.mock("@/features/schools/search/repository", () => ({ getSchoolByInep: (...a: unknown[]) => getSchoolByInep(...a) }));
vi.mock("@/features/lists/queries", () => ({
  getPublishedList: (...a: unknown[]) => getPublishedList(...a),
  listVersionHistory: async () => [],
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import ListPage from "@/app/escolas/[inep]/[serie]/page";
import { academicYears } from "@/features/grades/catalog";
import { encodeShortCode } from "@/features/short-links/code";

const year = academicYears(new Date())[1];
const props = { params: Promise.resolve({ inep: "51000123", serie: "ef-5" }), searchParams: Promise.resolve({ ano: String(year) }) };
const published = {
  id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a01",
  isDemo: false,
  version: {
    versionNumber: 1,
    publishedAt: "2027-01-10T15:00:00Z",
    itemCount: 1,
    items: [{ id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a03", position: 1, name: "Lápis preto", normalizedName: "lapis preto", category: null, quantity: 12, unit: "un" }],
  },
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://listacerta.example";
  getSchoolByInep.mockResolvedValue({ id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b", inep: "51000123", name: "Escola X", isDemo: false });
});

describe("cartão Compartilhar na página da lista", () => {
  it("aparece só com versão publicada, com o link curto da série", async () => {
    getPublishedList.mockResolvedValue(published);
    render(await ListPage(props));
    const code = encodeShortCode({ inep: "51000123", gradeSlug: "ef-5" });
    expect(screen.getByText(`https://listacerta.example/l/${code}`)).toBeInTheDocument();
  });

  it("não aparece sem lista publicada", async () => {
    getPublishedList.mockResolvedValue(null);
    render(await ListPage(props));
    expect(screen.queryByText("Compartilhar esta lista")).toBeNull();
  });
});
