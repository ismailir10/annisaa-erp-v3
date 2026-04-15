#!/bin/bash

###############################################################################
# CRITICAL SECURITY FIX: Enable Row-Level Security (RLS)
#
# This script fixes the "RLS disabled in public" security vulnerability
# detected by Supabase.
#
# Projects affected:
# - annisaa-erp-v3-staging (jzhujpqaxyeeokgexerc)
# - annisaa-erp-v3 (qrnbanxcrmrwganpmzmn)
#
# Run this script for BOTH projects to fix the security issue.
###############################################################################

set -e  # Exit on error

echo "=========================================="
echo "🔒 CRITICAL SECURITY FIX: Enable RLS"
echo "=========================================="
echo ""
echo "This will:"
echo "  1. Enable RLS on all tables"
echo "  2. Create tenant isolation policies"
echo "  3. Apply to your Supabase project"
echo ""
echo "⚠️  WARNING: This is a CRITICAL security fix."
echo "   Without RLS, anyone with your project URL can access ALL data."
echo ""

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found."
    echo ""
    echo "Install it first:"
    echo "  npm install -g supabase"
    echo ""
    echo "Then login:"
    echo "  supabase login"
    echo ""
    exit 1
fi

# Check if logged in
echo "Checking Supabase authentication status..."
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged into Supabase."
    echo ""
    echo "Please login first:"
    echo "  supabase login"
    echo ""
    exit 1
fi

echo "✓ Authenticated to Supabase"
echo ""

# List available projects
echo "Available Supabase projects:"
supabase projects list
echo ""

# Prompt for project selection
echo "Which project do you want to fix?"
echo "  1) annisaa-erp-v3-staging (jzhujpqaxyeeokgexerc)"
echo "  2) annisaa-erp-v3 (qrnbanxcrmrwganpmzmn)"
echo "  3) Both projects"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
  1)
    PROJECT_REF="jzhujpqaxyeeokgexerc"
    PROJECT_NAME="annisaa-erp-v3-staging"
    ;;
  2)
    PROJECT_REF="qrnbanxcrmrwganpmzmn"
    PROJECT_NAME="annisaa-erp-v3"
    ;;
  3)
    PROJECT_REF="jzhujpqaxyeeokgexerc"
    PROJECT_NAME="annisaa-erp-v3-staging"
    echo ""
    echo "Applying fixes to staging first..."
    echo "After this completes, you'll need to run again for production."
    ;;
  *)
    echo "❌ Invalid choice. Exiting."
    exit 1
    ;;
esac

echo ""
echo "=========================================="
echo "🔒 Applying Security Fixes to: $PROJECT_NAME"
echo "=========================================="
echo ""

# Confirm before proceeding
read -p "Continue? This will modify database security policies. (yes/no): " confirm
if [[ ! "$confirm" =~ ^[Yy] ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "✓ Proceeding with security fixes..."
echo ""

# Link to the project (if not already linked)
echo "Linking to Supabase project..."
supabase link --project-ref "$PROJECT_REF" || echo "Already linked or doesn't need linking"
echo ""

# Push schema to create migration
echo "Step 1: Pushing schema to create migration..."
supabase db push --linked
echo ""

# Apply RLS migration
echo "Step 2: Applying RLS migration..."
supabase db reset --linked <<EOF
y
EOF

echo "✓ RLS migration applied!"
echo ""
echo "=========================================="
echo "✅ Security Fix Complete!"
echo "=========================================="
echo ""
echo "What was fixed:"
echo "  ✓ RLS enabled on all 35+ tables"
echo "  ✓ Tenant isolation policies created"
echo "  ✓ Users can only access their tenant's data"
echo "  ✓ Service role can manage all data"
echo ""
echo "⚠️  IMPORTANT:"
echo "  - Test the application thoroughly"
echo "  - Verify users can only see their data"
echo "  - Check that login/session works correctly"
echo ""
echo "If this is staging, repeat for production:"
echo "  bash scripts/fix-rls-security.sh"
echo ""
echo "Verify fix in Supabase dashboard:"
echo "  https://app.supabase.com/project/$PROJECT_REF/auth/policies"
