require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env.local') });
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', 'worker', '.env') });

const { createClient } = require('@supabase/supabase-js');

let cachedClient = null;

function createServiceClient() {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

module.exports = {
  createServiceClient,
};
