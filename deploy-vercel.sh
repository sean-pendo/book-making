#!/bin/bash

# Vercel Deployment Script for Book Builder
# This script automates the deployment process

set -e  # Exit on any error

echo "🚀 Book Builder - Vercel Deployment Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found!${NC}"
    echo "Please run this script from the book-ops-workbench directory"
    exit 1
fi

# Check if vercel is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${BLUE}Installing Vercel CLI...${NC}"
    npm install -g vercel
fi

echo -e "${GREEN}✓ Vercel CLI is ready${NC}"
echo ""

# Check if user is logged in
echo -e "${BLUE}Checking Vercel authentication...${NC}"
if ! vercel whoami &> /dev/null; then
    echo -e "${BLUE}Please login to Vercel:${NC}"
    vercel login
fi

echo -e "${GREEN}✓ Authenticated with Vercel${NC}"
echo ""

# Deploy
echo -e "${BLUE}Deploying to Vercel...${NC}"
echo "This will:"
echo "  1. Build your app"
echo "  2. Deploy to Vercel"
echo "  3. Auto-detect Vite configuration"
echo ""

vercel

echo ""
echo -e "${GREEN}✓ Initial deployment complete!${NC}"
echo ""

# Prompt for environment variables
echo -e "${BLUE}Now let's add environment variables...${NC}"
echo ""

read -p "Do you want to add VITE_SUPABASE_URL now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Enter VITE_SUPABASE_URL value:"
    echo "(Default: https://lolnbotrdamhukdrrsmh.supabase.co)"
    read -r SUPABASE_URL
    SUPABASE_URL=${SUPABASE_URL:-https://lolnbotrdamhukdrrsmh.supabase.co}

    echo "$SUPABASE_URL" | vercel env add VITE_SUPABASE_URL production
    echo -e "${GREEN}✓ VITE_SUPABASE_URL added${NC}"
fi

echo ""
read -p "Do you want to add VITE_SUPABASE_ANON_KEY now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Enter VITE_SUPABASE_ANON_KEY value:"
    echo "(Get it from: https://app.supabase.com/project/lolnbotrdamhukdrrsmh/settings/api)"
    read -r SUPABASE_KEY

    echo "$SUPABASE_KEY" | vercel env add VITE_SUPABASE_ANON_KEY production
    echo -e "${GREEN}✓ VITE_SUPABASE_ANON_KEY added${NC}"
fi

echo ""
echo -e "${BLUE}Deploying to production with environment variables...${NC}"
vercel --prod

echo ""
echo -e "${GREEN}=========================================="
echo "✓ Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Visit your deployment URL (shown above)"
echo "2. Update Supabase auth URLs:"
echo "   https://app.supabase.com/project/lolnbotrdamhukdrrsmh/auth/url-configuration"
echo "3. Test your application"
echo ""
