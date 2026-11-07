import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

function initSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  try {
    return createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.warn('Supabase initialization skipped due to invalid configuration:', err);
    return null;
  }
}

export const supabase: SupabaseClient | null = initSupabaseClient();
export const isSupabaseConfigured = supabase !== null;
