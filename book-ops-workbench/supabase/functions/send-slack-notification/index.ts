import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEVELOPER_SLACK_USER = "sean.muse";
const PENDO_DOMAIN = "pendo.io";

interface NotificationRequest {
  type: "feedback" | "review_assigned" | "proposal_approved" | "proposal_rejected" | "build_status";
  recipientEmail?: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  imageUrls?: string[];
}

interface SlackMessage {
  channel: string;
  text: string;
  blocks?: any[];
}

// Extract username from email (e.g., "john.doe@pendo.io" → "john.doe")
function extractUsername(email: string): string | null {
  if (!email) return null;
  const [username, domain] = email.split("@");
  if (domain?.toLowerCase() === PENDO_DOMAIN) {
    return username;
  }
  return null;
}

// Look up Slack user ID by email
async function lookupSlackUser(email: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN) return null;
  
  try {
    const response = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    
    const data = await response.json();
    if (data.ok && data.user?.id) {
      return data.user.id;
    }
    console.log("Slack user lookup failed:", data.error);
    return null;
  } catch (error) {
    console.error("Error looking up Slack user:", error);
    return null;
  }
}

// Send a DM to a Slack user
async function sendSlackDM(userId: string, message: SlackMessage): Promise<{ ok: boolean; error?: string; response?: any }> {
  if (!SLACK_BOT_TOKEN) {
    return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
  }

  try {
    // Open a DM channel with the user
    const openResponse = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ users: userId }),
    });
    
    const openData = await openResponse.json();
    if (!openData.ok) {
      return { ok: false, error: `Failed to open DM: ${openData.error}` };
    }
    
    const channelId = openData.channel.id;
    
    // Send the message
    const msgResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text: message.text,
        blocks: message.blocks,
      }),
    });
    
    const msgData = await msgResponse.json();
    if (!msgData.ok) {
      return { ok: false, error: `Failed to send message: ${msgData.error}` };
    }
    
    return { ok: true, response: msgData };
  } catch (error) {
    console.error("Error sending Slack DM:", error);
    return { ok: false, error: String(error) };
  }
}

// Format notification into Slack blocks
function formatSlackMessage(req: NotificationRequest, isDeveloperFallback = false): SlackMessage {
  const typeEmoji: Record<string, string> = {
    feedback: "📝",
    review_assigned: "📋",
    proposal_approved: "✅",
    proposal_rejected: "❌",
    build_status: "🏗️",
  };
  
  const typeLabel: Record<string, string> = {
    feedback: "Feedback",
    review_assigned: "Review Assigned",
    proposal_approved: "Proposal Approved",
    proposal_rejected: "Proposal Rejected",
    build_status: "Build Status",
  };

  const emoji = typeEmoji[req.type] || "📢";
  const label = typeLabel[req.type] || "Notification";
  
  let text = `${emoji} *${label}*\n\n*${req.title}*\n\n${req.message}`;
  
  if (isDeveloperFallback) {
    text = `⚠️ *Fallback Notification* (non-pendo.io user)\n\n_Original recipient: ${req.recipientEmail}_\n\n${text}`;
  }
  
  // Add image URLs if present
  if (req.imageUrls && req.imageUrls.length > 0) {
    text += "\n\n📎 *Attachments:*\n";
    req.imageUrls.forEach((url, i) => {
      text += `• <${url}|Image ${i + 1}>\n`;
    });
  }
  
  // Add metadata context if present
  if (req.metadata) {
    const contextParts: string[] = [];
    if (req.metadata.buildName) contextParts.push(`Build: ${req.metadata.buildName}`);
    if (req.metadata.accountName) contextParts.push(`Account: ${req.metadata.accountName}`);
    if (req.metadata.managerName) contextParts.push(`Manager: ${req.metadata.managerName}`);
    if (req.metadata.submittedBy) contextParts.push(`From: ${req.metadata.submittedBy}`);
    if (req.metadata.appVersion) contextParts.push(`v${req.metadata.appVersion}`);
    if (req.metadata.currentUrl) contextParts.push(`<${req.metadata.currentUrl}|View in app>`);
    
    if (contextParts.length > 0) {
      text += `\n---\n${contextParts.join(" | ")}`;
    }
  }

  return { channel: "", text };
}

// Log notification to database
async function logNotification(
  supabase: any,
  req: NotificationRequest,
  recipientSlackUser: string | null,
  status: "pending" | "sent" | "failed" | "fallback",
  errorMessage?: string,
  slackResponse?: any
) {
  try {
    await supabase.from("slack_notifications_log").insert({
      notification_type: req.type,
      recipient_email: req.recipientEmail,
      recipient_slack_user: recipientSlackUser,
      title: req.title,
      message: req.message,
      metadata: req.metadata || {},
      status,
      error_message: errorMessage,
      slack_response: slackResponse,
      sent_at: status === "sent" || status === "fallback" ? new Date().toISOString() : null,
    });
  } catch (error) {
    console.error("Failed to log notification:", error);
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body: NotificationRequest = await req.json();
    
    // Validate required fields
    if (!body.type || !body.title || !body.message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, title, message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role for logging
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine recipient
    let targetSlackUserId: string | null = null;
    let isFallback = false;

    if (body.type === "feedback") {
      // Developer feedback always goes to sean.muse
      targetSlackUserId = await lookupSlackUser(`${DEVELOPER_SLACK_USER}@${PENDO_DOMAIN}`);
    } else if (body.recipientEmail) {
      // System notifications go to the user
      const username = extractUsername(body.recipientEmail);
      
      if (username) {
        // Pendo email - send to that user
        targetSlackUserId = await lookupSlackUser(body.recipientEmail);
      } else {
        // Non-pendo email - fallback to developer
        isFallback = true;
        targetSlackUserId = await lookupSlackUser(`${DEVELOPER_SLACK_USER}@${PENDO_DOMAIN}`);
        console.log(`Non-pendo email (${body.recipientEmail}), falling back to developer`);
      }
    } else {
      // No recipient specified, send to developer
      targetSlackUserId = await lookupSlackUser(`${DEVELOPER_SLACK_USER}@${PENDO_DOMAIN}`);
    }

    if (!targetSlackUserId) {
      await logNotification(supabase, body, null, "failed", "Could not find Slack user");
      return new Response(
        JSON.stringify({ error: "Could not find Slack user", sent: false }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Format and send the message
    const slackMessage = formatSlackMessage(body, isFallback);
    const result = await sendSlackDM(targetSlackUserId, slackMessage);

    if (result.ok) {
      await logNotification(
        supabase,
        body,
        targetSlackUserId,
        isFallback ? "fallback" : "sent",
        undefined,
        result.response
      );
      
      return new Response(
        JSON.stringify({ success: true, sent: true, fallback: isFallback }),
        { 
          status: 200, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      );
    } else {
      await logNotification(supabase, body, targetSlackUserId, "failed", result.error);
      
      return new Response(
        JSON.stringify({ error: result.error, sent: false }),
        { 
          status: 200, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      );
    }
  } catch (error) {
    console.error("Error processing notification:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    );
  }
});

