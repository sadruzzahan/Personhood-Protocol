async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/internal/dashboard${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const json = JSON.parse(text) as { error?: string; details?: string };
      detail = json.error ?? json.details ?? text;
    } catch {
      /* ignore */
    }
    throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

export interface ProjectInfo {
  id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  slug: string;
  environment: "test" | "live";
  allowedOrigins: string;
  webhookUrl: string | null;
  createdAt: string;
  activeKeyCount?: number;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface RequestEvent {
  id: string;
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  ipPrefix: string | null;
  requestId: string | null;
  errorCode: string | null;
  createdAt: string;
}

export interface UsageBucket {
  totalRequests: number;
  successRequests: number;
  failureRequests: number;
}

export interface UsageDay {
  day: string;
  total: number;
  success: number;
  failure: number;
}

export interface UsageResponse {
  today: UsageBucket;
  month: UsageBucket;
  last7Days: UsageDay[];
}

export interface ProjectStats24h {
  totalRequests: number;
  successRequests: number;
  failureRequests: number;
  avgDurationMs: number;
}

export const dashboardApi = {
  me: () =>
    request<{
      userId: string;
      activeOrganization: OrgInfo;
      organizations: OrgInfo[];
    }>("/me"),
  listProjects: () => request<{ projects: ProjectInfo[] }>("/projects"),
  createProject: (body: { name: string; environment?: "test" | "live" }) =>
    request<{ project: ProjectInfo }>("/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getProject: (id: string) =>
    request<{
      project: ProjectInfo;
      stats24h: ProjectStats24h;
      activeKeyCount: number;
    }>(`/projects/${id}`),
  updateProject: (
    id: string,
    body: {
      name?: string;
      environment?: "test" | "live";
      allowedOrigins?: string;
      webhookUrl?: string;
    },
  ) =>
    request<{ project: ProjectInfo }>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
  listKeys: (projectId: string) =>
    request<{ keys: ApiKeyInfo[] }>(`/projects/${projectId}/keys`),
  createKey: (projectId: string, body: { name: string }) =>
    request<{
      key: ApiKeyInfo & { fullKey: string };
      notice: string;
    }>(`/projects/${projectId}/keys`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeKey: (projectId: string, keyId: string) =>
    request<{ ok: true }>(`/projects/${projectId}/keys/${keyId}/revoke`, {
      method: "POST",
    }),
  rotateKey: (projectId: string, keyId: string) =>
    request<{
      key: ApiKeyInfo & { fullKey: string };
      notice: string;
    }>(`/projects/${projectId}/keys/${keyId}/rotate`, { method: "POST" }),
  listEvents: (projectId: string, limit = 50) =>
    request<{ events: RequestEvent[] }>(
      `/projects/${projectId}/events?limit=${limit}`,
    ),
  getUsage: (projectId: string) =>
    request<UsageResponse>(`/projects/${projectId}/usage`),
  getWebhook: (projectId: string) =>
    request<{
      webhookUrl: string | null;
      signingSecret: string | null;
      eventTypes: string[];
    }>(`/projects/${projectId}/webhook`),
  rotateWebhookSecret: (projectId: string) =>
    request<{ signingSecret: string; notice: string }>(
      `/projects/${projectId}/webhook/secret/rotate`,
      { method: "POST" },
    ),
  listWebhookDeliveries: (projectId: string, limit = 50) =>
    request<{ deliveries: WebhookDeliveryInfo[] }>(
      `/projects/${projectId}/webhook/deliveries?limit=${limit}`,
    ),
  redeliverWebhook: (projectId: string, deliveryId: string) =>
    request<{ delivery: { id: string } }>(
      `/projects/${projectId}/webhook/deliveries/${deliveryId}/redeliver`,
      { method: "POST" },
    ),
  sendWebhookTest: (projectId: string) =>
    request<{ delivery: { id: string } | null }>(
      `/projects/${projectId}/webhook/test`,
      { method: "POST" },
    ),
};

export interface WebhookDeliveryInfo {
  id: string;
  eventId: string;
  eventType: string;
  status: "pending" | "delivered" | "failed" | "abandoned";
  attemptCount: number;
  nextAttemptAt: string | null;
  lastAttemptedAt: string | null;
  lastResponseStatus: number | null;
  lastResponseTimeMs: number | null;
  lastResponseBodyPreview: string | null;
  lastError: string | null;
  targetUrl: string;
  createdAt: string;
}
