import { importSPKI, type JWSHeaderParameters } from "jose";
import { eq } from "drizzle-orm";
import { db, jwtKeysTable } from "@workspace/db";

// jose v6 dropped the exported KeyLike type alias; importSPKI returns
// CryptoKey | KeyObject depending on runtime. We just propagate the
// awaited return type.
type ResolvedKey = Awaited<ReturnType<typeof importSPKI>>;

const cache = new Map<string, ResolvedKey>();

/**
 * jose key resolver. Looks up the public key by `kid` from the JWT header.
 * Caches resolved keys in memory so verification doesn't hit Postgres on
 * every request.
 */
export async function resolveKey(header: JWSHeaderParameters): Promise<ResolvedKey> {
  const kid = header.kid;
  if (!kid) {
    throw new Error("JWT missing kid header");
  }
  const cached = cache.get(kid);
  if (cached) return cached;
  const [row] = await db
    .select()
    .from(jwtKeysTable)
    .where(eq(jwtKeysTable.kid, kid))
    .limit(1);
  if (!row) {
    throw new Error(`Unknown signing key: ${kid}`);
  }
  const key = await importSPKI(row.publicPem, row.alg);
  cache.set(kid, key);
  return key;
}
