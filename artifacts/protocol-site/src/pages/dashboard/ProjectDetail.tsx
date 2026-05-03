import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/dashboardApi";
import { DashboardLayout } from "./DashboardLayout";

type Tab = "overview" | "keys" | "events" | "settings";

export function ProjectDetailPage() {
  return (
    <DashboardLayout>
      <ProjectDetailContent />
    </DashboardLayout>
  );
}

function ProjectDetailContent() {
  const [, params] = useRoute<{ id: string }>("/dashboard/projects/:id");
  const projectId = params?.id;
  const [tab, setTab] = useState<Tab>("overview");
  const [, setLocation] = useLocation();

  const projectQuery = useQuery({
    queryKey: ["dashboard", "project", projectId],
    queryFn: () => dashboardApi.getProject(projectId!),
    enabled: !!projectId,
  });

  if (!projectId) return <div className="p-12 font-mono text-sm">Invalid project URL.</div>;
  if (projectQuery.isLoading) {
    return <div className="container mx-auto px-4 max-w-6xl py-12 font-mono text-sm text-muted-foreground" data-testid="text-loading-project">Loading project…</div>;
  }
  if (projectQuery.isError) {
    return (
      <div className="container mx-auto px-4 max-w-6xl py-12" data-testid="error-load-project">
        <div className="border border-destructive/40 bg-destructive/10 text-destructive p-4 font-mono text-sm">
          {(projectQuery.error as Error).message}
        </div>
        <Link href="/dashboard" className="text-xs font-mono text-primary mt-4 inline-block">← Back to projects</Link>
      </div>
    );
  }
  const data = projectQuery.data!;
  const project = data.project;

  return (
    <div className="container mx-auto px-4 max-w-6xl py-12" data-testid="page-project-detail">
      <Link href="/dashboard" className="text-xs font-mono text-muted-foreground hover:text-primary inline-block mb-4" data-testid="link-back-to-projects">
        ← All projects
      </Link>
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight">{project.name}</h1>
            <span className="text-[10px] font-mono uppercase tracking-widest border border-border px-2 py-0.5 text-muted-foreground">
              {project.environment}
            </span>
          </div>
          <p className="text-xs font-mono text-muted-foreground">{project.id}</p>
        </div>
      </div>

      <div className="border-b border-border flex gap-6 mb-8">
        {(["overview", "keys", "events", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`text-xs font-mono uppercase tracking-widest pb-3 border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${t}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab projectId={projectId} data={data} />}
      {tab === "keys" && <KeysTab projectId={projectId} />}
      {tab === "events" && <EventsTab projectId={projectId} />}
      {tab === "settings" && (
        <SettingsTab projectId={projectId} onDeleted={() => setLocation("/dashboard")} />
      )}
    </div>
  );
}

function StatBox({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="border border-border bg-card p-4" data-testid={testId}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-medium font-mono">{value}</p>
    </div>
  );
}

type ProjectDetailData = Awaited<ReturnType<typeof dashboardApi.getProject>>;

function OverviewTab({ projectId, data }: { projectId: string; data: ProjectDetailData }) {
  const usageQuery = useQuery({
    queryKey: ["dashboard", "usage", projectId],
    queryFn: () => dashboardApi.getUsage(projectId),
  });

  return (
    <div data-testid="overview-tab">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatBox label="Active keys" value={data.activeKeyCount} testId="stat-active-keys" />
        <StatBox label="Requests · 24h" value={data.stats24h.totalRequests} testId="stat-total-requests" />
        <StatBox label="Successful · 24h" value={data.stats24h.successRequests} testId="stat-success-requests" />
        <StatBox label="Failed · 24h" value={data.stats24h.failureRequests} testId="stat-failure-requests" />
      </div>

      <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Usage</h2>
      <UsagePanel query={usageQuery} />
    </div>
  );
}

function UsagePanel({
  query,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof dashboardApi.getUsage>>, Error>>;
}) {
  if (query.isLoading) {
    return (
      <div className="border border-border bg-card p-6 font-mono text-sm text-muted-foreground" data-testid="usage-loading">
        Loading usage…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="border border-destructive/40 bg-destructive/10 text-destructive p-4 font-mono text-xs" data-testid="usage-error">
        {(query.error as Error).message}
      </div>
    );
  }
  const u = query.data!;
  const isEmpty = u.month.totalRequests === 0;
  const max = Math.max(...u.last7Days.map((d) => d.total), 1);

  return (
    <div className="border border-border bg-card p-6" data-testid="usage-panel">
      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <UsageBucketBox label="Today" bucket={u.today} testId="usage-today" />
        <UsageBucketBox label="Month to date" bucket={u.month} testId="usage-month" />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
        Last 7 days
      </p>
      {isEmpty ? (
        <div className="border border-dashed border-border p-8 text-center" data-testid="usage-empty">
          <p className="text-muted-foreground font-mono text-sm">
            No requests recorded yet. Once Task #8 wires API key authentication
            into the public endpoints, register/verify traffic for this
            project will appear here.
          </p>
        </div>
      ) : (
        <div className="flex items-end gap-2 h-32" data-testid="usage-chart">
          {u.last7Days.map((d) => {
            const heightPct = (d.total / max) * 100;
            const successPct = d.total > 0 ? (d.success / d.total) * 100 : 0;
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1" data-testid={`usage-bar-${d.day}`}>
                <div
                  className="w-full bg-card border border-border relative flex flex-col-reverse"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                  title={`${d.day}: ${d.total} total, ${d.success} success, ${d.failure} fail`}
                >
                  <div className="bg-primary" style={{ height: `${successPct}%` }} />
                  <div className="bg-destructive flex-1" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {d.day.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsageBucketBox({
  label,
  bucket,
  testId,
}: {
  label: string;
  bucket: { totalRequests: number; successRequests: number; failureRequests: number };
  testId: string;
}) {
  return (
    <div className="border border-border p-4" data-testid={testId}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
      <p className="text-3xl font-medium font-mono mb-1">{bucket.totalRequests}</p>
      <p className="text-xs font-mono text-muted-foreground">
        <span className="text-primary">{bucket.successRequests} ok</span>
        {" · "}
        <span className="text-destructive">{bucket.failureRequests} fail</span>
      </p>
    </div>
  );
}

function KeysTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const keysQuery = useQuery({
    queryKey: ["dashboard", "keys", projectId],
    queryFn: () => dashboardApi.listKeys(projectId),
  });
  const [newName, setNewName] = useState("");
  const [revealed, setRevealed] = useState<{ id: string; fullKey: string; name: string; rotated?: boolean } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", "keys", projectId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "projects"] });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => dashboardApi.createKey(projectId, { name }),
    onSuccess: (res) => {
      setRevealed({ id: res.key.id, fullKey: res.key.fullKey, name: res.key.name });
      setNewName("");
      invalidate();
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (keyId: string) => dashboardApi.rotateKey(projectId, keyId),
    onSuccess: (res) => {
      setRevealed({ id: res.key.id, fullKey: res.key.fullKey, name: res.key.name, rotated: true });
      invalidate();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => dashboardApi.revokeKey(projectId, keyId),
    onSuccess: invalidate,
  });

  return (
    <div data-testid="keys-tab">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          createMutation.mutate(newName.trim());
        }}
        className="border border-border bg-card p-4 mb-6 flex gap-3 items-center"
        data-testid="form-new-key"
      >
        <input
          type="text"
          placeholder="Key name (e.g. Production server)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
          data-testid="input-new-key-name"
        />
        <button
          type="submit"
          disabled={!newName.trim() || createMutation.isPending}
          className="text-xs font-mono uppercase tracking-widest bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50 hover:bg-primary/90 transition-colors"
          data-testid="button-create-key"
        >
          {createMutation.isPending ? "Creating…" : "+ Create Key"}
        </button>
      </form>

      {revealed && (
        <div className="border border-primary bg-primary/10 p-4 mb-6" data-testid="banner-reveal-key">
          <p className="text-xs font-mono uppercase tracking-widest text-primary mb-2">
            {revealed.rotated ? "New key issued — old key revoked" : "Save this key — it will not be shown again"}
          </p>
          <div className="flex items-center gap-3 mb-3">
            <code
              className="flex-1 bg-background border border-border px-3 py-2 text-sm font-mono break-all"
              data-testid="text-revealed-key"
            >
              {revealed.fullKey}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(revealed.fullKey)}
              className="text-xs font-mono uppercase tracking-widest border border-primary text-primary px-3 py-2 hover:bg-primary hover:text-primary-foreground transition-colors"
              data-testid="button-copy-key"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRevealed(null)}
            className="text-xs font-mono text-muted-foreground hover:text-foreground"
            data-testid="button-dismiss-reveal"
          >
            I&apos;ve saved it — dismiss
          </button>
        </div>
      )}

      {keysQuery.isLoading ? (
        <p className="text-sm font-mono text-muted-foreground" data-testid="text-loading-keys">Loading keys…</p>
      ) : (keysQuery.data?.keys.length ?? 0) === 0 ? (
        <div className="border border-dashed border-border p-12 text-center" data-testid="empty-keys">
          <p className="text-muted-foreground font-mono text-sm">
            No API keys yet. Create one above to start sending requests.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm font-mono border border-border" data-testid="table-keys">
          <thead className="bg-card">
            <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keysQuery.data!.keys.map((k) => (
              <tr key={k.id} className="border-t border-border" data-testid={`row-key-${k.id}`}>
                <td className="px-3 py-2">{k.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{k.prefix}…{k.last4}</td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-muted-foreground">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}</td>
                <td className="px-3 py-2">
                  {k.revokedAt ? (
                    <span className="text-destructive">revoked</span>
                  ) : (
                    <span className="text-primary">active</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {!k.revokedAt && (
                    <span className="inline-flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Rotate key "${k.name}"? This issues a new secret and immediately revokes the old one.`)) {
                            rotateMutation.mutate(k.id);
                          }
                        }}
                        className="text-xs text-primary hover:underline"
                        data-testid={`button-rotate-${k.id}`}
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Revoke key "${k.name}"? This cannot be undone.`)) {
                            revokeMutation.mutate(k.id);
                          }
                        }}
                        className="text-xs text-destructive hover:underline"
                        data-testid={`button-revoke-${k.id}`}
                      >
                        Revoke
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EventsTab({ projectId }: { projectId: string }) {
  const eventsQuery = useQuery({
    queryKey: ["dashboard", "events", projectId],
    queryFn: () => dashboardApi.listEvents(projectId, 50),
    refetchInterval: 15000,
  });

  if (eventsQuery.isLoading) {
    return <p className="text-sm font-mono text-muted-foreground" data-testid="text-loading-events">Loading events…</p>;
  }
  const events = eventsQuery.data?.events ?? [];
  if (events.length === 0) {
    return (
      <div className="border border-dashed border-border p-12 text-center" data-testid="empty-events">
        <p className="text-muted-foreground font-mono text-sm">
          No requests recorded yet. Once you start sending traffic with this project&apos;s
          API keys, the last 50 register/verify calls will appear here.
        </p>
      </div>
    );
  }
  return (
    <table className="w-full text-sm font-mono border border-border" data-testid="table-events">
      <thead className="bg-card">
        <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
          <th className="px-3 py-2">Time</th>
          <th className="px-3 py-2">Endpoint</th>
          <th className="px-3 py-2">Status</th>
          <th className="px-3 py-2">Latency</th>
          <th className="px-3 py-2">IP prefix</th>
          <th className="px-3 py-2">Error</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="border-t border-border" data-testid={`row-event-${e.id}`}>
            <td className="px-3 py-2 text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</td>
            <td className="px-3 py-2">{e.endpoint}</td>
            <td className={`px-3 py-2 ${e.statusCode >= 400 ? "text-destructive" : "text-primary"}`}>
              {e.statusCode}
            </td>
            <td className="px-3 py-2 text-muted-foreground">{e.latencyMs}ms</td>
            <td className="px-3 py-2 text-muted-foreground">{e.ipPrefix ?? "—"}</td>
            <td className="px-3 py-2 text-destructive">{e.errorCode ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SettingsTab({ projectId, onDeleted }: { projectId: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const projectQuery = useQuery({
    queryKey: ["dashboard", "project", projectId],
    queryFn: () => dashboardApi.getProject(projectId),
  });
  const [name, setName] = useState("");
  const [env, setEnv] = useState<"test" | "live">("test");
  const [allowedOrigins, setAllowedOrigins] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (projectQuery.data && !initialized) {
    const p = projectQuery.data.project;
    setName(p.name);
    setEnv(p.environment);
    setAllowedOrigins(p.allowedOrigins ?? "");
    setWebhookUrl(p.webhookUrl ?? "");
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: (body: {
      name?: string;
      environment?: "test" | "live";
      allowedOrigins?: string;
      webhookUrl?: string;
    }) => dashboardApi.updateProject(projectId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "projects"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => dashboardApi.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "projects"] });
      onDeleted();
    },
  });

  return (
    <div className="grid gap-6 max-w-xl" data-testid="settings-tab">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateMutation.mutate({
            name: name.trim(),
            environment: env,
            allowedOrigins,
            webhookUrl: webhookUrl.trim(),
          });
        }}
        className="border border-border bg-card p-6 grid gap-4"
        data-testid="form-project-settings"
      >
        <div className="grid gap-2">
          <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Project name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
            data-testid="input-project-name"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Environment</label>
          <select
            value={env}
            onChange={(e) => setEnv(e.target.value as "test" | "live")}
            className="bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
            data-testid="select-project-env"
          >
            <option value="test">test</option>
            <option value="live">live</option>
          </select>
          <p className="text-xs font-mono text-muted-foreground">
            New keys created after switching environments will use the new prefix
            (<code>pk_test_</code> / <code>pk_live_</code>). Existing keys keep their original prefix.
          </p>
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Allowed origins (CORS)
          </label>
          <textarea
            value={allowedOrigins}
            onChange={(e) => setAllowedOrigins(e.target.value)}
            rows={3}
            placeholder="https://app.example.com, https://staging.example.com"
            className="bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
            data-testid="input-allowed-origins"
          />
          <p className="text-xs font-mono text-muted-foreground">
            Comma- or newline-separated. Leave empty for server-to-server only.
            Enforced by the API key middleware (Task #8).
          </p>
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Webhook URL
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/webhooks/pop"
            className="bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
            data-testid="input-webhook-url"
          />
          <p className="text-xs font-mono text-muted-foreground">
            We&apos;ll POST verification events here. Wired in Task #10.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3">
          {updateMutation.isSuccess && (
            <span className="text-xs font-mono text-primary" data-testid="text-save-success">Saved.</span>
          )}
          {updateMutation.isError && (
            <span className="text-xs font-mono text-destructive" data-testid="text-save-error">
              {(updateMutation.error as Error).message}
            </span>
          )}
          <button
            type="submit"
            disabled={!name.trim() || updateMutation.isPending}
            className="text-xs font-mono uppercase tracking-widest bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50 hover:bg-primary/90 transition-colors"
            data-testid="button-save-settings"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <div className="border border-destructive/40 bg-destructive/5 p-6" data-testid="danger-zone">
        <h3 className="text-sm font-medium text-destructive mb-2">Danger zone</h3>
        <p className="text-xs font-mono text-muted-foreground mb-4">
          Deleting this project will revoke all keys and remove all request logs.
        </p>
        <button
          type="button"
          onClick={() => {
            if (confirm("Permanently delete this project and revoke all its keys?")) {
              deleteMutation.mutate();
            }
          }}
          className="text-xs font-mono uppercase tracking-widest border border-destructive text-destructive px-4 py-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          data-testid="button-delete-project"
        >
          Delete project
        </button>
      </div>
    </div>
  );
}
