import app from "./app";
import { logger } from "./lib/logger";
import { ensureDemoApiKey } from "./lib/demoBootstrap";
import { ensureSigningKey } from "./lib/jwt";
import { ensureNullifierSecretLoaded } from "./lib/nullifier";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Fail fast in production if the master HMAC secret is missing; in dev
  // the loader logs a warning and uses a stable insecure fallback.
  try {
    ensureNullifierSecretLoaded();
  } catch (e) {
    logger.error({ err: e }, "Nullifier master secret missing — refusing to serve");
    process.exit(1);
  }
  ensureSigningKey().catch((keyErr) => {
    logger.error({ err: keyErr }, "Failed to ensure JWT signing key");
  });
  ensureDemoApiKey().catch((bootstrapErr) => {
    logger.warn({ err: bootstrapErr }, "Demo API key bootstrap failed");
  });
});
