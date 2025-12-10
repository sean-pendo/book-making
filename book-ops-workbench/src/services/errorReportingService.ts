/**
 * Error Reporting Service
 * 
 * Captures and reports errors to Slack via the edge function.
 * All errors are sent to @sean.muse for debugging.
 */

import { supabase } from '@/integrations/supabase/client';

interface ErrorReport {
  error: Error | string;
  componentStack?: string;
  context?: string;
  url?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Report an error to Slack
 */
export async function reportError(report: ErrorReport): Promise<void> {
  const errorMessage = report.error instanceof Error 
    ? report.error.message 
    : String(report.error);
  
  const errorStack = report.error instanceof Error 
    ? report.error.stack 
    : undefined;

  try {
    const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
    
    await supabase.functions.invoke('send-slack-notification', {
      body: {
        type: 'error',
        title: `Error: ${errorMessage.substring(0, 100)}`,
        message: report.context || 'An error occurred in the application',
        metadata: {
          errorStack: errorStack || report.componentStack || 'No stack trace available',
          currentUrl: report.url || window.location.href,
          userAgent: report.userAgent || navigator.userAgent,
          appVersion,
          timestamp: new Date().toISOString(),
          ...report.metadata,
        },
      },
    });
  } catch (sendError) {
    // Log to console if we can't send to Slack
    console.error('[ErrorReporting] Failed to send error to Slack:', sendError);
    console.error('[ErrorReporting] Original error:', report.error);
  }
}

/**
 * Initialize global error handlers
 */
export function initializeErrorReporting(): void {
  // Handle uncaught errors
  window.onerror = (message, source, lineno, colno, error) => {
    reportError({
      error: error || String(message),
      context: `Uncaught error at ${source}:${lineno}:${colno}`,
      metadata: { source, lineno, colno },
    });
    return false; // Don't prevent default handling
  };

  // Handle unhandled promise rejections
  window.onunhandledrejection = (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    
    reportError({
      error,
      context: 'Unhandled Promise Rejection',
    });
  };

  console.log('[ErrorReporting] Global error handlers initialized');
}

/**
 * Manual error reporting for caught errors
 */
export function logError(error: Error, context?: string, metadata?: Record<string, any>): void {
  console.error(`[${context || 'Error'}]`, error);
  reportError({ error, context, metadata });
}

