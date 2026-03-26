import Link from "next/link";
import { NeoLogo } from "@/components/neo-logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <NeoLogo size="xl" />
      <h1 className="mt-8 text-4xl font-bold tracking-tight">404</h1>
      <p className="mt-2 text-muted-foreground">
        This page could not be found.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go home
      </Link>
    </div>
  );
}
