/**
 * Is Supabase configured? True only when both public env vars are set.
 *
 * These are NEXT_PUBLIC_*, so the check works in both server and client
 * components (the values are inlined into the client bundle at build).
 * The whole app uses this to fall back to mock data / disable auth when
 * no backend is connected, so `npm run dev` runs with no .env.local.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
