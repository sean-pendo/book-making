/**
 * Slack Notification Service
 * 
 * Sends notifications via Supabase Edge Function.
 * - Developer feedback → DM to @sean.muse
 * - System notifications → DM to user (pendo.io email) or fallback to developer
 */

import { supabase } from '@/integrations/supabase/client';

export type NotificationType = 
  | 'feedback'
  | 'review_assigned'
  | 'proposal_approved'
  | 'proposal_rejected'
  | 'build_status'
  | 'error'
  | 'welcome';

interface NotificationOptions {
  type: NotificationType;
  recipientEmail?: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  imageUrls?: string[];
}

interface NotificationResult {
  success: boolean;
  sent: boolean;
  fallback?: boolean;
  error?: string;
}

/**
 * Send a Slack notification via edge function
 */
export async function sendSlackNotification(options: NotificationOptions): Promise<NotificationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('send-slack-notification', {
      body: options,
    });

    if (error) {
      console.error('[SlackNotification] Edge function error:', error);
      return { success: false, sent: false, error: error.message };
    }

    return {
      success: data?.success || data?.sent || false,
      sent: data?.sent || false,
      fallback: data?.fallback || false,
      error: data?.error,
    };
  } catch (error) {
    console.error('[SlackNotification] Error:', error);
    return { 
      success: false, 
      sent: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Notify a manager that they have a new review to complete
 */
export async function notifyReviewAssigned(
  managerEmail: string,
  buildName: string,
  managerLevel: 'SLM' | 'FLM',
  assignedBy: string
): Promise<NotificationResult> {
  return sendSlackNotification({
    type: 'review_assigned',
    recipientEmail: managerEmail,
    title: `New ${managerLevel} Review Assigned`,
    message: `You have a new book review to complete for build "${buildName}".`,
    metadata: {
      buildName,
      managerLevel,
      assignedBy,
    },
  });
}

/**
 * Notify a manager that their proposal was approved
 */
export async function notifyProposalApproved(
  managerEmail: string,
  accountName: string,
  proposedOwner: string,
  approvedBy: string,
  buildName: string
): Promise<NotificationResult> {
  return sendSlackNotification({
    type: 'proposal_approved',
    recipientEmail: managerEmail,
    title: 'Proposal Approved',
    message: `Your reassignment proposal for "${accountName}" to ${proposedOwner} has been approved by ${approvedBy}.`,
    metadata: {
      accountName,
      proposedOwner,
      approvedBy,
      buildName,
    },
  });
}

/**
 * Notify a manager that their proposal was rejected
 */
export async function notifyProposalRejected(
  managerEmail: string,
  accountName: string,
  rejectedBy: string,
  reason?: string,
  buildName?: string
): Promise<NotificationResult> {
  let message = `Your reassignment proposal for "${accountName}" was rejected by ${rejectedBy}.`;
  if (reason) {
    message += ` Reason: ${reason}`;
  }

  return sendSlackNotification({
    type: 'proposal_rejected',
    recipientEmail: managerEmail,
    title: 'Proposal Rejected',
    message,
    metadata: {
      accountName,
      rejectedBy,
      reason,
      buildName,
    },
  });
}

/**
 * Notify relevant users about a build status change
 */
export async function notifyBuildStatusChange(
  recipientEmail: string,
  buildName: string,
  oldStatus: string,
  newStatus: string,
  changedBy: string
): Promise<NotificationResult> {
  return sendSlackNotification({
    type: 'build_status',
    recipientEmail,
    title: 'Build Status Changed',
    message: `Build "${buildName}" status changed from "${oldStatus}" to "${newStatus}".`,
    metadata: {
      buildName,
      oldStatus,
      newStatus,
      changedBy,
    },
  });
}

