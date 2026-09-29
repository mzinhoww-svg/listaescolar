"use client";

import type { ReactNode } from "react";

import type { EventName } from "@/lib/analytics/schema";
import { track, type EventProps } from "@/lib/analytics/track";

/** Registra um evento no clique de qualquer coisa dentro dele, sem mudar o layout nem o comportamento do link. */
export function TrackClick<N extends EventName>({ name, props, children }: { name: N; props: EventProps<N>; children: ReactNode }) {
  return (
    <span className="contents" onClickCapture={() => track(name, props)}>
      {children}
    </span>
  );
}
