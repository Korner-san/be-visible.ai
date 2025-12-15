const fs = require('fs');
const path = require('path');

// Manually parse .env.local or .env
function getEnvVars() {
    const vars = {};
    const paths = [
        '.env.local',
        '.env',
        '../.env.local',
        '../.env',
        'worker/.env',
        '../../.env.local'
    ];

    console.log('Searching for environment files...');

    for (const p of paths) {
        const envPath = path.resolve(process.cwd(), p);
        if (fs.existsSync(envPath)) {
            console.log(`Found ${p} at ${envPath}`);
            try {
                const content = fs.readFileSync(envPath, 'utf8');
                const lines = content.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        const parts = trimmed.split('=');
                        if (parts.length >= 2) {
                            const key = parts[0].trim();
                            const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                            if (!vars[key]) vars[key] = value;
                        }
                    }
                }
            } catch (e) {
                console.error(`  Error reading ${p}: ${e.message}`);
            }
        }
    }
    return vars;
}

const env = getEnvVars();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: Missing Supabase credentials.');
    console.log('Found keys:', Object.keys(env));
    process.exit(1);
}

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

async function testJoin() {
    console.log('Testing JOIN query...');
    const targetEmail = 'shirklain22@gmail.com';

    try {
        // 1. Get User
        const usersResp = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${targetEmail}&select=id`, { headers });
        const users = await usersResp.json();
        if (!users.length) return console.error('User not found');
        const userId = users[0].id;

        // 2. Get Brand
        const brandsResp = await fetch(`${SUPABASE_URL}/rest/v1/brands?owner_user_id=eq.${userId}&select=id,name`, { headers });
        const brands = await brandsResp.json();
        if (!brands.length) return console.error('Brand not found');
        const brandId = brands[0].id;
        console.log(`Brand: ${brands[0].name} (${brandId})`);

        // 3. Test JOIN: daily_reports with prompt_results
        // URL encoded params: select=*,prompt_results(*)
        const queryUrl = `${SUPABASE_URL}/rest/v1/daily_reports?brand_id=eq.${brandId}&select=*,prompt_results(*)&order=report_date.desc&limit=5`;
        console.log(`Fetching: ${queryUrl}`);

        const response = await fetch(queryUrl, { headers });
        if (!response.ok) {
            console.log('Error Status:', response.status);
            console.log('Error Text:', await response.text());
            return;
        }

        const data = await response.json();
        console.log(`Fetched ${data.length} reports.`);

        for (const report of data) {
            console.log(`\nReport: ${report.report_date} | Status: ${report.status}`);
            const results = report.prompt_results;

            if (results === undefined) {
                console.log('  prompt_results field: UNDEFINED (Join failed silently?)');
            } else if (results === null) {
                console.log('  prompt_results field: NULL');
            } else if (Array.isArray(results)) {
                console.log(`  prompt_results array length: ${results.length}`);
                if (results.length > 0) {
                    console.log(`  First result ID: ${results[0].id}`);
                    const text = results[0].chatgpt_response || '';
                    console.log(`  First snippet: ${text.substring(0, 50)}...`);
                }
            } else {
                console.log(`  prompt_results type: ${typeof results} (Unexpected)`);
            }
        }

    } catch (e) {
        console.error('Test failed:', e);
    }
}

testJoin();
