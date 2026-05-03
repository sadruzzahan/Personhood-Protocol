import app from "./app";
import { logger } from "./lib/logger";
import { ensureDemoApiKey } from "./lib/demoBootstrap";
import { ensureSigningKey } from "./lib/jwt";
import { ensureNullifierSecretLoaded } from "./lib/nullifier";
import { startWebhookPoller } from "./lib/webhookDelivery";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Strict pre-bind fail-fast: refuse to even bind the listener if any
// required key material is missing. This eliminates the brief
// bind-then-exit window where a misconfigured server could accept a
// connection before crashing.
try {
  ensureNullifierSecretLoaded();
  ensureSigningKey();
} catch (e) {
  logger.error({ err: e }, "Required key material missing — refusing to serve");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  ensureDemoApiKey().catch((bootstrapErr) => {
    logger.warn({ err: bootstrapErr }, "Demo API key bootstrap failed");
  });
  // Single-instance assumption — see docs/RUNBOOK.md "Webhook delivery".
  startWebhookPoller();
});
