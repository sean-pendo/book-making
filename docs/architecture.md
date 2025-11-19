# Architecture Overview

## Tech Stack

- **Frontend**: React with Vite
- **Styling**: Tailwind CSS with Shadcn UI components
- **Backend/Database**: Supabase (PostgreSQL)
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router DOM

## Key Concepts

### Balancing Goals
The system optimizes territory assignments based on configurable goals, such as:
- **ARR Balance**: Balancing Annual Recurring Revenue across reps.
- **Customer Count**: Ensuring reps have a similar number of accounts.
- **Risk Distribution**: spreading high-risk accounts evenly.

### Assignment Engine
The assignment engine handles the logic of moving accounts between representatives based on:
1. **Rules**: Defined criteria for assignments (e.g., geography, vertical).
2. **Constraints**: Limits on movement (e.g., continuity, maximum moves).
3. **Optimization**: AI or algorithmic suggestions to improve balance metrics.

## Directory Structure

- `src/components`: Reusable UI components.
- `src/pages`: Main application views/routes.
- `src/services`: Business logic and API interactions.
- `src/config`: Configuration files (e.g., default balancing goals).
- `supabase/`: Database migrations and edge functions.

