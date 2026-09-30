"use client";

import type { RefObject } from "react";

import { formatSize } from "@/components/submissions/clientChecks";
import { CameraIcon } from "@/components/submissions/icons";
import { Button } from "@/components/ui/Button";
import { ACCEPT_ATTR } from "@/features/submissions/copy";

type Props = {
  camera: RefObject<HTMLInputElement | null>;
  gallery: RefObject<HTMLInputElement | null>;
  picked: { name: string; size: number } | null;
  error?: string | undefined;
  onPick: (own: HTMLInputElement | null, other: HTMLInputElement | null) => void;
};

/**
 * Foto ou arquivo da lista (App06). As duas formas são secundárias: a única ação principal da tela é enviar (UX-063).
 * Os campos reais ficam ocultos (`sr-only`) e são acionados pelos botões; o erro do arquivo fica junto deles.
 */
export function FilePicker({ camera, gallery, picked, error, onPick }: Props) {
  const bad = error !== undefined;
  const describedBy = bad ? "file-erro" : undefined;
  return (
    <section aria-label="Foto ou arquivo da lista" className="flex flex-col gap-3">
      <input ref={camera} name="file" type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Tirar foto da lista" aria-invalid={bad} aria-describedby={describedBy} onChange={() => onPick(camera.current, gallery.current)} />
      <input ref={gallery} id="file" name="file" type="file" accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-label="Arquivo da lista" aria-invalid={bad} aria-describedby={describedBy} onChange={() => onPick(gallery.current, camera.current)} />
      <Button variant="outline" size="lg" className="w-full" onClick={() => camera.current?.click()}>
        <CameraIcon size={18} /> Tirar foto
      </Button>
      <Button id="file-choose" variant="outline" className="w-full" onClick={() => gallery.current?.click()}>
        Escolher da galeria ou PDF
      </Button>
      {picked ? (
        <p data-testid="picked" className="text-texto-2 text-center text-[13px] font-bold break-all">
          {picked.name} · {formatSize(picked.size)}
        </p>
      ) : null}
      {bad ? (
        <p id="file-erro" role="alert" className="text-erro-texto text-[13px] font-semibold">
          {error}
        </p>
      ) : null}
    </section>
  );
}
