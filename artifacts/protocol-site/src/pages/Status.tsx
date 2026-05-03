import { useEffect, useState } from "react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";

function formatAgo(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function Status() {
  const { data, isLoading, isError, dataUpdatedAt, refetch } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 15000,
      refetchOnWindowFocus: true,
    },
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ageSeconds = dataUpdatedAt ? (now - dataUpdatedAt) / 1000 : null;
  const isUp = !!data && !isError;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="max-w-3xl mx-auto w-full px-4 py-16" data-testid="page-status">
        <p className="text-xs font-mono text-primary tracking-widest uppercase mb-2">System Status</p>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">Service health</h1>
        <p className="text-muted-foreground font-mono text-sm mb-12">
          Live indicator polled directly from our API. A full historical status page (with incident
          timeline and component-level breakdowns) is planned via a third-party provider.
        </p>

        <div
          className={`border p-8 mb-8 flex items-center justify-between gap-6 ${
            isUp ? "border-primary bg-primary/5" : isLoading ? "border-border bg-card" : "border-destructive bg-destructive/10"
          }`}
          data-testid="status-indicator"
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                isUp ? "bg-primary animate-pulse" : isLoading ? "bg-muted-foreground" : "bg-destructive"
              }`}
              data-testid="status-dot"
            />
            <div>
              <p className="text-2xl font-medium tracking-tight" data-testid="status-text">
                {isLoading ? "Checking..." : isUp ? "All systems operational" : "Service unavailable"}
              </p>
              <p className="text-xs font-mono text-muted-foreground mt-1">
                {ageSeconds !== null ? `Last checked ${formatAgo(ageSeconds)}` : "—"}
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="border border-border px-4 py-2 font-mono text-xs hover:border-primary/50 hover:text-primary transition-colors"
            data-testid="button-status-refresh"
          >
            Refresh
          </button>
        </div>

        <div className="border border-border bg-card p-6 mb-8" data-testid="status-component-list">
          <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-4">Components</p>
          <div className="flex flex-col gap-3">
            <ComponentRow name="Verification API" up={isUp} loading={isLoading} testId="component-api" />
            <ComponentRow name="Nullifier registry (Postgres)" up={isUp} loading={isLoading} testId="component-db" inferred />
            <ComponentRow name="Liveness vendor (Persona)" up={isUp} loading={isLoading} testId="component-vendor" inferred />
          </div>
          <p className="text-xs text-muted-foreground/70 italic mt-4">
            Per-component health is inferred from the API health check. Real per-component probes
            ship with the production deployment plan.
          </p>
        </div>

        <div className="border border-border bg-card p-6" data-testid="status-roadmap">
          <p className="text-xs font-mono text-primary tracking-widest uppercase mb-2">Coming soon</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Powered by <span className="text-foreground">Statuspage / Better Stack</span> — full status
            page coming soon. It will include incident history, scheduled maintenance windows,
            subscriber notifications, and component-level uptime percentages.
          </p>
        </div>
      </div>
    </div>
  );
}

function ComponentRow({
  name,
  up,
  loading,
  inferred,
  testId,
}: {
  name: string;
  up: boolean;
  loading: boolean;
  inferred?: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border last:border-b-0 pb-3 last:pb-0" data-testid={testId}>
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 ${loading ? "bg-muted-foreground" : up ? "bg-primary" : "bg-destructive"}`}
        />
        <span className="text-sm">{name}</span>
        {inferred && <span className="text-xs font-mono text-muted-foreground/60">(inferred)</span>}
      </div>
      <span className="font-mono text-xs text-muted-foreground">
        {loading ? "checking" : up ? "operational" : "unavailable"}
      </span>
    </div>
  );
}
