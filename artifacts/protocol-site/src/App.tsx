import { type ReactElement, useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { type Variants, AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  ClerkProvider,
  useClerk,
} from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";

import { Home } from "@/pages/Home";
import { Demo } from "@/pages/Demo";
import { Developers } from "@/pages/Developers";
import { Stats } from "@/pages/Stats";
import { Trust } from "@/pages/Trust";
import { Privacy } from "@/pages/Privacy";
import { Terms } from "@/pages/Terms";
import { Status } from "@/pages/Status";
import { SignInPage } from "@/pages/SignInPage";
import { SignUpPage } from "@/pages/SignUpPage";
import { DashboardOverview } from "@/pages/dashboard/Overview";
import { ProjectDetailPage } from "@/pages/dashboard/ProjectDetail";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment");
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(190 100% 50%)",
    colorForeground: "hsl(0 0% 96%)",
    colorMutedForeground: "hsl(0 0% 60%)",
    colorDanger: "hsl(0 62% 50%)",
    colorBackground: "hsl(0 0% 5%)",
    colorInput: "hsl(0 0% 8%)",
    colorInputForeground: "hsl(0 0% 96%)",
    colorNeutral: "hsl(0 0% 12%)",
    fontFamily: "Geist, system-ui, sans-serif",
    borderRadius: "0",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(0_0%_5%)] border border-[hsl(0_0%_12%)] w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(0_0%_96%)] font-medium tracking-tight",
    headerSubtitle: "text-[hsl(0_0%_60%)] font-mono text-sm",
    socialButtonsBlockButtonText: "text-[hsl(0_0%_96%)]",
    formFieldLabel: "text-[hsl(0_0%_96%)] text-xs font-mono uppercase tracking-widest",
    footerActionLink: "text-[hsl(190_100%_50%)] hover:underline",
    footerActionText: "text-[hsl(0_0%_60%)] font-mono text-xs",
    dividerText: "text-[hsl(0_0%_60%)] font-mono text-xs uppercase tracking-widest",
    identityPreviewEditButton: "text-[hsl(190_100%_50%)]",
    formFieldSuccessText: "text-[hsl(190_100%_50%)] font-mono text-xs",
    alertText: "text-[hsl(0_0%_96%)] font-mono text-xs",
    logoBox: "flex justify-center mb-2",
    logoImage: "h-8",
    socialButtonsBlockButton: "border border-[hsl(0_0%_12%)] hover:border-[hsl(190_100%_50%)]",
    formButtonPrimary: "bg-[hsl(190_100%_50%)] text-[hsl(0_0%_0%)] hover:bg-[hsl(190_100%_45%)] font-medium",
    formFieldInput: "bg-[hsl(0_0%_8%)] border border-[hsl(0_0%_12%)] text-[hsl(0_0%_96%)]",
    footerAction: "text-center",
    dividerLine: "bg-[hsl(0_0%_12%)]",
    alert: "border border-[hsl(0_0%_12%)] bg-[hsl(0_0%_5%)]",
    otpCodeFieldInput: "bg-[hsl(0_0%_8%)] border border-[hsl(0_0%_12%)] text-[hsl(0_0%_96%)]",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function MarketingRoutes(): ReactElement {
  const [location] = useLocation();
  return (
    <Layout>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/demo" component={Demo} />
            <Route path="/developers" component={Developers} />
            <Route path="/stats" component={Stats} />
            <Route path="/trust" component={Trust} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/terms" component={Terms} />
            <Route path="/status" component={Status} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={NotFound} />
          </Switch>
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}

function AppRoutes(): ReactElement {
  return (
    <Switch>
      <Route path="/dashboard" component={DashboardOverview} />
      <Route path="/dashboard/projects/:id" component={ProjectDetailPage} />
      <Route path="/dashboard/:rest*">
        {() => <Redirect to="/dashboard" />}
      </Route>
      <Route component={MarketingRoutes} />
    </Switch>
  );
}

function ClerkProviderWithRoutes(): ReactElement {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome to POP Protocol",
            subtitle: "Sign in to access your developer console",
          },
        },
        signUp: {
          start: {
            title: "Create a developer account",
            subtitle: "Build with proof of personhood today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App(): ReactElement {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
