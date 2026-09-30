#!/usr/bin/env node
/**
 * Seed test accounts for Loomic open-source deployment.
 *
 * Creates 4 test users across different plan tiers so you can immediately
 * explore the full product without setting up payments.
 *
 * Usage:
 *   node scripts/seed-test-accounts.mjs
 *
 * Requires .env.local (or env vars) with:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { parseEnvValue } from "./parse-env-value.mjs";

// ── Config ───────────────────────────────────────────────────────────

const TEST_ACCOUNTS = [
  { email: "free@test.loomic.com",    plan: "free",    credits: 50    },
  { email: "starter@test.loomic.com", plan: "starter", credits: 1_200 },
  { email: "pro@test.loomic.com",     plan: "pro",     credits: 5_000 },
  { email: "ultra@test.loomic.com",   plan: "ultra",   credits: 15_000 },
];

const PASSWORD = "opensourceloomic";

// ── Load env ─────────────────────────────────────────────────────────

async function loadEnv() {
  // Try .env.local first, then fall back to process.env
  for (const envFile of [".env.local", ".env.cloud"]) {
    try {
      const content = await readFile(envFile, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = parseEnvValue(trimmed.slice(eqIdx + 1));
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      // File not found, skip
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  await loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    console.error("Set them in .env.local or as environment variables.");
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Seeding test accounts...\n");

  for (const account of TEST_ACCOUNTS) {
    const label = `${account.email} (${account.plan})`;

    // 1. Create auth user (or skip if exists)
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(u => u.email === account.email);

    let userId;
    if (existing) {
      userId = existing.id;
      console.log(`  [skip] ${label} — already exists (${userId})`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: {
          display_name: account.plan.charAt(0).toUpperCase() + account.plan.slice(1) + " Tester",
        },
      });
      if (error) {
        console.error(`  [fail] ${label} — ${error.message}`);
        continue;
      }
      userId = data.user.id;
      console.log(`  [created] ${label} — user ${userId}`);

      // Wait for triggers to fire (profile, workspace, subscription, credit_balance)
      await sleep(1500);
    }

    // 2. Find the user's personal workspace
    const { data: workspace, error: wsError } = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_user_id", userId)
      .eq("type", "personal")
      .single();

    if (wsError || !workspace) {
      console.error(`  [fail] ${label} — workspace not found: ${wsError?.message}`);
      continue;
    }

    // 3. Check current plan — skip if already seeded
    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("workspace_id", workspace.id)
      .single();

    if (sub && sub.plan === account.plan && account.plan !== "free") {
      console.log(`  [skip] ${label} — already on ${account.plan} plan\n`);
      continue;
    }

    // 4. Upgrade plan & grant credits
    if (account.plan === "free") {
      // Free plan: set initial credits directly
      const { data: balance } = await admin
        .from("credit_balances")
        .select("balance")
        .eq("workspace_id", workspace.id)
        .single();

      if (balance && balance.balance === 0) {
        await admin
          .from("credit_balances")
          .update({ balance: account.credits, version: 1 })
          .eq("workspace_id", workspace.id);

        await admin.from("credit_transactions").insert({
          workspace_id: workspace.id,
          user_id: userId,
          transaction_type: "admin_adjustment",
          amount: account.credits,
          balance_after: account.credits,
          description: "Seed: initial free-tier credits",
        });
      }
      console.log(`  [done] ${label} — ${account.credits} credits\n`);
    } else {
      // Paid plans: use grant_plan_credits RPC (atomic plan + credits)
      const { data: newBalance, error: rpcError } = await admin.rpc(
        "grant_plan_credits",
        {
          p_workspace_id: workspace.id,
          p_plan: account.plan,
          p_credits: account.credits,
        },
      );

      if (rpcError) {
        console.error(`  [fail] ${label} — grant_plan_credits: ${rpcError.message}`);
        continue;
      }
      console.log(`  [done] ${label} — plan=${account.plan}, balance=${newBalance}\n`);
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Test accounts ready! Login with password: " + PASSWORD);
  console.log("");
  console.log("  Email                     │ Plan    │ Credits");
  console.log("  ──────────────────────────┼─────────┼────────");
  for (const a of TEST_ACCOUNTS) {
    console.log(`  ${a.email.padEnd(25)} │ ${a.plan.padEnd(7)} │ ${String(a.credits).padStart(6)}`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
