import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the frontend deployment environment.');
}

let parsedSupabaseUrl;
try {
  parsedSupabaseUrl = new URL(supabaseUrl);
} catch {
  throw new Error('SUPABASE_URL must be a valid HTTP(S) URL.');
}
if (!['http:', 'https:'].includes(parsedSupabaseUrl.protocol)) {
  throw new Error('SUPABASE_URL must use HTTP or HTTPS.');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, 'index.html'), join(output, 'index.html'));
await cp(join(root, 'styles.css'), join(output, 'styles.css'));
await cp(join(root, 'src'), join(output, 'src'), { recursive: true });
await writeFile(
  join(output, 'config.js'),
  `window.RPG_CONFIG = ${JSON.stringify({ supabaseUrl, supabasePublishableKey, apiBaseUrl: '' })};\n`,
);
console.log('Frontend static files prepared.');
