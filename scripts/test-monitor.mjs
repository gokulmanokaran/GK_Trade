#!/usr/bin/env node
/**
 * Test script for OptionPulse Watchdog & Recovery Trigger Endpoint:
 * POST /api/monitor/nifty
 *
 * Usage:
 *   node scripts/test-monitor.mjs
 *   node scripts/test-monitor.mjs --url https://gk-trade.vercel.app --secret my_secret --force
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load env values from .env files
function loadEnv() {
  const envFiles = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', 'frontend', '.env.local'),
  ];
  const env = {};
  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          env[k] = v;
        }
      }
    }
  }
  return env;
}

async function main() {
  const fileEnv = loadEnv();
  const args = process.argv.slice(2);

  let baseUrl = 'http://localhost:3000';
  let cronSecret = process.env.CRON_SECRET || fileEnv.CRON_SECRET || '';
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      baseUrl = args[++i];
    } else if (args[i] === '--secret' && args[i + 1]) {
      cronSecret = args[++i];
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  baseUrl = baseUrl.replace(/\/$/, '');
  const targetUrl = `${baseUrl}/api/monitor/nifty${force ? '?force=true' : ''}`;

  console.log('====================================================');
  console.log('OptionPulse: NIFTY 50 Market Monitor Watchdog Test');
  console.log('====================================================');
  console.log(`Target URL  : ${targetUrl}`);
  console.log(`Auth Secret : ${cronSecret ? '*** configured ***' : '(none provided)'}`);
  console.log(`Force Run   : ${force}`);
  console.log('----------------------------------------------------');

  const headers = {
    'Content-Type': 'application/json',
  };
  if (cronSecret) {
    headers['Authorization'] = `Bearer ${cronSecret}`;
  }

  const startTime = Date.now();
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'manual_test_script',
        force,
        timestamp: new Date().toISOString(),
      }),
    });

    const latency = Date.now() - startTime;
    console.log(`HTTP Status : ${res.status} ${res.statusText}`);
    console.log(`Duration    : ${latency}ms`);

    let data;
    const text = await res.text();
    try {
      data = JSON.parse(text);
      console.log('Response JSON:');
      console.dir(data, { depth: null, colors: true });
    } catch {
      console.log('Raw Response:');
      console.log(text);
    }

    if (res.ok) {
      console.log('\n✅ Monitor watchdog endpoint test SUCCEEDED.');
    } else {
      console.log('\n❌ Monitor watchdog endpoint test FAILED.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Request Error: ${err.message}`);
    process.exit(1);
  }
}

main();
