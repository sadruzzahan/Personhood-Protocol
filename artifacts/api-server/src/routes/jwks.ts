import { Router, type IRouter } from "express";
import { listPublicJwks } from "../lib/jwt";

const router: IRouter = Router();

// Public, unauthenticated. Cached for 5 minutes by relying parties; we
// also set a short cache header so popular CDNs do the right thing.
async function serveJwks(_req: unknown, res: import("express").Response, next: import("express").NextFunction) {
  try {
    const jwks = await listPublicJwks();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Content-Type", "application/jwk-set+json");
    res.json(jwks);
  } catch (err) {
    next(err);
  }
}

// Standards-compliant location at the issuer root (RFC 8615).
router.get("/.well-known/jwks.json", serveJwks);
// Proxy-friendly alias: the platform's path-based router only forwards
// /api/* to this artifact, so we also expose JWKS under /api so it is
// reachable via the deployed origin without an extra reverse-proxy hop.
router.get("/api/.well-known/jwks.json", serveJwks);
router.get("/api/jwks.json", serveJwks);

export default router;
