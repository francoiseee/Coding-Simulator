import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if credentials are provided
const isConfigured = !!(supabaseUrl && supabaseAnonKey);

let supabaseInstance;

if (isConfigured) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Mock implementation for local development without Supabase config
  if (typeof window !== 'undefined') {
    console.warn(
      'Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY) are missing. Running in Mock Mode.'
    );
  }

  const listeners = new Set();

  const getMockSession = () => {
    if (typeof window === 'undefined') return null;
    const session = localStorage.getItem('mock_supabase_session');
    return session ? JSON.parse(session) : null;
  };

  const setMockSession = (session) => {
    if (typeof window === 'undefined') return;
    if (session) {
      localStorage.setItem('mock_supabase_session', JSON.stringify(session));
    } else {
      localStorage.removeItem('mock_supabase_session');
    }
    listeners.forEach((listener) => listener('SIGNED_IN', session));
  };

  supabaseInstance = {
    auth: {
      async getSession() {
        const session = getMockSession();
        return { data: { session }, error: null };
      },
      onAuthStateChange(callback) {
        listeners.add(callback);
        // Fire immediately with current session
        const session = getMockSession();
        callback('INITIAL_SESSION', session);
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(callback);
              },
            },
          },
        };
      },
      async signUp({ email, password }) {
        if (typeof window === 'undefined') return { data: null, error: null };
        const users = JSON.parse(localStorage.getItem('mock_supabase_users') || '[]');
        if (users.find(u => u.email === email)) {
          return { data: null, error: { message: 'User already exists.' } };
        }
        users.push({ email, password });
        localStorage.setItem('mock_supabase_users', JSON.stringify(users));

        // Return a mock user structure matching Supabase structure
        return { data: { user: { email } }, error: null };
      },
      async signInWithPassword({ email, password }) {
        if (typeof window === 'undefined') return { data: null, error: null };
        const users = JSON.parse(localStorage.getItem('mock_supabase_users') || '[]');
        const user = users.find(u => u.email === email && u.password === password);
        if (!user) {
          // If no users exist yet, register this user automatically to make testing seamless
          if (users.length === 0) {
            users.push({ email, password });
            localStorage.setItem('mock_supabase_users', JSON.stringify(users));
          } else {
            return { data: null, error: { message: 'Invalid login credentials.' } };
          }
        }
        const session = { user: { email } };
        setMockSession(session);
        return { data: { session }, error: null };
      },
      async signOut() {
        setMockSession(null);
        return { error: null };
      },
    },
  };
}

export const supabase = supabaseInstance;

