import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import "./lib/types";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requestIdMiddleware } from "./middlewares/requestId";
import { errorHandler, notFoundHandler } from "./middlewares/errorEnvelope";
import { ApiError } from "./lib/errors";
import { timeoutMiddleware } from "./middlewares/timeout";
import { startIdempotencyCleanup } from "./middlewares/idempotency";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.disable("x-powered-by");
app.set("trust proxy", true);

// Generate / propagate the request id BEFORE any other middleware so every
// log line and error response can include it.
app.use(requestIdMiddleware);

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      requestId: (req as express.Request).requestId,
      projectId: (req as express.Request).apiContext?.project.id,
      orgId: (req as express.Request).apiContext?.org.id,
      endpoint: (req as express.Request).path,
    }),
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// helmet must run early so the security headers cover every response,
// including 4xx/5xx envelopes.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Public API endpoints (e.g. /api/register, /api/verify) are usable from
// third-party origins, but must NOT receive cookies — those endpoints are
// authenticated via API keys, never via cookies. Per-project allowed_origins
// enforcement happens inside the API key middleware (live keys only).
app.use(cors({ credentials: false, origin: true }));

// Strict body size limit. The protocol payloads are tiny; 32 KB leaves a
// generous margin for nested JSON without giving attackers a memory lever.
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

// Server-side request timeout. Returns a typed 408 envelope.
app.use(timeoutMiddleware(10_000));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

app.use(notFoundHandler);

// Translate raw-body 413s and similar known errors into typed ApiErrors
// before the generic envelope handler runs.
app.use(
  (
    err: unknown,
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    if (
      typeof err === "object" &&
      err !== null &&
      "type" in err &&
      (err as { type: string }).type === "entity.too.large"
    ) {
      next(
        new ApiError({
          code: "payload_too_large",
          status: 413,
          message: "Request body exceeds the 32 KB limit.",
        }),
      );
      return;
    }
    next(err);
  },
);

app.use(errorHandler);

// Background sweeper for expired idempotency records. Returns immediately;
// the timer is unref'd so it doesn't keep the process alive on its own.
startIdempotencyCleanup();

export default app;
