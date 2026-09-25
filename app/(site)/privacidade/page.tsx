import type { Metadata } from "next";

import { LegalPage } from "@/components/site/LegalPage";
import { pageMetadata } from "@/features/site/copy";
import { PRIVACY_SECTIONS } from "@/features/site/legal";

export const metadata: Metadata = pageMetadata("privacidade");

export default function Privacidade() {
  return <LegalPage title="Privacidade" sections={PRIVACY_SECTIONS} />;
}
