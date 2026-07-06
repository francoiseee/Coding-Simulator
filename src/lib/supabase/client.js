// src/lib/supabase/client.js
// Browser-side Supabase client (used in Client Components).
// Uses @supabase/ssr so the session is stored in cookies and shared with the server.

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    // Keep using your existing env var name. The docs call this the
    // "publishable" (anon) key — either name works as long as it matches .env.local.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
