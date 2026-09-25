import type { Metadata } from "next";
import Link from "next/link";

import { ChannelsStrip } from "@/components/site/ChannelsStrip";
import { Faq } from "@/components/site/Faq";
import { FeatureGrid } from "@/components/site/FeatureGrid";
import { Hero } from "@/components/site/Hero";
import { Section } from "@/components/site/Section";
import { StepsSection } from "@/components/site/StepsSection";
import { SITE_COPY, pageMetadata } from "@/features/site/copy";
import { getPurchaseChannels } from "@/features/site/channels";

export const metadata: Metadata = pageMetadata("home");
export const revalidate = 3600;

/** Landing (design Landing, 1440 → 390). Sem número, parceria ou prazo sem fonte. */
export default async function Landing() {
  const channels = await getPurchaseChannels();
  const { parents, schools, steps, faq } = SITE_COPY;
  return (
    <main id="conteudo" className="flex-1">
      <Hero />
      <Section id={parents.id} eyebrow={parents.eyebrow} title={parents.title} tone="white">
        <FeatureGrid items={parents.items} />
      </Section>
      <Section id={schools.id} eyebrow={schools.eyebrow} title={schools.title} tone="tinta">
        <FeatureGrid items={schools.items} dark />
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/escolas"
            className="bg-verde-certo text-tinta rounded-botao focus-visible:outline-papel flex min-h-12 w-fit items-center px-6 text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {schools.cta}
          </Link>
          <p className="text-papel/85 text-sm font-semibold">{schools.ctaNote}</p>
        </div>
      </Section>
      <Section id={steps.id} eyebrow={steps.eyebrow} title={steps.title}>
        <StepsSection items={steps.items} />
        <ChannelsStrip channels={channels} />
      </Section>
      <Section id={faq.id} eyebrow={faq.eyebrow} title={faq.title} tone="white">
        <Faq items={faq.items} />
      </Section>
    </main>
  );
}
