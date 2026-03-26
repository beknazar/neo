import { unsubscribeByToken } from "@/lib/db";
import { NeoLogo } from "@/components/neo-logo";
import Link from "next/link";

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const success = await unsubscribeByToken(token);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <NeoLogo size="xl" />
      {success ? (
        <>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">
            You've been unsubscribed
          </h1>
          <p className="mt-2 text-muted-foreground">
            You won't receive any more emails from us.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">
            Link expired or invalid
          </h1>
          <p className="mt-2 text-muted-foreground">
            This unsubscribe link may have already been used.
          </p>
        </>
      )}
      <Link
        href="/"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go home
      </Link>
    </div>
  );
}
