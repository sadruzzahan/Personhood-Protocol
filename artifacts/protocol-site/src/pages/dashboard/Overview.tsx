import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/dashboardApi";
import { DashboardLayout } from "./DashboardLayout";

export function DashboardOverview() {
  return (
    <DashboardLayout>
      <OverviewContent />
    </DashboardLayout>
  );
}

function OverviewContent() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["dashboard", "me"], queryFn: dashboardApi.me });
  const projectsQuery = useQuery({
    queryKey: ["dashboard", "projects"],
    queryFn: dashboardApi.listProjects,
  });

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      dashboardApi.createProject({ name, environment: "test" }),
    onSuccess: () => {
      setNewName("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["dashboard", "projects"] });
    },
  });

  const projects = projectsQuery.data?.projects ?? [];
  const org = meQuery.data?.activeOrganization;

  return (
    <div className="container mx-auto px-4 max-w-6xl py-12" data-testid="page-dashboard-overview">
      <div className="flex items-end justify-between mb-8 gap-6">
        <div>
          <p className="text-xs font-mono text-primary tracking-widest uppercase mb-2">
            {org ? org.name : "Loading…"}
          </p>
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight">Projects</h1>
          <p className="text-muted-foreground font-mono text-sm mt-2">
            A project groups API keys and traffic. Create one per environment or app.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="hidden md:inline-flex items-center text-xs font-mono uppercase tracking-widest border border-primary text-primary px-4 py-2 hover:bg-primary hover:text-primary-foreground transition-colors"
          data-testid="button-new-project-toggle"
        >
          {creating ? "Cancel" : "+ New Project"}
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            createMutation.mutate(newName.trim());
          }}
          className="border border-border bg-card p-4 mb-8 flex gap-3 items-center"
          data-testid="form-new-project"
        >
          <input
            type="text"
            placeholder="Project name (e.g. Acme Web App)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
            data-testid="input-new-project-name"
            autoFocus
          />
          <button
            type="submit"
            disabled={!newName.trim() || createMutation.isPending}
            className="text-xs font-mono uppercase tracking-widest bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50 hover:bg-primary/90 transition-colors"
            data-testid="button-submit-new-project"
          >
            {createMutation.isPending ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      {createMutation.isError && (
        <div className="border border-destructive/40 bg-destructive/10 text-destructive p-3 mb-6 text-xs font-mono" data-testid="error-create-project">
          {(createMutation.error as Error).message}
        </div>
      )}

      {projectsQuery.isLoading ? (
        <div className="text-muted-foreground font-mono text-sm" data-testid="text-loading-projects">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center" data-testid="empty-projects">
          <p className="text-muted-foreground font-mono text-sm mb-4">
            No projects yet. Create your first project to get an API key.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-xs font-mono uppercase tracking-widest border border-primary text-primary px-4 py-2 hover:bg-primary hover:text-primary-foreground transition-colors"
            data-testid="button-empty-create-project"
          >
            + Create Project
          </button>
        </div>
      ) : (
        <div className="grid gap-3" data-testid="list-projects">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="border border-border bg-card p-4 flex items-center justify-between hover:border-primary/60 transition-colors"
              data-testid={`card-project-${p.id}`}
            >
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-medium">{p.name}</h3>
                  <span className="text-[10px] font-mono uppercase tracking-widest border border-border px-2 py-0.5 text-muted-foreground">
                    {p.environment}
                  </span>
                </div>
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  {p.activeKeyCount ?? 0} active key{(p.activeKeyCount ?? 0) === 1 ? "" : "s"} · created {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className="text-xs font-mono text-muted-foreground">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
