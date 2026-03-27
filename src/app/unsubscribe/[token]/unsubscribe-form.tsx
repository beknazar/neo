"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type UnsubscribeState = {
  status: "idle" | "success" | "error";
};

export function UnsubscribeForm({
  action,
}: {
  action: () => Promise<{ success: boolean }>;
}) {
  const [state, formAction, isPending] = useActionState<
    UnsubscribeState,
    FormData
  >(
    async () => {
      const result = await action();
      return { status: result.success ? "success" : "error" };
    },
    { status: "idle" }
  );

  if (state.status === "success") {
    return (
      <>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          You've been unsubscribed
        </h1>
        <p className="mt-2 text-muted-foreground">
          You won't receive any more emails from us.
        </p>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          Link expired or invalid
        </h1>
        <p className="mt-2 text-muted-foreground">
          This unsubscribe link may have already been used.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">
        Unsubscribe
      </h1>
      <p className="mt-2 text-muted-foreground">
        Click the button below to unsubscribe from NeoRank emails.
      </p>
      <form action={formAction} className="mt-6">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Unsubscribing..." : "Confirm unsubscribe"}
        </Button>
      </form>
    </>
  );
}
