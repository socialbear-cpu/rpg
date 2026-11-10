export const config = Object.freeze({
  supabaseUrl: window.RPG_CONFIG?.supabaseUrl ?? '',
  supabasePublishableKey: window.RPG_CONFIG?.supabasePublishableKey ?? '',
  apiBaseUrl: window.RPG_CONFIG?.apiBaseUrl ?? '',
});

export function validateConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push('URL do Supabase');
  if (!config.supabasePublishableKey) missing.push('chave publishable do Supabase');
  return missing;
}
