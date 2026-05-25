import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

const safeUrl = hasSupabaseConfig ? supabaseUrl : "https://placeholder.supabase.co";
const safeKey = hasSupabaseConfig ? supabaseKey : "placeholder-anon-key";

export const supabase = createClient<Database>(safeUrl, safeKey, {
  auth: { persistSession: true },
});
