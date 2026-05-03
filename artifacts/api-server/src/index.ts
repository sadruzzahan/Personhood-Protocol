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
  // Fail fast in production if any required key material is missing.
  // In dev both loaders log a warning and use stable/ephemeral fallbacks.
  try {
    ensureNullifierSecretLoaded();
    ensureSigningKey();
  } catch (e) {
    logger.error({ err: e }, "Required key material missing — refusing to serve");
    process.exit(1);
  }
  ensureDemoApiKey().catch((bootstrapErr) => {
    logger.warn({ err: bootstrapErr }, "Demo API key bootstrap failed");
  });
});
