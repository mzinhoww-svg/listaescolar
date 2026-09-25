/** Tipos públicos: nunca incluem alerts, confidence, source, submission nem autor (ficam só no servidor). */
export type PublicListItem = {
  id: string;
  position: number;
  name: string;
  normalizedName: string;
  category: string | null;
  quantity: number | null;
  unit: string | null;
};

export type PublicVersionStatus = "published" | "superseded";

export type PublicListVersionSummary = {
  id: string;
  versionNumber: number;
  status: PublicVersionStatus;
  publishedAt: string;
  itemCount: number;
};

export type PublicListVersion = PublicListVersionSummary & { items: PublicListItem[] };

export type PublicList = {
  id: string;
  gradeSlug: string;
  schoolYear: number;
  publishedAt: string;
  isDemo: boolean;
  version: PublicListVersion;
};
