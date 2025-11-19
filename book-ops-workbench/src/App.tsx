import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import { Governance } from "./pages/Governance";
import { DataImport } from "./pages/DataImport";
import { AssignmentEngine } from "./pages/AssignmentEngine";
import TerritoryBalancingDashboard from "./pages/TerritoryBalancingDashboard";
import { GlobalClashDetector } from "./pages/GlobalClashDetector";
import { ComprehensiveReview } from "./pages/ComprehensiveReview";
import ReviewNotes from "./pages/ReviewNotes";
import { SummaryImpact } from "./pages/SummaryImpact";
import { BuildDetail } from "./pages/BuildDetail";
import ManagerDashboard from "./pages/ManagerDashboard";
import RevOpsFinalView from "./pages/RevOpsFinalView";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { SimplifiedAssignmentConfig } from "./components/SimplifiedAssignmentConfig";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider 
      attribute="class" 
      defaultTheme="system" 
      enableSystem 
      disableTransitionOnChange
    >
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter 
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Layout><Index /></Layout>} />
            <Route path="/build/:id" element={<Layout><BuildDetail /></Layout>} />
            <Route path="/import" element={<Layout><DataImport /></Layout>} />
            <Route path="/review" element={<Layout><ReviewNotes /></Layout>} />
            <Route path="/summary" element={<Layout><SummaryImpact /></Layout>} />
            <Route path="/governance" element={<Layout><Governance /></Layout>} />
            <Route path="/manager-dashboard" element={<Layout><ManagerDashboard /></Layout>} />
            <Route path="/revops-final" element={<Layout><RevOpsFinalView /></Layout>} />
            <Route path="/settings" element={<Layout><Settings /></Layout>} />
            <Route path="/assignment-config/:id" element={<Layout><SimplifiedAssignmentConfig /></Layout>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </ThemeProvider>
  </QueryClientProvider>
);

export default App;
