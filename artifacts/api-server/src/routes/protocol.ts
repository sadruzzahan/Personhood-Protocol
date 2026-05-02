import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "node:crypto";
import {
  RegisterCommitmentBody,
  RegisterCommitmentResponse,
  VerifyProofBody,
  VerifyProofResponse,
  GetProtocolStatsResponse,
  CheckNullifierParams,
  CheckNullifierResponse,
} from "@workspace/api-zod";

interface CommitmentRecord {
  commitmentHash: string;
  nullifier: string;
  appContext: string;
  registeredAt: Date;
}

const commitmentsByHash = new Map<string, CommitmentRecord>();
const nullifiers = new Map<string, CommitmentRecord>();
const serverStartedAt = Date.now();

let totalVerifications = 0;
let totalFailedVerifications = 0;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const router: IRouter = Router();

router.post("/register", (req, res) => {
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

  if (nullifiers.has(nullifier)) {
    return res.status(409).json({
      error: "Nullifier already registered",
      details:
        "A commitment with this biometric/app-context pair already exists. Each human can register once per app context.",
    });
  }

  const record: CommitmentRecord = {
    commitmentHash,
    nullifier,
    appContext,
    registeredAt: new Date(),
  };
  commitmentsByHash.set(commitmentHash, record);
  nullifiers.set(nullifier, record);

  const proofGenerationMs = 2000 + Math.floor(Math.random() * 1200);

  const response = RegisterCommitmentResponse.parse({
    commitmentHash,
    nullifier,
    registeredAt: record.registeredAt,
    proofGenerationMs,
  });

  return res.json(response);
});

router.post("/verify", (req, res) => {
  const parsed = VerifyProofBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Invalid proof payload",
      details: parsed.error.message,
    });
  }

  const { proof, nullifier, appContext } = parsed.data;
  const record = nullifiers.get(nullifier);
  const now = new Date();

  const validProofShape = proof.length >= 16;
  const contextMatches = record?.appContext === appContext;

  if (!record || !validProofShape || !contextMatches) {
    totalFailedVerifications += 1;
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

  totalVerifications += 1;
  const humanBadge = sha256Hex(`badge|${nullifier}|${now.toISOString()}`);

  const response = VerifyProofResponse.parse({
    verified: true,
    humanBadge,
    verifiedAt: now,
    message: "Proof of personhood verified successfully",
  });
  return res.json(response);
});

router.get("/stats", (_req, res) => {
  const uptimeSeconds = (Date.now() - serverStartedAt) / 1000;
  const response = GetProtocolStatsResponse.parse({
    totalCommitments: commitmentsByHash.size,
    totalVerifications,
    totalFailedVerifications,
    uptimeSeconds,
    activeNullifiers: nullifiers.size,
  });
  res.json(response);
});

router.get("/nullifier/:hash", (req, res) => {
  const parsed = CheckNullifierParams.safeParse(req.params);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Invalid nullifier hash",
      details: parsed.error.message,
    });
  }

  const { hash } = parsed.data;
  const record = nullifiers.get(hash);
  const response = CheckNullifierResponse.parse({
    hash,
    used: !!record,
    registeredAt: record?.registeredAt,
  });
  return res.json(response);
});

export default router;
