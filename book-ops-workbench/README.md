# Book Builder - Territory Assignment Platform

A comprehensive book balancing and account assignment tool for Sales Operations (RevOps). Book Builder enables teams to import sales data, configure assignment rules, and generate fair account assignments based on ARR, workload, continuity, team tier, and geography.

## Project Status

**Version**: 1.0 (QA Phase)
**Status**: Active Development

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: Shadcn UI + Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Routing**: React Router v6
- **Form Handling**: React Hook Form + Zod

## Prerequisites

- Node.js 18+ ([install with nvm](https://github.com/nvm-sh/nvm))
- npm or yarn
- Supabase CLI (for database management)

## Getting Started

### 1. Clone the Repository

```bash
git clone <YOUR_GIT_URL>
cd book-ops-workbench
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the example environment file and configure your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://lolnbotrdamhukdrrsmh.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Get your credentials from:
https://app.supabase.com/project/lolnbotrdamhukdrrsmh/settings/api

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:8080`

## Available Scripts

```bash
# Development server (port 8080)
npm run dev

# Production build
npm run build

# Development build (with source maps)
npm run build:dev

# Lint code
npm run lint

# Preview production build
npm run preview
```

## Database Management

### Install Supabase CLI

```bash
brew install supabase/tap/supabase
# OR
npm install -g supabase
```

### Database Commands

```bash
# Link to remote Supabase project
supabase link --project-ref lolnbotrdamhukdrrsmh

# Push migrations to remote database
supabase db push

# Reset local database (useful for testing)
supabase db reset

# View database in Supabase Studio
supabase studio
```

## Project Structure

```
book-ops-workbench/
├── src/
│   ├── components/        # React components
│   ├── pages/            # Route-level components
│   ├── services/         # Business logic & assignment engines
│   ├── hooks/            # Custom React hooks
│   ├── contexts/         # React Context providers
│   ├── integrations/     # Supabase client & types
│   └── lib/              # Utilities
├── supabase/
│   ├── migrations/       # Database migrations
│   └── functions/        # Edge Functions
├── docs/                 # Project documentation
│   ├── core/            # Architecture & strategy
│   └── ops/             # QA logs & operations
└── public/              # Static assets
```

## Key Features

- **Data Import**: CSV upload for Accounts, Sales Reps, and Opportunities
- **Assignment Engine**: Rule-based territory assignment with multiple strategies
- **Balancing Dashboard**: Visualize and optimize territory distribution
- **Manager Dashboard**: Review and approve assignments
- **Governance**: Audit trail and assignment history

## Deployment

See [DEPLOYMENT.md](../DEPLOYMENT.md) for comprehensive deployment instructions including:
- Supabase setup and migration
- Edge Functions deployment
- Hosting configuration (Vercel/Netlify)
- Auth provider setup

## Documentation

- **[CLAUDE.md](../CLAUDE.md)** - Guide for AI assistants working on this codebase
- **[DEPLOYMENT.md](../DEPLOYMENT.md)** - Production deployment guide
- **[CHANGELOG.md](../CHANGELOG.md)** - Project changelog
- **[docs/core/architecture.md](../docs/core/architecture.md)** - System architecture
- **[docs/ops/qa_log.md](../docs/ops/qa_log.md)** - QA tracking

## Contributing

This project follows a structured development workflow:

1. **Make changes** in a feature branch
2. **Update CHANGELOG.md** with all changes
3. **Test locally** using `npm run dev`
4. **Build** using `npm run build` to verify no errors
5. **Commit** with descriptive messages
6. **Push** to GitHub

## Known Issues

Currently in QA phase. See [docs/ops/qa_log.md](../docs/ops/qa_log.md) for active issues and tracking.

## Support

For issues or questions, open an issue on GitHub.

## License

Private - All Rights Reserved
