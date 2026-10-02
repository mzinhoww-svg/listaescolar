"use client";

import { useEffect, useRef } from "react";

import type { EventName } from "@/lib/analytics/schema";
import { track, type EventProps } from "@/lib/analytics/track";

/**
 * Registra um evento quando a página é vista (uma vez por combinação nome+propriedades). Não renderiza nada.
 * As propriedades vêm do servidor já reduzidas a identificadores e contagens; o cliente ainda valida pelo esquema.
 */
export function TrackView<N extends EventName>({ name, props }: { name: N; props: EventProps<N> }) {
  const sent = useRef<string | null>(null);
  const key = `${name}:${JSON.stringify(props)}`;
  useEffect(() => {
    if (sent.current === key) return;
    sent.current = key;
    track(name, props);
  }, [key, name, props]);
  return null;
}
