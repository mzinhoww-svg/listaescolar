"use client";

import { useSyncExternalStore } from "react";

// "Já comprei" é marcação só local (navegador do usuário); nada é enviado nem inferido.
const EVENT = "lc-bought-change";

export const boughtKey = (cartId: string, slug: string) => `lc-bought:${cartId}:${slug}`;

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeBought(key: string, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Sem armazenamento local: a marcação simplesmente não persiste.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useBought(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
}
