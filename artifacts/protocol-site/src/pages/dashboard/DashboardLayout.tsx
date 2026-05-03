import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Redirect } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
      <Show when="signed-in">
        <DashboardShell>{children}</DashboardShell>
      </Show>
    </>
  );
}

function DashboardShell({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [location] = useLocation();

  const tabs = [
    { href: "/dashboard", label: "Overview", testId: "tab-overview" },
  ];

  return (
    <div className="flex flex-col flex-1">
      <div className="border-b border-border/40 bg-card/40">
        <div className="container mx-auto px-4 max-w-6xl flex items-center justify-between h-12">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="font-mono text-xs uppercase tracking-widest text-primary"
              data-testid="link-dashboard-home"
            >
              Developer Console
            </Link>
            <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
              {user?.primaryEmailAddress?.emailAddress ?? user?.id}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-back-to-site"
            >
              ← Back to site
            </Link>
            <button
              type="button"
              onClick={() =>
                signOut({ redirectUrl: `${basePath}/` || "/" })
              }
              className="text-xs font-mono text-muted-foreground hover:text-destructive transition-colors"
              data-testid="button-sign-out"
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="container mx-auto px-4 max-w-6xl flex items-center gap-4 h-10 -mt-px">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`text-xs font-mono uppercase tracking-widest pb-1 border-b-2 transition-colors ${
                location === t.href
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={t.testId}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
