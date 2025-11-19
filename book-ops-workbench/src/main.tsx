import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { testAssignmentRegeneration } from './utils/testAccountCalculations'

// Add test function to window for easy console access
(window as any).testAssignmentRegeneration = testAssignmentRegeneration;

createRoot(document.getElementById("root")!).render(<App />);
