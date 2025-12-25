// ========== BRAND-AWARE SCHEDULER UPDATES ==========
// This file contains the updated functions for brand-aware scheduling
// Replace corresponding functions in generate-nightly-schedule.js

// Configuration - add this constant at the top
const MIN_BRAND_REUSE_HOURS = 12; // Don't send same brand to same account within 12 hours

// UPDATED: Include brand_id in execution history
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

// UPDATED: Brand-aware scoring function (replaces selectBestAccountForPrompt)
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

// UPDATED: assignAccountsToPrompts now passes brandId to scoring function
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
