export const config = Object.freeze({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
});

export function missingSupabaseConfig(values: Pick<typeof config, 'supabaseUrl' | 'supabasePublishableKey'> = config) {
  const missing: string[] = [];
  if (!values.supabaseUrl) missing.push('URL do Supabase');
  if (!values.supabasePublishableKey) missing.push('chave publishable do Supabase');
  return missing;
}
