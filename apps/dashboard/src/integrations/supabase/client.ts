import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

const safeUrl = hasSupabaseConfig ? SUPABASE_URL : 'https://placeholder.supabase.co';
const safeKey = hasSupabaseConfig ? SUPABASE_PUBLISHABLE_KEY : 'placeholder-anon-key';

export const supabase = createClient<Database>(safeUrl, safeKey, {
  auth: { persistSession: true },
});
