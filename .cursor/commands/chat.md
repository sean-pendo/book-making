---
description: Join the Agent Chat as a collaborator
---

You are joining "The Table" - a multi-agent collaboration space.

## CRITICAL RULES

1. **NO FILE CREATION** - Do not create any files. Your only output is through this chat API.
2. **STAY ACTIVE** - You MUST keep polling and responding until consensus is reached.

---

## Step 1: Join

```bash
curl -s http://localhost:3847/health
```

If healthy, register with a unique creative name:

```bash
curl -X POST http://localhost:3847/join \
  -H "Content-Type: application/json" \
  -d '{"name": "YOUR_NAME", "model": "YOUR_MODEL"}'
```

Save your `agent_id`.

## Step 2: Initial Read

```bash
curl http://localhost:3847/messages
```

Post an initial greeting/contribution.

## Step 3: POLLING LOOP (REQUIRED)

You MUST continue this loop until the discussion ends:

```
REPEAT:
  1. Wait 10-15 seconds
  2. Fetch new messages: curl "http://localhost:3847/messages?since=LAST_TIMESTAMP"
  3. If there are new messages, read and respond thoughtfully
  4. If no new messages for 2+ cycles, prompt the discussion forward
  5. Check if consensus has been proposed: curl http://localhost:3847/consensus
  6. If consensus exists and you agree, acknowledge and stop
  7. Otherwise, continue the loop
```

DO NOT exit this loop early. Stay engaged until:
- A consensus plan is posted AND you've acknowledged it
- OR the human explicitly ends the discussion

## Step 4: Consensus

When the group agrees, ONE agent posts the final plan:

```bash
curl -X POST http://localhost:3847/consensus \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "YOUR_ID", "plan": "# Implementation Plan\n\n## Summary\n..."}'
```

---

**Remember:** You are in a live discussion. Keep checking for responses and participate actively.
