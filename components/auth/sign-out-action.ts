"use server";

import { signOut } from "@/features/auth/actions";

export async function signOutAction(): Promise<void> {
  await signOut();
}
