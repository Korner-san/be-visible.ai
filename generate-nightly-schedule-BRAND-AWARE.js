#!/usr/bin/env node
/**
 * Phase 7: Intelligent Nightly Schedule Generator
 *
 * Runs at 2:00 AM daily via cron
 * Generates tomorrow's schedule with intelligent ChatGPT account routing:
 * 1. Discovers eligible users and their active prompts
 * 2. Routes each prompt to optimal ChatGPT account (maximizes citation probability)
 * 3. Creates randomized batches (1-6 prompts each)
 * 4. Stores schedule in database with chatgpt_account_id assignments
 *
 * Citation Optimization Strategy:
 * - Avoid sending same prompt to same account too soon (ChatGPT memory pollution)
 * - Distribute prompts across accounts to create topic diversity
 * - Prefer accounts with longest idle time for each prompt
 *
 * Usage: node generate-nightly-schedule.js [--date YYYY-MM-DD]
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { getTomorrowPstReportDate, getCurrentPstTimestamp } = require('./lib/timezone-utils');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const MAX_PROMPTS_PER_USER = 30;
const MIN_PROMPT_REUSE_HOURS = 24; // Don't send same prompt to same account within 24 hours
const MIN_BRAND_REUSE_HOURS = 12; // Don't send same brand to same account within 12 hours
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

  const eligible = [];
  for (const u of allAuthUsers) {
    if (ownerSet[u.id]) {
      eligible.push({ id: u.id, email: u.email });
    }
  }
  return eligible;
}

async function getActivePromptsForUser(userId) {
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
    .limit(MAX_PROMPTS_PER_USER);

  if (promptsError) {
    throw new Error(`Failed to fetch prompts for brand ${brand.id}: ${promptsError.message}`);
  }

  const limitedPrompts = (prompts || []).slice(0, MAX_PROMPTS_PER_USER);

  return {
    brandId: brand.id,
    brandName: brand.name,
    prompts: limitedPrompts.map(p => ({
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
    const { brandId, brandName, prompts } = await getActivePromptsForUser(user.id);

    if (prompts.length > 0) {
      for (const prompt of prompts) {
        allPrompts.push({
          userId: user.id,
          userEmail: user.email,
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

async function getPromptExecutionHistory() {
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { data: history, error } = await supabase
    .from('prompt_execution_log')
    .select('chatgpt_account_id, brand_prompt_id, brand_id, executed_at')
    .gte('executed_at', cutoffDate.toISOString());

  if (error) {
    console.error('Warning: Failed to fetch execution history:', error);
    return [];
  }

  return history || [];
}

function selectBestAccountForPrompt(promptId, accounts, executionHistory, brandId = null) {
  const now = Date.now();
  const scores = [];

  for (const account of accounts) {
    // 1. Find last time THIS PROMPT was sent to THIS ACCOUNT
    const lastPromptExecution = executionHistory.find(
      h => h.chatgpt_account_id === account.id && h.brand_prompt_id === promptId
    );

    let hoursSincePromptExecution = Infinity;
    if (lastPromptExecution) {
      const lastTime = new Date(lastPromptExecution.executed_at).getTime();
      hoursSincePromptExecution = (now - lastTime) / (1000 * 60 * 60);
    }

    // Skip if prompt sent too recently
    if (hoursSincePromptExecution < MIN_PROMPT_REUSE_HOURS) {
      continue;
    }

    // 2. NEW: Find last time THIS BRAND was sent to THIS ACCOUNT
    let hoursSinceBrandExecution = Infinity;
    if (brandId) {
      const lastBrandExecution = executionHistory.find(
        h => h.chatgpt_account_id === account.id && h.brand_id === brandId
      );

      if (lastBrandExecution) {
        const lastTime = new Date(lastBrandExecution.executed_at).getTime();
        hoursSinceBrandExecution = (now - lastTime) / (1000 * 60 * 60);
      }
    }

    // 3. Calculate overall account idle time
    let hoursSinceAccountUse = Infinity;
    if (account.last_used_at) {
      const lastUsed = new Date(account.last_used_at).getTime();
      hoursSinceAccountUse = (now - lastUsed) / (1000 * 60 * 60);
    }

    // 4. UPDATED SCORING FORMULA with brand awareness
    // Priority: prompt-specific gap > brand-specific gap > account idle time
    const score = (hoursSincePromptExecution * 1000) +
                  (hoursSinceBrandExecution * 500) +   // NEW!
                  (hoursSinceAccountUse);

    scores.push({
      account,
      score,
      hoursSincePromptExecution,
      hoursSinceBrandExecution,  // NEW!
      hoursSinceAccountUse
    });
  }

  if (scores.length === 0) {
    // Fallback: pick least recently used account
    const fallback = accounts.sort((a, b) => {
      const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return aTime - bTime;
    })[0];

    return fallback;
  }

  scores.sort((a, b) => b.score - a.score);

  // Log detailed scoring for debugging
  console.log(`   Prompt scoring (brand-aware):`);
  scores.slice(0, 3).forEach((s, i) => {
    console.log(`     ${i+1}. ${s.account.email}`);
    console.log(`        - Prompt gap: ${s.hoursSincePromptExecution.toFixed(1)}h`);
    console.log(`        - Brand gap: ${s.hoursSinceBrandExecution.toFixed(1)}h`);
    console.log(`        - Account idle: ${s.hoursSinceAccountUse.toFixed(1)}h`);
    console.log(`        - Total score: ${s.score.toFixed(0)}`);
  });

  return scores[0].account;
}

async function assignAccountsToPrompts(prompts) {
  console.log('\n🎯 [ROUTING] Assigning ChatGPT accounts to prompts (BRAND-AWARE)...\n');

  const accounts = await getAvailableChatGPTAccounts();
  if (accounts.length === 0) {
    throw new Error('No active ChatGPT accounts available with proxy configuration');
  }

  console.log(`   Available accounts: ${accounts.length}`);
  accounts.forEach(a => {
    console.log(`   - ${a.email} (Proxy: ${a.proxy_host}:${a.proxy_port})`);
  });

  const executionHistory = await getPromptExecutionHistory();
  console.log(`   Execution history entries: ${executionHistory.length}\n`);

  const assignments = [];

  for (const prompt of prompts) {
    const selectedAccount = selectBestAccountForPrompt(
      prompt.promptId,
      accounts,
      executionHistory,
      prompt.brandId  // NEW: Pass brandId for brand-aware scoring
    );

    assignments.push({
      ...prompt,
      chatgptAccountId: selectedAccount.id,
      chatgptAccountEmail: selectedAccount.email
    });
  }

  // Show distribution summary
  const accountCounts = {};
  const brandByAccount = {};

  assignments.forEach(a => {
    accountCounts[a.chatgptAccountEmail] = (accountCounts[a.chatgptAccountEmail] || 0) + 1;

    if (!brandByAccount[a.chatgptAccountEmail]) {
      brandByAccount[a.chatgptAccountEmail] = new Set();
    }
    brandByAccount[a.chatgptAccountEmail].add(a.brandName);
  });

  console.log('📊 [ROUTING] Assignment distribution:');
  Object.entries(accountCounts).forEach(([email, count]) => {
    const brands = Array.from(brandByAccount[email]);
    console.log(`   - ${email}: ${count} prompts (${brands.length} brands: ${brands.join(', ')})`);
  });

  return assignments;
}

// ========== PHASE 3: BATCH CREATION ==========

function createBatchesForAccount(accountPrompts) {
  // Group prompts into random-sized batches (1-6 prompts each)
  const batches = [];
  const prompts = [...accountPrompts]; // Copy array

  while (prompts.length > 0) {
    const maxSize = Math.min(MAX_BATCH_SIZE, prompts.length);
    const batchSize = Math.floor(Math.random() * (maxSize - MIN_BATCH_SIZE + 1)) + MIN_BATCH_SIZE;

    const batch = prompts.splice(0, batchSize);
    batches.push(batch);
  }

  return batches;
}

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

// NEW: Interleave brands to prevent clustering
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

// UPDATED: Create mixed batches FIRST with brand interleaving
async function createScheduleRecords(assignments, scheduleDate) {
  console.log('\n📅 [SCHEDULING] Creating brand-interleaved batch schedule...\n');

  // Step 1: Interleave brands to prevent clustering
  const interleaved = interleaveBrandPrompts(assignments);

  // Step 2: Create random-sized batches from interleaved prompts
  const batches = [];
  let remaining = [...interleaved];

  while (remaining.length > 0) {
    const maxSize = Math.min(MAX_BATCH_SIZE, remaining.length);
    const batchSize = Math.floor(Math.random() * (maxSize - MIN_BATCH_SIZE + 1)) + MIN_BATCH_SIZE;

    const batch = remaining.splice(0, batchSize);
    batches.push(batch);
  }

  console.log(`   Created ${batches.length} mixed batches from ${assignments.length} prompts`);

  // Step 3: Generate time slots for all batches
  const timeSlots = generateRandomTimeSlots(
    batches.length,
    MIN_HOUR,
    MAX_HOUR,
    MIN_SPACING_MINUTES
  );

  // Step 4: Create schedule records
  const allScheduleRecords = [];

  batches.forEach((batch, index) => {
    const timeSlot = timeSlots[index];

    // Pacific time conversion
    const pacificTimeString = `${scheduleDate}T${String(timeSlot.hour).padStart(2, '0')}:${String(timeSlot.minute).padStart(2, '0')}:00-08:00`;
    const executionTime = new Date(pacificTimeString);

    // Use first prompt's details
    const firstPrompt = batch[0];

    // All prompts in batch should use same account (already assigned)
    const chatgptAccountId = firstPrompt.chatgptAccountId;

    allScheduleRecords.push({
      schedule_date: scheduleDate,
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

  const { error } = await supabase
    .from('daily_schedules')
    .insert(scheduleRecords);

  if (error) {
    throw new Error(`Failed to persist schedule: ${error.message}`);
  }

  console.log('✅ [DATABASE] Schedule persisted successfully');
}

// ========== MAIN FUNCTION ==========

async function generateNightlySchedule(targetDate = null) {
  console.log('\n' + '='.repeat(70));
  console.log('🌙 INTELLIGENT NIGHTLY SCHEDULE GENERATOR');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${getCurrentPstTimestamp()}`);
  console.log('='.repeat(70) + '\n');

  try {
    const scheduleDate = targetDate || getTomorrowPstReportDate();
    console.log(`📅 Generating schedule for: ${scheduleDate}\n`);

    // Check if schedule already exists
    const { data: existingSchedules, error: checkError } = await supabase
      .from('daily_schedules')
      .select('id')
      .eq('schedule_date', scheduleDate)
      .limit(1);

    if (checkError) {
      throw new Error(`Failed to check existing schedules: ${checkError.message}`);
    }

    if (existingSchedules && existingSchedules.length > 0) {
      console.log(`⚠️  Schedule already exists for ${scheduleDate}`);
      console.log('   Skipping generation to avoid duplicates.\n');
      return;
    }

    // PHASE 1: Discover all prompts
    console.log('='.repeat(70));
    console.log('PHASE 1: USER & PROMPT DISCOVERY');
    console.log('='.repeat(70) + '\n');

    const allPrompts = await generateDailyPromptInventory();

    if (allPrompts.length === 0) {
      console.log('⚠️  No eligible users with active prompts found.\n');
      return;
    }

    // PHASE 2: Intelligent account routing
    console.log('\n' + '='.repeat(70));
    console.log('PHASE 2: INTELLIGENT CHATGPT ACCOUNT ROUTING');
    console.log('='.repeat(70));

    const assignments = await assignAccountsToPrompts(allPrompts);

    // PHASE 3: Create batches and schedule
    console.log('\n' + '='.repeat(70));
    console.log('PHASE 3: BATCH CREATION & SCHEDULING');
    console.log('='.repeat(70));

    const scheduleRecords = await createScheduleRecords(assignments, scheduleDate);

    // PHASE 4: Persist to database
    console.log('\n' + '='.repeat(70));
    console.log('PHASE 4: DATABASE PERSISTENCE');
    console.log('='.repeat(70));

    await persistScheduleToDatabase(scheduleRecords);

    // Display summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 SCHEDULE GENERATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Date: ${scheduleDate}`);
    console.log(`Total prompts: ${allPrompts.length}`);
    console.log(`Total batches: ${scheduleRecords.length}`);
    console.log(`Batch size range: ${MIN_BATCH_SIZE}-${MAX_BATCH_SIZE} prompts`);
    console.log(`Execution window: ${MIN_HOUR}:00 AM - ${MAX_HOUR}:00 PM Pacific Time`);
    console.log(`Average batch size: ${(allPrompts.length / scheduleRecords.length).toFixed(1)} prompts`);
    console.log('='.repeat(70));

    console.log('\n✅ Intelligent schedule generation complete!\n');

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
