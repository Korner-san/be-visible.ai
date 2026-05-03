#!/usr/bin/env node
/**
 * Phase 7: Nightly Schedule Generator
 *
 * Runs at 2:00 AM daily via cron
 * Generates tomorrow's schedule with even ChatGPT account distribution:
 * 1. Discovers eligible users and their active prompts
 * 2. Brand-interleaves prompts to prevent clustering
 * 3. Creates randomized batches (1-6 prompts each)
 * 4. Assigns ChatGPT accounts round-robin by batch time order
 *    → each account's batches are maximally spaced apart in time
 *    → works correctly for any number of eligible accounts
 * 5. Stores schedule in database
 *
 * Usage: node generate-nightly-schedule-BRAND-AWARE.js [--date=YYYY-MM-DD]
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { getTomorrowPstReportDate, getUserTomorrowDate, getCurrentPstTimestamp } = require('./lib/timezone-utils');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 6;
const MIN_HOUR = 8;  // 8 AM Pacific
const MAX_HOUR = 18; // 6 PM Pacific
const MIN_SPACING_MINUTES = 10;

// ========== PHASE 1: USER & PROMPT DISCOVERY ==========

async function getEligibleUsers() {
  // No plan check -- every onboarded user gets daily reports (tiers added later).
  const { data: brands, error: brandsError } = await supabase
    .from('brands')
    .select('owner_user_id')
    .eq('onboarding_completed', true)
    .eq('is_demo', false);

  if (brandsError) {
    throw new Error('Failed to fetch eligible brands: ' + brandsError.message);
  }

  const brandRows = brands || [];
  if (brandRows.length === 0) return [];

  // Deduplicate owner IDs
  const seen = {};
  const ownerIds = [];
  for (const b of brandRows) {
    if (b.owner_user_id && !seen[b.owner_user_id]) {
      seen[b.owner_user_id] = true;
      ownerIds.push(b.owner_user_id);
    }
  }

  // Resolve user emails via auth admin API
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (authError) throw new Error('Failed to list auth users: ' + authError.message);
  const allAuthUsers = (authData && authData.users) ? authData.users : [];

  const ownerSet = {};
  for (const id of ownerIds) ownerSet[id] = true;

  // Fetch stored timezones for each user
  const userIds = ownerIds;
  const { data: userRows } = await supabase
    .from('users')
    .select('id, timezone')
    .in('id', userIds);
  const tzMap = {};
  for (const row of (userRows || [])) {
    if (row.timezone) tzMap[row.id] = row.timezone;
  }

  const eligible = [];
  for (const u of allAuthUsers) {
    if (ownerSet[u.id]) {
      eligible.push({ id: u.id, email: u.email, timezone: tzMap[u.id] || 'UTC' });
    }
  }
  return eligible;
}

async function getActivePromptsForUser(userId, userTimezone) {
  const { data: brands, error: brandsError } = await supabase
    .from('brands')
    .select('id, name')
    .eq('owner_user_id', userId);

  if (brandsError) {
    throw new Error(`Failed to fetch brands for user ${userId}: ${brandsError.message}`);
  }

  if (!brands || brands.length === 0) {
    return { brandId: null, brandName: null, prompts: [] };
  }

  const brand = brands[0];

  const { data: prompts, error: promptsError} = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt, status')
    .eq('brand_id', brand.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (promptsError) {
    throw new Error(`Failed to fetch prompts for brand ${brand.id}: ${promptsError.message}`);
  }

  return {
    brandId: brand.id,
    brandName: brand.name,
    userTimezone: userTimezone || UTC,
    prompts: (prompts || []).map(p => ({
      promptId: p.id,
      promptText: p.improved_prompt || p.raw_prompt
    }))
  };
}

async function generateDailyPromptInventory() {
  console.log('🔍 [DISCOVERY] Finding eligible users...');

  const users = await getEligibleUsers();
  console.log(`✅ [DISCOVERY] Found ${users.length} eligible user(s)`);

  const allPrompts = [];

  for (const user of users) {
    const { brandId, brandName, userTimezone, prompts } = await getActivePromptsForUser(user.id, user.timezone);

    if (prompts.length > 0) {
      for (const prompt of prompts) {
        allPrompts.push({
          userId: user.id,
          userEmail: user.email,
          userTimezone,
          brandId,
          brandName,
          promptId: prompt.promptId,
          promptText: prompt.promptText
        });
      }

      console.log(`  - ${user.email}: ${prompts.length} active prompts`);
    } else {
      console.log(`  - ${user.email}: No active prompts (skipped)`);
    }
  }

  console.log(`\n✅ [DISCOVERY] Total prompts to process: ${allPrompts.length}`);

  return allPrompts;
}

// ========== PHASE 2: CHATGPT ACCOUNT SELECTION ==========

async function getAvailableChatGPTAccounts() {
  const { data: accounts, error } = await supabase
    .from('chatgpt_accounts')
    .select('id, email, display_name, proxy_host, proxy_port, status, last_used_at')
    .eq('status', 'active')
    .eq('is_eligible', true) // Only eligible accounts (excludes personally-used accounts)
    .not('proxy_host', 'is', null); // Only accounts with proxies configured

  if (error) {
    throw new Error(`Failed to fetch ChatGPT accounts: ${error.message}`);
  }

  return accounts || [];
}

// ========== PHASE 3: BATCH CREATION & SCHEDULING ==========

function generateRandomTimeSlots(numSlots, minHour, maxHour, minSpacingMinutes) {
  const slots = [];
  const usedMinutes = new Set();
  let attempts = 0;
  const MAX_ATTEMPTS = 500000;

  const startMinute = minHour * 60;
  const endMinute = maxHour * 60;
  const totalMinutes = endMinute - startMinute;

  // Ensure it's mathematically possible
  const maxPossibleSlots = Math.floor(totalMinutes / minSpacingMinutes);
  if (numSlots > maxPossibleSlots) {
    throw new Error(`Cannot fit ${numSlots} slots with ${minSpacingMinutes}min spacing in ${totalMinutes}min window (max: ${maxPossibleSlots})`);
  }

  while (slots.length < numSlots) {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      throw new Error(`Unable to generate non-overlapping time slots after ${MAX_ATTEMPTS} attempts`);
    }

    const randomMinute = startMinute + Math.floor(Math.random() * totalMinutes);

    let tooClose = false;
    for (const existing of usedMinutes) {
      if (Math.abs(randomMinute - existing) < minSpacingMinutes) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      usedMinutes.add(randomMinute);

      const hour = Math.floor(randomMinute / 60);
      const minute = randomMinute % 60;

      slots.push({ hour, minute });
    }
  }

  slots.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));

  return slots;
}

// Interleave brands to prevent clustering
function interleaveBrandPrompts(prompts) {
  // Group prompts by brand
  const byBrand = {};
  prompts.forEach(p => {
    if (!byBrand[p.brandId]) {
      byBrand[p.brandId] = [];
    }
    byBrand[p.brandId].push(p);
  });

  const brands = Object.keys(byBrand);
  const interleaved = [];

  // Round-robin through brands
  let allEmpty = false;

  while (!allEmpty) {
    allEmpty = true;
    for (const brandId of brands) {
      if (byBrand[brandId].length > 0) {
        allEmpty = false;
        interleaved.push(byBrand[brandId].shift());
      }
    }
  }

  console.log('\n📊 [INTERLEAVING] Brand distribution after interleaving:');
  let currentBrand = null;
  let count = 0;
  let maxConsecutive = 0;

  interleaved.forEach((p, i) => {
    if (p.brandId !== currentBrand) {
      if (currentBrand) {
        console.log(`   ${p.brandName}: ${count} consecutive`);
        maxConsecutive = Math.max(maxConsecutive, count);
      }
      currentBrand = p.brandId;
      count = 1;
    } else {
      count++;
    }
  });
  if (currentBrand) {
    const lastPrompt = interleaved[interleaved.length - 1];
    console.log(`   ${lastPrompt.brandName}: ${count} consecutive`);
    maxConsecutive = Math.max(maxConsecutive, count);
  }

  console.log(`   Max consecutive same-brand prompts: ${maxConsecutive}`);

  return interleaved;
}

// Create batches, assign accounts round-robin by time order for maximum per-account spacing
async function createScheduleRecords(prompts) {
  console.log('\n📅 [SCHEDULING] Creating brand-interleaved batch schedule...\n');

  // Step 1: Interleave brands to prevent clustering
  const interleaved = interleaveBrandPrompts(prompts);

  // Step 2: Create random-sized batches from interleaved prompts
  const batches = [];
  let remaining = [...interleaved];

  while (remaining.length > 0) {
    const maxSize = Math.min(MAX_BATCH_SIZE, remaining.length);
    const batchSize = Math.floor(Math.random() * (maxSize - MIN_BATCH_SIZE + 1)) + MIN_BATCH_SIZE;

    const batch = remaining.splice(0, batchSize);
    batches.push(batch);
  }

  console.log(`   Created ${batches.length} mixed batches from ${prompts.length} prompts`);

  // Step 3: Generate time slots for all batches (already sorted chronologically)
  const timeSlots = generateRandomTimeSlots(
    batches.length,
    MIN_HOUR,
    MAX_HOUR,
    MIN_SPACING_MINUTES
  );

  // Step 4: Fetch eligible accounts and assign round-robin by batch time order.
  // Batches are already sorted by time (generateRandomTimeSlots sorts them).
  // Assigning accounts[i % accounts.length] maximizes the time gap between
  // consecutive batches for each account.
  const accounts = await getAvailableChatGPTAccounts();
  if (accounts.length === 0) {
    throw new Error('No active ChatGPT accounts available with proxy configuration');
  }

  console.log(`\n🎯 [ROUTING] Assigning accounts round-robin across ${batches.length} batches (${accounts.length} account(s)):`);
  accounts.forEach(a => {
    console.log(`   - ${a.email} (Proxy: ${a.proxy_host}:${a.proxy_port})`);
  });

  batches.forEach((batch, index) => {
    const account = accounts[index % accounts.length];
    batch.forEach(p => {
      p.chatgptAccountId = account.id;
      p.chatgptAccountEmail = account.email;
    });
  });

  // Show distribution summary
  const accountBatchCounts = {};
  batches.forEach((batch, index) => {
    const email = batch[0].chatgptAccountEmail;
    accountBatchCounts[email] = (accountBatchCounts[email] || 0) + 1;
  });
  console.log('\n📊 [ROUTING] Batch distribution:');
  Object.entries(accountBatchCounts).forEach(([email, count]) => {
    console.log(`   - ${email}: ${count} batches`);
  });

  // Step 5: Per-brand dedup — skip any brand already scheduled for their target date
  // (prevents duplicates when injectBrandIntoTomorrowSchedule ran first for a late-night onboarding)
  const brandDatePairs = new Map(); // brandId -> scheduleDate
  batches.forEach(batch => {
    const p = batch[0];
    if (!brandDatePairs.has(p.brandId)) {
      brandDatePairs.set(p.brandId, getUserTomorrowDate(p.userTimezone || 'UTC'));
    }
  });

  const alreadyScheduledBrands = new Set();
  for (const [brandId, scheduleDate] of brandDatePairs.entries()) {
    const { data: existing } = await supabase
      .from('daily_schedules')
      .select('id')
      .eq('brand_id', brandId)
      .eq('schedule_date', scheduleDate)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(`   ⚠️  Brand ${brandId.substring(0, 8)} already scheduled for ${scheduleDate} — skipping (was injected post-onboarding)`);
      alreadyScheduledBrands.add(brandId);
    }
  }

  // Step 6: Create schedule records (excluding pre-scheduled brands)
  const allScheduleRecords = [];

  batches.forEach((batch, index) => {
    const firstPrompt = batch[0];
    if (alreadyScheduledBrands.has(firstPrompt.brandId)) return; // skip

    const timeSlot = timeSlots[index];

    // Pacific time conversion — execution window is always PST
    const executionDate = getTomorrowPstReportDate();
    const pacificTimeString = `${executionDate}T${String(timeSlot.hour).padStart(2, '0')}:${String(timeSlot.minute).padStart(2, '0')}:00-08:00`;
    const executionTime = new Date(pacificTimeString);

    const chatgptAccountId = firstPrompt.chatgptAccountId;

    // Each user gets their own local "tomorrow" as schedule_date (= report_date in daily_reports)
    const userScheduleDate = getUserTomorrowDate(firstPrompt.userTimezone || 'UTC');
    allScheduleRecords.push({
      schedule_date: userScheduleDate,
      user_id: firstPrompt.userId,
      brand_id: firstPrompt.brandId,
      chatgpt_account_id: chatgptAccountId,
      batch_number: index + 1,
      execution_time: executionTime.toISOString(),
      prompt_ids: batch.map(p => p.promptId),
      batch_size: batch.length,
      status: 'pending'
    });

    // Show batch details with brand distribution
    const brandCounts = {};
    batch.forEach(p => {
      brandCounts[p.brandName] = (brandCounts[p.brandName] || 0) + 1;
    });
    const brandSummary = Object.entries(brandCounts).map(([name, count]) => `${name}:${count}`).join(', ');
    console.log(`   Batch ${index + 1}: ${batch.length} prompts - ${brandSummary} (${batch[0].chatgptAccountEmail})`);
  });

  return allScheduleRecords;
}

async function persistScheduleToDatabase(scheduleRecords) {
  console.log(`\n💾 [DATABASE] Persisting ${scheduleRecords.length} batch records...\n`);

  const { data: inserted, error } = await supabase
    .from('daily_schedules')
    .insert(scheduleRecords)
    .select('id');

  if (error) {
    throw new Error(`Failed to persist schedule: ${error.message}`);
  }

  console.log('✅ [DATABASE] Schedule persisted successfully');

  // Create 3 batch_model_executions rows (pending) per schedule so Table D shows all models from the start
  if (inserted && inserted.length > 0) {
    const bmeRows = inserted.flatMap(s => [
      { schedule_id: s.id, model: 'chatgpt',             status: 'pending' },
      { schedule_id: s.id, model: 'google_ai_overview',  status: 'pending' },
      { schedule_id: s.id, model: 'claude',              status: 'pending' },
    ]);
    const { error: bmeError } = await supabase.from('batch_model_executions').insert(bmeRows);
    if (bmeError) console.warn('[DATABASE] BME rows creation failed:', bmeError.message);
    else console.log(`✅ [DATABASE] Created ${bmeRows.length} model execution tracking rows (3 per batch)`);
  }
}

// ========== MAIN FUNCTION ==========

async function generateNightlySchedule(targetDate = null) {
  console.log('\n' + '='.repeat(70));
  console.log('🌙 NIGHTLY SCHEDULE GENERATOR');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${getCurrentPstTimestamp()}`);
  console.log('='.repeat(70) + '\n');

  try {
    // PST tomorrow is used for logging only; per-user dates computed later
    const referencePstDate = targetDate || getTomorrowPstReportDate();
    console.log("Reference date (PST tomorrow): " + referencePstDate);
    console.log("Each user gets their own local schedule_date based on their timezone");

    // PHASE 1: Discover all prompts
    console.log('='.repeat(70));
    console.log('PHASE 1: USER & PROMPT DISCOVERY');
    console.log('='.repeat(70) + '\n');

    const allPrompts = await generateDailyPromptInventory();

    if (allPrompts.length === 0) {
      console.log('⚠️  No eligible users with active prompts found.\n');
      return;
    }

    // PHASE 2: Create batches, assign accounts, schedule
    console.log('\n' + '='.repeat(70));
    console.log('PHASE 2: BATCH CREATION, ACCOUNT ASSIGNMENT & SCHEDULING');
    console.log('='.repeat(70));

    const scheduleRecords = await createScheduleRecords(allPrompts);

    // PHASE 3: Persist to database
    console.log('\n' + '='.repeat(70));
    console.log('PHASE 3: DATABASE PERSISTENCE');
    console.log('='.repeat(70));

    await persistScheduleToDatabase(scheduleRecords);

    // Display summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 SCHEDULE GENERATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Reference PST date: ${referencePstDate}`);
    console.log(`Note: each user has their own schedule_date based on their timezone`);
    console.log(`Total prompts: ${allPrompts.length}`);
    console.log(`Total batches: ${scheduleRecords.length}`);
    console.log(`Batch size range: ${MIN_BATCH_SIZE}-${MAX_BATCH_SIZE} prompts`);
    console.log(`Execution window: ${MIN_HOUR}:00 AM - ${MAX_HOUR}:00 PM Pacific Time`);
    console.log(`Average batch size: ${(allPrompts.length / scheduleRecords.length).toFixed(1)} prompts`);
    console.log('='.repeat(70));

    console.log('\n✅ Schedule generation complete!\n');

  } catch (error) {
    console.error('\n❌ Schedule generation failed:', error.message);
    console.error(error.stack);

    try {
      await supabase
        .from('system_logs')
        .insert({
          log_type: 'schedule_generation_error',
          message: error.message,
          metadata: { stack: error.stack },
          timestamp: new Date().toISOString()
        });
    } catch (logErr) {
      console.error('Failed to log error to database:', logErr);
    }

    process.exit(1);
  }
}

// ========== CLI ENTRY POINT ==========

if (require.main === module) {
  const dateArg = process.argv.find(arg => arg.startsWith('--date='));
  const targetDate = dateArg ? dateArg.split('=')[1] : null;

  if (targetDate) {
    console.log(`ℹ️  Manual run for date: ${targetDate}`);
  }

  generateNightlySchedule(targetDate)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { generateNightlySchedule };
