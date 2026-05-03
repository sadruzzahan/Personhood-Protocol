import { type ReactNode } from "react";
import { COMPANY } from "@/lib/constants";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  testId?: string;
  showLegalNotice?: boolean;
}

export function LegalPage({ eyebrow, title, intro, children, testId, showLegalNotice = true }: LegalPageProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="max-w-3xl mx-auto w-full px-4 py-16" data-testid={testId}>
        <p className="text-xs font-mono text-primary tracking-widest uppercase mb-2">{eyebrow}</p>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">{title}</h1>
        <p className="text-muted-foreground font-mono text-sm mb-2">{intro}</p>
        <p className="text-xs font-mono text-muted-foreground mb-12">
          Last updated: <span className="text-primary">{COMPANY.effectiveDate}</span>
        </p>

        {showLegalNotice && (
          <div
            className="border border-primary/40 bg-primary/5 p-4 mb-12 text-xs font-mono text-foreground/80 leading-relaxed"
            data-testid="legal-review-notice"
          >
            <p className="text-primary mb-1 tracking-widest">DRAFT — REVIEW WITH COUNSEL BEFORE LAUNCH</p>
            <p>
              This document is a structured draft prepared by the engineering team. It has not been reviewed by a
              licensed attorney. Do not publish to production users without legal review in your operating
              jurisdiction(s).
            </p>
          </div>
        )}

        <div className="prose-legal flex flex-col gap-10">{children}</div>
      </div>
    </div>
  );
}

interface LegalSectionProps {
  number: string;
  title: string;
  children: ReactNode;
  testId?: string;
}

export function LegalSection({ number, title, children, testId }: LegalSectionProps) {
  return (
    <section className="border-l-2 border-border hover:border-primary/40 transition-colors pl-6" data-testid={testId}>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-mono text-xs text-primary tracking-widest">{number}</span>
        <h2 className="text-xl font-medium tracking-tight">{title}</h2>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function LegalList({ items, testId }: { items: ReactNode[]; testId?: string }) {
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="text-primary font-mono mt-0.5">—</span>
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}
