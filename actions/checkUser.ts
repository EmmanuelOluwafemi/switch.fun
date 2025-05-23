// app/actions/checkUser.ts
"use server";

import { getSelf } from "@/lib/auth-service";
import { getUserById } from "@/lib/user-service";

export type CheckUserResult = {
  user: { id: string; username?: string } | null;
  needsUsername: boolean;
};

export async function checkOrCreateUser(id: string): Promise<CheckUserResult> {
  try {
    const me = await getUserById(id);

    return {
      user: { id: me.id, username: me.username },
      needsUsername: !me.username,
    };
  } catch (err: any) {
    // If they’re not yet in your DB (first sign‑up), or no auth cookie:
    if (
      err.message === "User not found" ||
      err.message === "No authentication cookie found"
    ) {
      return { user: null, needsUsername: true };
    }
    // Unexpected error → bubble up
    throw err;
  }
}
