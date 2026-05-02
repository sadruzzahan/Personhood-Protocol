import { useState } from "react";
import { Link, useLocation } from "wouter";

const NAV_LINKS = [
  { href: "/", label: "Protocol", testId: "link-nav-home" },
  { href: "/demo", label: "Demo", testId: "link-nav-demo" },
  { href: "/developers", label: "Developers", testId: "link-nav-developers" },
  { href: "/stats", label: "Network Stats", testId: "link-nav-stats" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeMobile() { setMobileOpen(false); }

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground dark selection:bg-primary selection:text-primary-foreground font-mono">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between max-w-6xl">
          <Link href="/" onClick={closeMobile} className="flex items-center gap-2 font-medium tracking-tight text-lg hover:text-primary transition-colors" data-testid="link-home">
            <div className="w-4 h-4 bg-primary rounded-none" />
            <span>POP Protocol</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`hover:text-foreground transition-colors ${location === link.href ? 'text-foreground' : ''}`}
                data-testid={link.testId}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/demo" className="hidden md:inline-flex items-center justify-center whitespace-nowrap text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 transition-colors" data-testid="button-launch-demo">
              Launch Demo
            </Link>
            {/* Mobile hamburger */}
            <button
              className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-[5px] border border-border hover:border-primary/50 transition-colors"
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              data-testid="button-mobile-menu"
            >
              <span className={`block w-4 h-px bg-foreground transition-all duration-200 ${mobileOpen ? 'rotate-45 translate-y-[6px]' : ''}`} />
              <span className={`block w-4 h-px bg-foreground transition-all duration-200 ${mobileOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-4 h-px bg-foreground transition-all duration-200 ${mobileOpen ? '-rotate-45 -translate-y-[6px]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-background" data-testid="mobile-menu">
            <nav className="flex flex-col py-2">
              {NAV_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobile}
                  className={`px-4 py-3 text-sm font-medium transition-colors hover:bg-card hover:text-primary ${location === link.href ? 'text-primary bg-card' : 'text-muted-foreground'}`}
                  data-testid={`mobile-${link.testId}`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="px-4 py-3">
                <Link
                  href="/demo"
                  onClick={closeMobile}
                  className="block w-full text-center bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                  data-testid="mobile-button-launch-demo"
                >
                  Launch Demo
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-border/40 bg-card py-8 mt-auto">
        <div className="container mx-auto px-4 max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-primary rounded-none" />
            <span className="text-sm font-medium">Proof of Personhood Foundation</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Cryptographic identity for the post-AI internet.
          </div>
        </div>
      </footer>
    </div>
  );
}
