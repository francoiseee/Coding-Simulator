// src/lib/supabase/admin.js
// SERVER-ONLY service-role client. Bypasses Row Level Security.
//
// NEVER import this file into a Client Component or anything that ships to the
// browser. It must only be used inside route handlers / server actions.
// The key has no NEXT_PUBLIC_ prefix, so Next.js will not expose it client-side.

import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
