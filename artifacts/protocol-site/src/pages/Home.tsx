import { Link } from "wouter";
import { useEffect, useState } from "react";

const PROTECTS = [
  {
    label: "Sybil signups",
    detail: "One verified badge per real human, per app context. Bulk account creation against your application is mathematically constrained.",
  },
  {
    label: "Trivial bots",
    detail: "Every badge is bound to a third-party liveness check. Headless scripts cannot pass a vendor liveness challenge.",
  },
  {
    label: "Cross-app correlation",
    detail: "Nullifiers are HMAC-derived per app context. Two apps using the protocol cannot link a user across them by default.",
  },
];

const NOT_PROTECTS = [
  {
    label: "Determined deepfakes",
    detail: "Liveness vendors raise the cost of synthetic-face attacks but do not eliminate them. State-level attackers remain in scope of your own threat model.",
  },
  {
    label: "Coerced verifications",
    detail: "If a real human passes liveness on someone else's behalf, the badge is valid. Layer reputation or social signals if this matters to you.",
  },
  {
    label: "Identity verification",
    detail: "A badge proves uniqueness, not who the user is. KYC, age, and identity confirmation require a separate layer.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Vendor liveness check",
    desc: "The user completes a hosted liveness check provided by our identity-verification subprocessor. Real selfie + liveness, not a script.",
    detail: "We never see or store the underlying biometric capture.",
  },
  {
    step: "02",
    title: "Nullifier registration",
    desc: "We derive a per-app nullifier as HMAC(server_master_key, subject || app_context) and register it in our managed Postgres registry.",
    detail: "Nullifiers cannot be inverted. Apps cannot link the same user to each other.",
  },
  {
    step: "03",
    title: "Signed JWT badge",
    desc: "We issue a JWT human-badge token signed with our RSA key. Your application stores it and verifies it offline against our public JWKS.",
    detail: "One badge per (subject, app_context). Forgery requires our private key.",
  },
];

const USE_CASES = [
  { tier: "01", label: "Platform Integrity", desc: "Social networks, forums, review platforms. One verified human per account; bots can't register; reviews can't be synthesized at scale." },
  { tier: "02", label: "Community Governance", desc: "Online polls, DAO votes, peer-elected moderation. Enforce one-vote-per-human without collecting government IDs." },
  { tier: "03", label: "Sybil-resistant Distribution", desc: "Token airdrops, free credits, referral bonuses. Stop single-person multi-account farming without surfacing personal identity." },
  { tier: "04", label: "Authored-by-human Attestations", desc: "Attach a human-badge JWT to a post, review, or piece of content as evidence that a verified human authored it — distinct from raw AI output." },
  { tier: "05", label: "Human-Only Spaces", desc: "Therapy platforms, peer support, professional networks that need to enforce human-only participation without platform-level surveillance." },
];

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1800;
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);
  return <span>{display.toLocaleString()}</span>;
}

export function Home() {
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 overflow-hidden border-b border-border" data-testid="section-hero">
        <div className="absolute inset-0 grid-bg pointer-events-none" />
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-10 blur-[120px] bg-primary pointer-events-none transition-opacity duration-1000 ${heroVisible ? 'opacity-10' : 'opacity-0'}`} />
        <div className={`relative z-10 max-w-4xl w-full mx-auto text-center transition-all duration-700 ${heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="inline-flex items-center gap-2 border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-mono text-primary mb-8 tracking-widest uppercase">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            Unique-human verification API
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight leading-[0.95] mb-6">
            Verify a<br />
            <span className="text-primary">unique human</span><br />
            in one API call
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed font-mono">
            A vendor-backed liveness check, a per-app nullifier registry, and a signed JWT badge your app can verify offline. No raw biometric data ever touches our servers.
          </p>
          <div className="border border-primary/30 bg-primary/5 max-w-2xl mx-auto px-4 py-2 mb-8 font-mono text-xs text-foreground/80" data-testid="hero-maturity-notice">
            <span className="text-primary mr-2 tracking-widest uppercase">Today</span>
            Endpoints are live; verification semantics are symbolic. Vendor-backed liveness and signed JWT badges ship in a coming release. See the <Link href="/developers" className="text-primary hover:underline">API maturity notice</Link>.
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/demo" data-testid="button-hero-demo" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 font-medium text-sm hover:bg-primary/90 transition-colors">
              Try the Simulated Demo
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6H10M7 3L10 6L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></svg>
            </Link>
            <Link href="/developers" data-testid="button-hero-developers" className="inline-flex items-center gap-2 border border-border px-8 py-3 font-medium text-sm hover:border-primary/50 hover:text-primary transition-colors">
              Developer Docs
            </Link>
          </div>
          <div className="mt-8 text-xs font-mono text-muted-foreground/70">
            Honest about scope — see <Link href="/trust" className="text-primary hover:underline" data-testid="link-hero-trust">what we protect against</Link>.
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-xs text-muted-foreground font-mono">
          <span>SCROLL</span>
          <div className="w-px h-8 bg-border" />
        </div>
      </section>

      {/* Core Problem */}
      <section className="py-24 px-4 border-b border-border" data-testid="section-problem">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-xs font-mono text-primary tracking-widest uppercase mb-4">The Problem</p>
              <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-6 leading-tight">
                The internet has no native uniqueness layer.
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For 30 years, fake accounts were annoying. Bots were a nuisance. Spam was a cost of doing business.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Today, a single developer can spin up 10,000 convincing AI personas in an afternoon. Your application's assumption of one-account-per-person has quietly collapsed — and there is no off-the-shelf API that reliably restores it.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {[
                { q: "How do you keep your free tier free when one person can sign up 10,000 times?" },
                { q: "How do you trust a product review when reviews can be synthesized at AI scale?" },
                { q: "How do you run a community vote when you can't tell which voters are real humans?" },
              ].map((item, i) => (
                <div key={i} className="border border-border bg-card p-6" data-testid={`problem-question-${i}`}>
                  <p className="font-mono text-sm leading-relaxed text-foreground/80">{item.q}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 border-b border-border bg-card" data-testid="section-how-it-works">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-mono text-primary tracking-widest uppercase mb-4">How it works</p>
          <h2 className="text-4xl font-medium tracking-tight mb-4">Three steps, one API call</h2>
          <p className="text-muted-foreground mb-4 max-w-2xl">No new cryptography to learn. No new wallet for your users. No on-chain transactions.</p>
          <p className="text-xs font-mono text-muted-foreground mb-16 max-w-2xl">
            The flow below describes the <span className="text-primary">production architecture</span>. The current public release ships steps 2 and 3 with symbolic semantics; the vendor liveness step (1) lands in a coming milestone.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className={`p-8 ${i < 2 ? 'border-b md:border-b-0 md:border-r border-border' : ''}`} data-testid={`how-step-${i}`}>
                <div className="font-mono text-5xl font-medium text-primary/20 mb-6">{step.step}</div>
                <h3 className="text-xl font-medium mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">{step.desc}</p>
                <p className="font-mono text-xs text-primary/70 leading-relaxed">{step.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 border border-border bg-background p-6 font-mono text-xs text-muted-foreground overflow-x-auto">
            <span className="text-primary">subject</span> = vendor.verify(user) &nbsp;|&nbsp; <span className="text-primary">N</span> = HMAC(master_key, subject || app_context) &nbsp;|&nbsp; <span className="text-primary">badge</span> = JWT.sign(&#123; sub: commitment, nullifier: N, aud: app &#125;)
          </div>
        </div>
      </section>

      {/* Honest scope: protect / not protect */}
      <section className="py-24 px-4 border-b border-border" data-testid="section-scope">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-mono text-primary tracking-widest uppercase mb-4">Honest scope</p>
          <h2 className="text-4xl font-medium tracking-tight mb-4">What we protect against — and what we don't</h2>
          <p className="text-muted-foreground mb-16 max-w-2xl">
            Most identity products oversell. We are deliberately specific about the threats this service does and does not defend against, because production systems demand it.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border border-border">
            <div className="p-8 border-b lg:border-b-0 lg:border-r border-border" data-testid="scope-protects">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2 h-2 bg-primary" />
                <p className="font-mono text-xs text-primary tracking-widest uppercase">Protected</p>
              </div>
              <ul className="flex flex-col gap-5">
                {PROTECTS.map((item, i) => (
                  <li key={i} data-testid={`protect-${i}`}>
                    <p className="font-medium mb-1">{item.label}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-8" data-testid="scope-not-protects">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2 h-2 bg-muted-foreground" />
                <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">Out of scope</p>
              </div>
              <ul className="flex flex-col gap-5">
                {NOT_PROTECTS.map((item, i) => (
                  <li key={i} data-testid={`not-protect-${i}`}>
                    <p className="font-medium mb-1">{item.label}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-6 text-xs font-mono text-muted-foreground">
            Read the full threat model on the <Link href="/trust" className="text-primary hover:underline" data-testid="link-scope-trust">Trust & Security</Link> page.
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-24 px-4 border-b border-border bg-card" data-testid="section-use-cases">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-mono text-primary tracking-widest uppercase mb-4">Applications</p>
          <h2 className="text-4xl font-medium tracking-tight mb-16">Use cases</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-border">
            {USE_CASES.map((uc, i) => (
              <div key={i} className={`p-8 border-b border-border ${i % 3 !== 2 ? 'lg:border-r' : ''} ${i % 2 !== 1 ? 'md:border-r lg:border-r-0' : 'md:border-r-0'} ${i >= 3 ? 'md:border-b-0' : ''} ${i === 4 ? 'lg:border-r' : ''}`} data-testid={`use-case-${i}`}>
                <div className="font-mono text-xs text-primary/50 mb-4">{uc.tier}</div>
                <h3 className="font-medium mb-3">{uc.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats teaser */}
      <section className="py-20 px-4 border-b border-border" data-testid="section-stats-teaser">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-xs font-mono text-primary tracking-widest uppercase mb-4">Live network</p>
          <h2 className="text-3xl font-medium tracking-tight mb-2">Service is active</h2>
          <p className="text-muted-foreground font-mono text-xs mb-10">
            <AnimatedNumber value={1} />+ verifications served &middot; sandbox traffic only
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/stats" data-testid="button-view-stats" className="inline-flex items-center gap-2 border border-border px-6 py-3 font-mono text-sm hover:border-primary/50 hover:text-primary transition-colors">
              View Live Stats
            </Link>
            <Link href="/status" data-testid="button-view-status" className="inline-flex items-center gap-2 border border-border px-6 py-3 font-mono text-sm hover:border-primary/50 hover:text-primary transition-colors">
              System Status
            </Link>
            <Link href="/demo" data-testid="button-run-demo" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 font-mono text-sm hover:bg-primary/90 transition-colors">
              Run the Demo
            </Link>
          </div>
        </div>
      </section>

      {/* End state quote */}
      <section className="py-32 px-4" data-testid="section-vision">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-2xl md:text-3xl leading-relaxed text-muted-foreground font-mono">
            "A boring, reliable uniqueness layer — quietly under every signup form, vote, and review — is more useful than any oversold cryptographic story."
          </p>
          <div className="mt-12 flex items-center justify-center gap-2">
            <div className="w-1 h-1 bg-primary" />
            <div className="w-1 h-1 bg-primary/50" />
            <div className="w-1 h-1 bg-primary/20" />
          </div>
        </div>
      </section>
    </div>
  );
}
