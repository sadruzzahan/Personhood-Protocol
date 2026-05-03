import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

process.env.JWT_PRIVATE_KEY_PEM = privateKey;
process.env.JWT_PUBLIC_KEY_PEM = publicKey;
process.env.JWT_KID = "kid_test_" + randomBytes(4).toString("hex");
process.env.NULLIFIER_MASTER_SECRET = randomBytes(32).toString("hex");
process.env.JWT_ISSUER = "https://test.proof-of-personhood.local";
