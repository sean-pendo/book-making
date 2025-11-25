import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
            {/* Protected routes with role-based access control */}
            <Route path="/" element={
              <Layout>
                <ProtectedRoute page="dashboard">
                  <Index />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/build/:id" element={
              <Layout>
                <ProtectedRoute page="dashboard">
                  <BuildDetail />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/import" element={
              <Layout>
                <ProtectedRoute page="data_import">
                  <DataImport />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/review" element={
              <Layout>
                <ProtectedRoute page="review_notes">
                  <ReviewNotes />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/summary" element={
              <Layout>
                <ProtectedRoute page="dashboard">
                  <SummaryImpact />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/governance" element={
              <Layout>
                <ProtectedRoute page="dashboard">
                  <Governance />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/manager-dashboard" element={
              <Layout>
                <ProtectedRoute page="manager_dashboard">
                  <ManagerDashboard />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/revops-final" element={
              <Layout>
                <ProtectedRoute page="revops_final">
                  <RevOpsFinalView />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/settings" element={
              <Layout>
                <ProtectedRoute page="settings">
                  <Settings />
                </ProtectedRoute>
              </Layout>
            } />
            <Route path="/assignment-config/:id" element={
              <Layout>
                <ProtectedRoute page="dashboard">
                  <SimplifiedAssignmentConfig />
                </ProtectedRoute>
              </Layout>
            } />
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
