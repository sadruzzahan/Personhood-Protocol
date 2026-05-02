import { Link, useLocation } from "wouter";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground dark selection:bg-primary selection:text-primary-foreground font-mono">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between max-w-6xl">
          <Link href="/" className="flex items-center gap-2 font-medium tracking-tight text-lg hover:text-primary transition-colors" data-testid="link-home">
            <div className="w-4 h-4 bg-primary rounded-none" />
            <span>POP Protocol</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/" className={`hover:text-foreground transition-colors ${location === '/' ? 'text-foreground' : ''}`} data-testid="link-nav-home">Protocol</Link>
            <Link href="/demo" className={`hover:text-foreground transition-colors ${location === '/demo' ? 'text-foreground' : ''}`} data-testid="link-nav-demo">Demo</Link>
            <Link href="/developers" className={`hover:text-foreground transition-colors ${location === '/developers' ? 'text-foreground' : ''}`} data-testid="link-nav-developers">Developers</Link>
            <Link href="/stats" className={`hover:text-foreground transition-colors ${location === '/stats' ? 'text-foreground' : ''}`} data-testid="link-nav-stats">Network Stats</Link>
          </nav>
          
          <div className="flex items-center gap-4">
            <Link href="/demo" className="hidden md:inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2" data-testid="button-launch-demo">
              Launch Demo
            </Link>
          </div>
        </div>
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