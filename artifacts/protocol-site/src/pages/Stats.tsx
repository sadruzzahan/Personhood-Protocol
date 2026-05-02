import { useEffect, useState, useRef } from "react";
import { useGetProtocolStats, getGetProtocolStatsQueryKey } from "@workspace/api-client-react";

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function useAnimatedNumber(target: number | undefined, duration = 1400) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === undefined) return;
    const from = prev.current;
    const to = target;
    prev.current = to;
    if (from === to) return;
    const start = performance.now();
    function tick(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

function StatCard({
  label,
  value,
  unit,
  note,
  accent,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className={`border p-8 flex flex-col gap-3 ${accent ? 'border-primary bg-primary/5' : 'border-border bg-card'}`} data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">{label}</p>
      <div className="flex items-end gap-2">
        <span className={`text-4xl font-medium tabular-nums tracking-tight ${accent ? 'text-primary' : 'text-foreground'}`}>
          {value}
        </span>
        {unit && <span className="font-mono text-xs text-muted-foreground mb-1">{unit}</span>}
      </div>
      {note && <p className="font-mono text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function Stats() {
  const { data, isLoading, isError, dataUpdatedAt } = useGetProtocolStats({
    query: {
      refetchInterval: 10000,
      queryKey: getGetProtocolStatsQueryKey(),
    },
  });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const commitments = useAnimatedNumber(data?.totalCommitments);
  const verifications = useAnimatedNumber(data?.totalVerifications);
  const failed = useAnimatedNumber(data?.totalFailedVerifications);
  const nullifiers = useAnimatedNumber(data?.activeNullifiers);

  const successRate = data && (data.totalVerifications + data.totalFailedVerifications) > 0
    ? Math.round((data.totalVerifications / (data.totalVerifications + data.totalFailedVerifications)) * 100)
    : null;

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  useEffect(() => {
    if (dataUpdatedAt) setLastRefresh(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="max-w-6xl mx-auto w-full px-4 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            <p className="text-xs font-mono text-primary tracking-widest uppercase mb-2">Network Transparency</p>
            <h1 className="text-4xl font-medium tracking-tight">Protocol Statistics</h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground" data-testid="refresh-indicator">
            <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-primary animate-pulse' : 'bg-primary/50'}`} />
            {lastRefresh ? `Last updated ${lastRefresh.toLocaleTimeString()}` : "Connecting..."}
            <span className="text-border">|</span>
            Auto-refresh every 10s
          </div>
        </div>

        {isError && (
          <div className="border border-destructive bg-destructive/10 p-4 font-mono text-sm text-destructive mb-8" data-testid="stats-error">
            Failed to load protocol statistics. The API server may be unavailable.
          </div>
        )}

        {/* Primary stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 border border-border mb-0">
          <div className="border-b sm:border-b lg:border-b border-r-0 sm:border-r lg:border-r border-border">
            <StatCard
              label="Total Commitments"
              value={isLoading ? "—" : commitments.toLocaleString()}
              note="Unique humans registered"
              accent
            />
          </div>
          <div className="border-b lg:border-b border-r-0 lg:border-r border-border">
            <StatCard
              label="Total Verifications"
              value={isLoading ? "—" : verifications.toLocaleString()}
              note="Successful proof verifications"
            />
          </div>
          <div className="border-b sm:border-b-0 border-r-0 sm:border-r lg:border-r-0 sm:border-b lg:border-b border-border">
            <StatCard
              label="Active Nullifiers"
              value={isLoading ? "—" : nullifiers.toLocaleString()}
              note="Unique app-context registrations"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 border-l border-r border-b border-border">
          <div className="border-b sm:border-b lg:border-b-0 border-r-0 sm:border-r lg:border-r border-border">
            <StatCard
              label="Failed Verifications"
              value={isLoading ? "—" : failed.toLocaleString()}
              note="Invalid or unregistered proofs"
            />
          </div>
          <div className="border-b sm:border-b-0 border-r-0 lg:border-r border-border">
            <StatCard
              label="Verification Success Rate"
              value={isLoading || successRate === null ? "—" : `${successRate}`}
              unit="%"
              note="Of all verification attempts"
            />
          </div>
          <div className="border-r-0">
            <StatCard
              label="Server Uptime"
              value={isLoading ? "—" : formatUptime(data?.uptimeSeconds ?? 0)}
              note="Since last deployment"
            />
          </div>
        </div>

        {/* Raw JSON */}
        {data && (
          <div className="mt-12 border border-border" data-testid="raw-stats">
            <div className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground flex items-center justify-between">
              <span>RAW API RESPONSE — GET /api/stats</span>
              <span className="text-primary/70">live</span>
            </div>
            <pre className="p-6 font-mono text-xs text-muted-foreground overflow-x-auto leading-relaxed bg-card">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}

        {/* Protocol health */}
        <div className="mt-12 border border-border p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" data-testid="protocol-health">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 ${isError ? 'bg-destructive' : 'bg-primary'} ${!isError ? 'animate-pulse' : ''}`} />
            <span className="font-mono text-sm font-medium">
              {isError ? "Protocol Offline" : "Protocol Operational"}
            </span>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            All verification requests processed in real time. No biometric data stored.
          </div>
        </div>
      </div>
    </div>
  );
}
