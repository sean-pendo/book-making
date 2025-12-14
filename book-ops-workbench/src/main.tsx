import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { testAssignmentRegeneration } from './utils/debugRecalculation'
import { initializeErrorReporting } from './services/errorReportingService'
import { ErrorBoundary } from './components/ErrorBoundary'

// Initialize global error reporting to Slack
initializeErrorReporting();

// Add test function to window for easy console access
(window as any).testAssignmentRegeneration = testAssignmentRegeneration;

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
