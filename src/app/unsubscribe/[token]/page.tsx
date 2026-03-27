import { unsubscribeByToken } from "@/lib/db";
import { NeoLogo } from "@/components/neo-logo";
import Link from "next/link";
import { UnsubscribeForm } from "./unsubscribe-form";

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  async function handleUnsubscribe() {
    "use server";
    const success = await unsubscribeByToken(token);
    return { success };
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <NeoLogo size="xl" />
      <UnsubscribeForm action={handleUnsubscribe} />
      <Link
        href="/"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go home
      </Link>
    </div>
  );
}
