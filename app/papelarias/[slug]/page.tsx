import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { PublicProfileView } from "@/components/stationeries/PublicProfileView";
import { getPublicProfile } from "@/features/stationeries/repository";
import { createClient } from "@/lib/supabase/server";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Cliente da sessão (anon/authenticated): a view `stationery_public` e as políticas só expõem papelaria ativa.
const load = cache(async (slug: string) => {
  if (slug.length > 80 || !SLUG.test(slug)) return null;
  return getPublicProfile(await createClient(), slug);
});

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await load(slug);
  return { title: profile ? `${profile.tradeName} · ListaCerta` : "Papelaria", robots: { index: false, follow: false } };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const profile = await load(slug);
  if (!profile) notFound();
  return <PublicProfileView profile={profile} />;
}
