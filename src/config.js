// Public settings. These are safe to ship to the browser: the Supabase key is the
// publishable (anon) key, protected by row level security, and the VAPID key is public.
// Vercel environment variables override them if set.
const env = import.meta.env;
export const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://qoizudddelbifkibcize.supabase.co';
export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_xWuVHtUKtax9qNHXVUBlCw_0fYUVlr4';
export const VAPID_PUBLIC_KEY = env.VITE_VAPID_PUBLIC_KEY || 'BEqD1krj1us9JPgGwNaeDS_qHyWq_T_uNrnbfmeAlTjxtF6kpSUS_NfFn6qlFPVuNeFhJK9-m7C_Z4KbdVKqyBs';
export const FILES_BUCKET = 'task-files';
