import type { Metadata } from "next";

import { LegalPage } from "@/components/site/LegalPage";
import { pageMetadata } from "@/features/site/copy";
import { TERMS_SECTIONS } from "@/features/site/legal";

export const metadata: Metadata = pageMetadata("termos");

export default function Termos() {
  return <LegalPage title="Termos de uso" sections={TERMS_SECTIONS} />;
}
