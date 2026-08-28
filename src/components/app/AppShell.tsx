"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, LayoutDashboard, Route, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/path", label: "Roadmap", icon: Route },
  { href: "/mentor", label: "Mentor", icon: MessagesSquare },
];

export function AppShell({
  children,
  learnerName,
  onReset,
}: {
  children: React.ReactNode;
  learnerName?: string | null;
  onReset?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 mr-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Compass className="h-4.5 w-4.5 text-primary" />
            </span>
            <span className="font-semibold tracking-tight">
              PathFinder<span className="text-primary"> AI</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 flex-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
          {learnerName ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">{learnerName}</span>
              {onReset ? (
                <Button variant="ghost" size="sm" onClick={onReset} className="text-xs h-7">
                  Start over
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">{children}</main>
      <footer className="border-t border-border/70 py-4 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>PathFinder AI — evidence-based adaptive learning paths</span>
          <span>
            {typeof window !== "undefined" ? new Date().getFullYear() : ""} · deterministic engine · real course data
          </span>
        </div>
      </footer>
    </div>
  );
}
