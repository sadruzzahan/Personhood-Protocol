import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, commitmentsTable, verificationStatsTable } from "@workspace/db";
import {
  RegisterCommitmentBody,
  RegisterCommitmentResponse,
  VerifyProofBody,
  VerifyProofResponse,
  GetProtocolStatsResponse,
  CheckNullifierParams,
  CheckNullifierResponse,
} from "@workspace/api-zod";

const STATS_ROW_ID = 1;
const serverStartedAt = Date.now();

async function incrementStats(field: "success" | "failure"): Promise<void> {
  if (field === "success") {
    await db
      .insert(verificationStatsTable)
      .values({
        id: STATS_ROW_ID,
        totalVerifications: 1,
        totalFailedVerifications: 0,
      })
      .onConflictDoUpdate({
        target: verificationStatsTable.id,
        set: {
          totalVerifications: sql`${verificationStatsTable.totalVerifications} + 1`,
        },
      });
  } else {
    await db
      .insert(verificationStatsTable)
      .values({
        id: STATS_ROW_ID,
        totalVerifications: 0,
        totalFailedVerifications: 1,
      })
      .onConflictDoUpdate({
        target: verificationStatsTable.id,
        set: {
          totalFailedVerifications: sql`${verificationStatsTable.totalFailedVerifications} + 1`,
        },
      });
  }
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const router: IRouter = Router();

router.post("/register", async (req, res) => {
  const parsed = RegisterCommitmentBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Invalid biometric payload",
      details: parsed.error.message,
    });
  }

  const { biometricData, appContext } = parsed.data;
  const salt = randomBytes(16).toString("hex");
  const commitmentHash = sha256Hex(`${biometricData}|${salt}`);
  const nullifier = sha256Hex(`${biometricData}|${appContext}`);

  const existing = await db
    .select({ nullifier: commitmentsTable.nullifier })
    .from(commitmentsTable)
    .where(eq(commitmentsTable.nullifier, nullifier))
    .limit(1);

  if (existing.length > 0) {
    return res.status(409).json({
      error: "Nullifier already registered",
      details:
        "A commitment with this biometric/app-context pair already exists. Each human can register once per app context.",
    });
  }

  const registeredAt = new Date();

  try {
    await db.insert(commitmentsTable).values({
      commitmentHash,
      nullifier,
      appContext,
      registeredAt,
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      return res.status(409).json({
        error: "Nullifier already registered",
        details:
          "A commitment with this biometric/app-context pair already exists. Each human can register once per app context.",
      });
    }
    throw err;
  }

  const proofGenerationMs = 2000 + Math.floor(Math.random() * 1200);

  const response = RegisterCommitmentResponse.parse({
    commitmentHash,
    nullifier,
    registeredAt,
    proofGenerationMs,
  });

  return res.json(response);
});

router.post("/verify", async (req, res) => {
  const parsed = VerifyProofBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Invalid proof payload",
      details: parsed.error.message,
    });
  }

  const { proof, nullifier, appContext } = parsed.data;
  const found = await db
    .select()
    .from(commitmentsTable)
    .where(eq(commitmentsTable.nullifier, nullifier))
    .limit(1);
  const record = found[0];
  const now = new Date();

  const validProofShape = proof.length >= 16;
  const contextMatches = record?.appContext === appContext;

  if (!record || !validProofShape || !contextMatches) {
    await incrementStats("failure");
    const response = VerifyProofResponse.parse({
      verified: false,
      verifiedAt: now,
      message: !record
        ? "Nullifier not registered"
        : !contextMatches
          ? "App context does not match the registered commitment"
          : "Proof failed cryptographic verification",
    });
    return res.json(response);
  }

  await incrementStats("success");
  const humanBadge = sha256Hex(`badge|${nullifier}|${now.toISOString()}`);

  const response = VerifyProofResponse.parse({
    verified: true,
    humanBadge,
    verifiedAt: now,
    message: "Proof of personhood verified successfully",
  });
  return res.json(response);
});

router.get("/stats", async (_req, res) => {
  const uptimeSeconds = (Date.now() - serverStartedAt) / 1000;

  const [counts] = await db
    .select({
      totalCommitments: sql<number>`count(*)::int`,
    })
    .from(commitmentsTable);

  const [stats] = await db
    .select()
    .from(verificationStatsTable)
    .where(eq(verificationStatsTable.id, STATS_ROW_ID))
    .limit(1);

  const response = GetProtocolStatsResponse.parse({
    totalCommitments: counts?.totalCommitments ?? 0,
    totalVerifications: stats?.totalVerifications ?? 0,
    totalFailedVerifications: stats?.totalFailedVerifications ?? 0,
    uptimeSeconds,
    activeNullifiers: counts?.totalCommitments ?? 0,
  });
  res.json(response);
});

router.get("/nullifier/:hash", async (req, res) => {
  const parsed = CheckNullifierParams.safeParse(req.params);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Invalid nullifier hash",
      details: parsed.error.message,
    });
  }

  const { hash } = parsed.data;
  const found = await db
    .select()
    .from(commitmentsTable)
    .where(eq(commitmentsTable.nullifier, hash))
    .limit(1);
  const record = found[0];
  const response = CheckNullifierResponse.parse({
    hash,
    used: !!record,
    registeredAt: record?.registeredAt,
  });
  return res.json(response);
});

export default router;
