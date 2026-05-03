/**
 * Example: Next.js (App Router) route that verifies a human-badge JWT
 * before allowing the action to proceed.
 *
 *   POST /api/me/promote-to-human  { badge: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createVerifier, ProofOfPersonError } from "@proofofperson/server";

const verifier = createVerifier({
  jwksUri: process.env.POP_JWKS_URI!,
  audience: process.env.POP_PROJECT_ID!,
  issuer: process.env.POP_ISSUER!,
});

export async function POST(req: NextRequest) {
  const { badge } = (await req.json()) as { badge?: string };
  if (!badge) {
    return NextResponse.json({ error: "missing badge" }, { status: 400 });
  }
  try {
    const claims = await verifier.verifyBadge(badge, {
      appContext: "my-app",
    });
    // Persist `claims.nullifier` against the current user's account.
    return NextResponse.json({ ok: true, nullifier: claims.nullifier });
  } catch (err) {
    if (err instanceof ProofOfPersonError) {
      return NextResponse.json({ error: err.code }, { status: 401 });
    }
    throw err;
  }
}
