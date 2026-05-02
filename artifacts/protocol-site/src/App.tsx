import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";

import { Home } from "@/pages/Home";
import { Demo } from "@/pages/Demo";
import { Developers } from "@/pages/Developers";
import { Stats } from "@/pages/Stats";

const queryClient = new QueryClient();

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15, ease: "easeIn" } },
};

function AnimatedRoute({ component: Component }: { component: () => JSX.Element }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <Component />
    </motion.div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <Layout>
      <AnimatePresence mode="wait" initial={false}>
        <Switch key={location}>
          <Route path="/" component={() => <AnimatedRoute component={Home} />} />
          <Route path="/demo" component={() => <AnimatedRoute component={Demo} />} />
          <Route path="/developers" component={() => <AnimatedRoute component={Developers} />} />
          <Route path="/stats" component={() => <AnimatedRoute component={Stats} />} />
          <Route component={() => <AnimatedRoute component={NotFound as () => JSX.Element} />} />
        </Switch>
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
