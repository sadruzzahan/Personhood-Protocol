import { type ReactElement } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { type Variants, AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const queryClient = new QueryClient();

const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
};

function Router(): ReactElement {
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
            <Route component={NotFound} />
          </Switch>
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
