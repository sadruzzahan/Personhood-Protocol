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

      {tab === "overview" && <OverviewTab data={data} />}
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

function OverviewTab({ data }: { data: ProjectDetailData }) {
  const s = data.stats24h;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="overview-tab">
      <StatBox label="Active keys" value={data.activeKeyCount} testId="stat-active-keys" />
      <StatBox label="Requests · 24h" value={s.totalRequests} testId="stat-total-requests" />
      <StatBox label="Successful" value={s.successRequests} testId="stat-success-requests" />
      <StatBox label="Failed" value={s.failureRequests} testId="stat-failure-requests" />
      <StatBox label="Avg latency" value={`${s.avgDurationMs}ms`} testId="stat-avg-latency" />
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
  const [revealed, setRevealed] = useState<{ id: string; fullKey: string; name: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: (name: string) => dashboardApi.createKey(projectId, { name }),
    onSuccess: (res) => {
      setRevealed({ id: res.key.id, fullKey: res.key.fullKey, name: res.key.name });
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["dashboard", "keys", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "projects"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => dashboardApi.revokeKey(projectId, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "keys", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "projects"] });
    },
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
            Save this key — it will not be shown again
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
    queryFn: () => dashboardApi.listEvents(projectId, 100),
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
          API keys, requests will appear here.
        </p>
      </div>
    );
  }
  return (
    <table className="w-full text-sm font-mono border border-border" data-testid="table-events">
      <thead className="bg-card">
        <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
          <th className="px-3 py-2">Time</th>
          <th className="px-3 py-2">Method</th>
          <th className="px-3 py-2">Path</th>
          <th className="px-3 py-2">Status</th>
          <th className="px-3 py-2">Latency</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="border-t border-border" data-testid={`row-event-${e.id}`}>
            <td className="px-3 py-2 text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</td>
            <td className="px-3 py-2">{e.method}</td>
            <td className="px-3 py-2 break-all">{e.path}</td>
            <td className={`px-3 py-2 ${e.statusCode >= 400 ? "text-destructive" : "text-primary"}`}>
              {e.statusCode}
            </td>
            <td className="px-3 py-2 text-muted-foreground">{e.durationMs}ms</td>
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
  const [initialized, setInitialized] = useState(false);

  if (projectQuery.data && !initialized) {
    setName(projectQuery.data.project.name);
    setEnv(projectQuery.data.project.environment);
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: (body: { name?: string; environment?: "test" | "live" }) =>
      dashboardApi.updateProject(projectId, body),
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
          updateMutation.mutate({ name: name.trim(), environment: env });
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
        <div className="flex items-center justify-end gap-3">
          {updateMutation.isSuccess && (
            <span className="text-xs font-mono text-primary" data-testid="text-save-success">Saved.</span>
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
