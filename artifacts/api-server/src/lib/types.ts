import type { Project, Organization } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      apiContext?: {
        project: Project;
        org: Organization;
        keyId: string;
        keyPrefix: string;
        environment: "test" | "live";
      };
      idempotency?: {
        key: string;
        requestHash: string;
      };
    }
  }
}

export {};
