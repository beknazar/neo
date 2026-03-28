"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { NeoLogo } from "@/components/neo-logo";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Megaphone,
  BarChart3,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin/prospects", label: "Prospects", icon: Building2 },
  { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <NeoLogo size="xl" />
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={active ? "bg-muted text-foreground" : ""}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              </Link>
            );
          })}
          <div className="mx-1 h-5 w-px bg-border" />
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <LayoutDashboard className="size-3.5" />
              Dashboard
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
            }}
            className="text-muted-foreground"
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
