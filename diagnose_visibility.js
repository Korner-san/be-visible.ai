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
                console.log(`  Size: ${content.length} bytes`);
                if (content.length < 50) console.log(`  Content: ${content}`);

                const lines = content.split('\n');
                let count = 0;
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        const parts = trimmed.split('=');
                        if (parts.length >= 2) {
                            const key = parts[0].trim();
                            const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                            if (!vars[key]) {
                                vars[key] = value;
                                count++;
                            }
                        }
                    }
                }
                console.log(`  Loaded ${count} variables.`);
            } catch (e) {
                console.error(`  Error reading ${p}: ${e.message}`);
            }
        } else {
            // console.log(`  Not found: ${p}`);
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
    // process.exit(1); 
    // Don't exit yet, maybe we can hack it if we find partials? 
    // No, can't proceed.
}

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

async function fetchSupabase(table, queryParams = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${queryParams}`;
    // console.log(`Fetching: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch ${table}: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json();
}

async function diagnose() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    const targetEmail = 'shirklain22@gmail.com';
    console.log(`\nDiagnosing for user: ${targetEmail}`);

    try {
        // 1. Get User
        // ... rest of the logic
        const users = await fetchSupabase('users', `email=eq.${targetEmail}&select=id,email,subscription_plan`);

        let userId = null;
        if (users && users.length > 0) {
            userId = users[0].id;
            console.log(`Found User ID: ${userId} (Plan: ${users[0].subscription_plan})`);
        } else {
            console.log('Could not find user in public.users table.');
            // Try searching brands directly if users table is empty or inaccessible
        }

        // ... (rest is same logic, just ensure we handle null userId if needed)

        // 2. Get Brand
        let brandId = null;
        let brandName = '';

        if (userId) {
            const brands = await fetchSupabase('brands', `owner_user_id=eq.${userId}&select=id,name`);
            if (brands && brands.length > 0) {
                console.log(`Found ${brands.length} brands:`, brands.map(b => b.name));
                brandId = brands[0].id;
                brandName = brands[0].name;
            } else {
                console.log('No brands found for this user.');
                return;
            }
        } else {
            return;
        }

        // 3. Get Daily Reports
        console.log(`\nChecking Daily Reports for Brand: ${brandName} (${brandId})`);
        const reports = await fetchSupabase('daily_reports', `brand_id=eq.${brandId}&select=*&order=report_date.desc`);

        if (!reports || reports.length === 0) {
            console.log('No daily reports found.');
            return;
        }

        console.log(`Found ${reports.length} reports.`);

        for (const report of reports) {
            console.log(`\n--------------------------------------------------`);
            console.log(`Report Date: ${report.report_date} | Status: ${report.status} | Generated: ${report.generated}`);
            console.log(`Metrics (DB): Mentions=${report.total_mentions}, AvgPos=${report.average_position}`);

            const results = await fetchSupabase('prompt_results', `daily_report_id=eq.${report.id}&select=*`);

            console.log(`  Prompt Results: ${results ? results.length : 0} records`);

            if (!results) continue;

            let flaggedMentions = 0;
            let calculatedMentions = 0;

            for (let i = 0; i < results.length; i++) {
                const res = results[i];
                const provider = res.provider;
                const text = res.chatgpt_response || res.perplexity_response || res.google_ai_overview_response || '';

                // Debug first result fully
                if (i === 0) {
                    console.log(`    DEBUG RESULT #1 Text Snippet: ${text.substring(0, 50)}...`);
                    console.log(`    DEBUG RESULT #1 Brand Mentioned Flag: ${res.brand_mentioned}`);
                }

                let mentionsInThisText = 0;
                if (text && brandName) {
                    const lowerText = text.toLowerCase();
                    const lowerBrand = brandName.toLowerCase();
                    let index = lowerText.indexOf(lowerBrand);
                    while (index !== -1) {
                        mentionsInThisText++;
                        index = lowerText.indexOf(lowerBrand, index + 1);
                    }
                }
                calculatedMentions += mentionsInThisText;
                if (res.brand_mentioned) flaggedMentions++;

                // console.log(`    Result #${i+1} [${provider}]: MentionFlag=${res.brand_mentioned}, TextMentions=${mentionsInThisText}`);
            }

            console.log(`  SUMMARY for ${report.report_date}:`);
            console.log(`    DB Flagged Mentions: ${flaggedMentions}`);
            console.log(`    Text Calc Mentions : ${calculatedMentions}`);

            if (calculatedMentions > 0 && report.total_mentions === 0) {
                console.log(`  Mismatch! DB stored total_mentions=0, but text analysis finds ${calculatedMentions}.`);
            }
        }

    } catch (err) {
        console.error('Diagnosis failed:', err.message);
    }
}

diagnose();
