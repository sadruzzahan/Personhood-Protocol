# Proof of Personhood Protocol
## Cryptographic Human Verification for the AI Age

---

## The Core Insight

The internet was built without a native identity layer. Every website builds its own login. Every platform builds its own verification. Every service asks you to prove, from scratch, that you are who you say you are. This was always a flaw. The internet inherited it from its academic origins where everyone was assumed to be trustworthy, and then never fixed it.

For 30 years, this flaw was tolerable. Fake accounts were annoying. Bots were a nuisance. Spam was a cost of doing business.

This calculus has permanently changed.

When a single developer can generate 10 million convincing AI personas in an afternoon — each with a unique name, writing style, photo, browsing history, and social graph — the internet's assumption of human presence collapses. Not gradually. All at once.

**What does it mean to vote online when you cannot verify the voters are human?**
**What does it mean to review a product when reviews can be infinitely synthesized?**
**What does it mean to have a conversation when the other participant might be a simulation?**

The Proof of Personhood Protocol answers this: a cryptographic, privacy-preserving mechanism that lets any person prove, to any platform, that they are a unique living human — without revealing who they are.

This is not digital ID. It is not your government passport on the internet. It is something more fundamental and more valuable: proof of uniqueness and humanness, completely detached from identity.

---

## Why This Is Not Solved

Several attempts have been made. None have solved it completely.

**SMS verification**: Phone numbers are not unique to humans. Farms of SIM cards exist. Numbers can be recycled. This verifies device ownership, not personhood.

**CAPTCHAs**: Solved by AI in milliseconds. Google's reCAPTCHA is now beaten by commodity models. CAPTCHAs are cryptographically dead.

**Government ID verification**: Works for high-stakes applications (banking, healthcare) but creates a surveillance apparatus. Every platform cannot require a government ID. This kills privacy, excludes the billions without valid IDs, and creates honeypots of personal data.

**Worldcoin (World ID)**: The most serious attempt. Requires iris scanning by a physical hardware device called an Orb. Creates a global biometric database. Ambitious but creates existential privacy concerns, has been banned or investigated in multiple countries, and requires physical infrastructure that will take decades to build globally.

**Social graph verification**: Relies on existing trusted accounts vouching for new ones. Vulnerable to sybil attacks at scale. Does not work for genuinely new users.

**The gap**: A system that is simultaneously biometric-rooted (tied to a real unique human body), privacy-preserving (reveals nothing about identity), decentralized (not controlled by any single company or government), and accessible without specialized hardware.

---

## The Technical Architecture

### Foundational Principle: Biometric Commitment Without Biometric Storage

The core cryptographic insight is this: you can prove you scanned your fingerprint without storing the fingerprint, by committing to a cryptographic hash of the biometric and storing only the hash on-chain.

More precisely, the system uses a technique from zero-knowledge cryptography called a **commitment scheme with nullifiers**.

When you register:
1. You scan a biometric (fingerprint, face geometry, iris — the choice affects security/accessibility tradeoffs)
2. Your device locally generates a cryptographic commitment: `C = Hash(biometric, secret_salt)`
3. The commitment `C` is published on-chain — it proves you exist, but reveals nothing about your biometric
4. A nullifier `N = Hash(biometric, app_context)` is derived and checked against existing nullifiers — if it exists, you already registered, preventing duplicate registrations

When you prove personhood to an application:
1. You generate a zero-knowledge proof that you know a biometric that matches a registered commitment, without revealing the biometric or which commitment is yours
2. The application verifies the proof cryptographically
3. The application knows: "this is a unique human who registered with the system" — and nothing else

This is the holy grail: you cannot register twice (the nullifier catches it), you cannot fake it (the biometric is the root of trust), and you cannot be identified (the zero-knowledge proof reveals nothing).

### Hardware Requirements: The Accessibility Problem

The weakest point of existing systems is hardware. If proof of personhood requires a physical device nobody has, adoption dies.

The protocol is designed to support a hardware spectrum:

**Tier 1: Software-only (phone camera)**
Face geometry extracted from a standard smartphone camera. Lowest security — sophisticated deepfakes could theoretically fool it. But: accessible to every smartphone owner on earth. Good enough for most applications.

**Tier 2: Secure enclave (modern smartphone)**
iPhones with Face ID and Android phones with fingerprint sensors already have secure enclaves that can perform biometric operations without the biometric ever leaving the chip. The protocol integrates with existing secure enclave APIs. This covers roughly 3 billion devices already in the world.

**Tier 3: Specialized hardware (Orb-equivalent)**
High-security applications (voting, large financial transactions) require more robust biometric scanning. The protocol defines an open hardware spec that multiple manufacturers can produce competitively, avoiding single-vendor lock-in.

### Zero-Knowledge Proof System

The proof system is built on zkSNARKs (zero-knowledge succinct non-interactive arguments of knowledge), specifically using the Groth16 or PLONK proving system for efficient mobile-device proof generation.

The proving circuit encodes:
- "I know a biometric B and salt S such that Hash(B, S) equals a commitment in the registered commitment set"
- "The nullifier Hash(B, app_context) has not been used before"
- "The biometric B satisfies liveness detection criteria" (proves it is a real person, not a photo)

Proof generation on a modern smartphone takes approximately 2-3 seconds. Verification by the application is near-instantaneous.

### On-Chain Architecture

The protocol is deployed as a set of smart contracts on an EVM-compatible chain chosen for low fees and high throughput (Base, Arbitrum, or a dedicated application chain).

Core contracts:
- **CommitmentRegistry**: Stores all registered commitments. Append-only. Public.
- **NullifierRegistry**: Stores used nullifiers per application context. Prevents double-use.
- **VerifierContract**: Verifies zkSNARK proofs on-chain. Called by applications.
- **ProtocolGovernance**: Controls protocol upgrades via a decentralized governance process.

Applications do not need to understand the cryptography. They call a single function: `verifyHuman(proof, nullifier)` — returns true or false.

### The SDK

The developer experience must be as simple as adding Google Sign-In. The protocol ships an SDK for:
- iOS and Android (native)
- Web (JavaScript/WASM)
- Server-side verification (Node.js, Python, Go)

Integrating proof of personhood into any application requires fewer than 20 lines of code.

---

## Use Cases

### Tier 1: Platform Integrity
Social networks, forums, review sites — any platform where fake accounts degrade the experience. One proof per account, applied at registration. The platform does not learn who you are; it only learns you are human.

### Tier 2: Democratic Processes
Online voting, community governance, polls. One vote per human is mathematically enforced. This is the foundation of legitimate online democracy without the surveillance of government ID systems.

### Tier 3: Financial Applications
Preventing sybil attacks in DeFi (where bots drain incentive programs), ensuring one-per-human distribution of tokens or funds, KYC-alternative for jurisdictions where formal ID is unavailable.

### Tier 4: AI Interaction Transparency
A "human badge" that you can attach to messages, emails, and content that proves it was authored or initiated by a verified human — not generated by AI. The cryptographic equivalent of a handwritten signature for the AI age.

### Tier 5: Access to Human-Only Spaces
As AI proliferates, demand grows for spaces where only humans can participate — therapy platforms, peer support communities, certain professional networks. The protocol enables this without platform-level surveillance.

---

## Business Model

### Protocol Layer: Public Good, Governed by a Foundation

The core protocol — the smart contracts, the proof system, the cryptographic specification — is open source and owned by a non-profit foundation. This is not altruism. It is the right strategy.

Proof of personhood can only work as a standard if nobody controls it. If a single company owns it, every other company has a reason not to adopt it. If it is a public good, every company has a reason to build on it.

The foundation is funded by:
- Protocol fees (1-2% of paid application verifications flow to foundation treasury)
- Grants from interested parties (governments, NGOs, crypto foundations)
- Token treasury (if a governance token is used)

### Commercial Layer: Infrastructure Business on Top

A commercial company provides the infrastructure layer that makes the protocol easy to use:

**Managed verification API**: Applications call a managed endpoint instead of running their own nodes. Priced per verification: $0.001-$0.01 per proof verification depending on volume. At 1 billion verifications per year (the scale of a major platform), this is $1-10M in API revenue.

**Enterprise compliance suite**: Large enterprises need reporting, audit logs, and compliance dashboards. Annual contracts: $50,000-$500,000/year.

**Hardware certification program**: Device manufacturers and hardware vendors pay certification fees to get their hardware listed as "Protocol Certified."

**Human badge API**: A premium API that enables applications to display "verified human" badges next to content, with real-time verification. Subscription model: $1,000-$50,000/month based on volume.

---

## Existing Attempts and What They Got Wrong

| Project | Approach | Gap |
|---------|----------|-----|
| Worldcoin | Iris scan via proprietary Orb hardware | Hardware too scarce, privacy concerns, single company controls biometric data |
| BrightID | Social graph verification | Vulnerable to sybil collusion, not biometric-rooted |
| Proof of Humanity | Video + social vouching | High friction, not scalable, not private |
| Civic | Government ID + blockchain | Identity exposure, regulatory complexity, not privacy-preserving |
| Gitcoin Passport | Aggregation of existing credentials | No biometric root, determined bot can acquire all credentials |

The gap this protocol fills: **biometric-rooted + no biometric stored + no identity revealed + works on existing hardware + developer-simple integration**.

---

## The Bangladesh Angle: Why the Global South Is the Real Market

Global proof of personhood projects are designed for wealthy, ID-holding citizens of stable democracies. But the billion people who most need reliable digital identity are not those people.

In Bangladesh:
- National ID coverage is imperfect, especially for rural populations
- Mobile penetration is high but smartphone quality varies
- Huge underserved population for financial services that require identity verification
- Mobile banking (bKash) has proven there is massive demand for identity-enabled services

A proof of personhood system designed for Tier 1 (phone camera) would reach people who are currently excluded from online financial services, voting systems, and platform economies entirely. The Global South is not a secondary market. It is the primary proof point that the protocol works at scale for all of humanity.

---

## Regulatory Landscape

### The Privacy Dimension
GDPR (EU), PDPA (various), and emerging AI regulations all focus on data minimization — collect only what you need. Proof of personhood, because it stores no biometric data, is more compliant than traditional identity systems, not less.

### The Biometric Exception
Many jurisdictions (Illinois BIPA, EU AI Act) specifically regulate biometric data collection. Because the protocol never stores biometrics — only commitments — it is designed to fall outside these regulatory categories. This needs jurisdiction-specific legal analysis and lobbying.

### The Identity Alternative
Some regulators want "real names on the internet." Proof of personhood can satisfy the "one person, one account" objective of these regulations without the surveillance architecture of real-name systems. Regulators should be educated partners, not adversaries.

---

## MVP

Month 1-4: Build and deploy the cryptographic core. Smart contracts on testnet. SDK for web. No biometric yet — simulate it with a simple liveness check using phone camera.

Month 5-8: First integration partners. Target: three social platforms or forums that have a bot problem and are willing to integrate. Measure: reduction in bot accounts.

Month 9-12: Introduce biometric commitment using phone secure enclave. Upgrade existing users. Open the SDK for third-party integrations.

Year 2: Foundation formation. Open-source the protocol. Bring in multiple infrastructure providers. Start the governance process.

---

## The End State

The Proof of Personhood Protocol becomes what HTTPS became — an invisible layer that every application uses, that nobody notices, that makes everything else safer and more trustworthy. The company that builds the infrastructure layer on top captures a fraction of the value of every verified human interaction on the internet.

At a billion users and a trillion digital interactions per year, even a tiny fraction of that value is a business of historic scale.

More importantly: this is the infrastructure that makes democracy, commerce, and human connection possible in a world of infinite AI-generated entities. That is not just a business. That is a civilizational contribution.
