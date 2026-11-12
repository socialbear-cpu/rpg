// Run separately from pgTAP against a disposable, fully migrated Supabase database:
// RPG_TEST_DATABASE_URL=postgresql://... node supabase/tests/store-concurrency.mjs
// Requires psql on PATH and a database admin connection (fixtures and lock inspection).
// No HTTP race: A holds its transaction until pg_blocking_pids proves B is blocked.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';

if (!process.env.RPG_TEST_DATABASE_URL) {
  throw new Error('Set RPG_TEST_DATABASE_URL to a disposable, migrated Supabase database.');
}

class Session {
  constructor() {
    this.process = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...process.env, PGDATABASE: process.env.RPG_TEST_DATABASE_URL, PGCONNECT_TIMEOUT: '5' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.error = '';
    this.process.stderr.on('data', (chunk) => { this.error += chunk; });
    this.process.on('error', (error) => this.fail(error));
    this.process.on('exit', (code) => this.fail(new Error(`psql exited (${code}): ${this.error}`)));
    this.process.stdin.on('error', (error) => this.fail(error));
    createInterface({ input: this.process.stdout }).on('line', (line) => {
      if (!this.pending) return;
      if (line === this.pending.marker) {
        const { resolve, rows, timer } = this.pending;
        clearTimeout(timer);
        this.pending = null;
        resolve(rows);
      } else if (line) this.pending.rows.push(line);
    });
  }
  fail(error) {
    this.failure = error;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
  }
  query(sql) {
    if (this.failure) return Promise.reject(this.failure);
    assert(!this.pending, 'Only one query may run per session');
    return new Promise((resolve, reject) => {
      const marker = randomUUID();
      const timer = setTimeout(() => this.fail(new Error(`psql response timed out: ${this.error}`)), 20000);
      this.pending = { marker, rows: [], resolve, reject, timer };
      this.process.stdin.write(`${sql};\nSELECT '${marker}';\n`);
    });
  }
  async init() {
    const rows = await this.query("SET statement_timeout='15s'; SET idle_in_transaction_session_timeout='30s'; SELECT pg_backend_pid()");
    this.pid = Number(rows[0]);
  }
  close() { this.process.kill(); }
}

const [owner, player, system, character, item, product, offer] = Array.from({ length: 7 }, () => randomUUID());
const sessions = [];
let admin;
try {
  for (let i = 0; i < 3; i++) {
    const session = new Session();
    sessions.push(session);
    await session.init();
  }
  [admin] = sessions;
  const [, a, b] = sessions;
  console.log(`Isolated fixture system: ${system}`);
  await admin.query(`BEGIN;
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      ('${owner}','${owner}@example.test','{}'),('${player}','${player}@example.test','{}');
    INSERT INTO public.game_systems(id,slug,name,owner_user_id,daily_login_timezone,daily_login_rewards_enabled,currency_name)
      VALUES('${system}','concurrency-${system}','Concurrency test','${owner}','UTC',true,'Test Coins');
    INSERT INTO public.characters(id,user_id,game_system_id,character_name)
      VALUES('${character}','${player}','${system}','Concurrency hero');
    INSERT INTO public.items(id,game_system_id,slug,name) VALUES('${item}','${system}','token','Test Token');
    INSERT INTO public.products(id,game_system_id,item_id) VALUES('${product}','${system}','${item}');
    INSERT INTO public.store_products(id,game_system_id,product_id,price) VALUES('${offer}','${system}','${product}',10);
    INSERT INTO public.daily_login_rewards(game_system_id,weekday,item_id,quantity,currency_amount)
      SELECT '${system}',day,'${item}',1,7 FROM generate_series(1,7) day;
    UPDATE public.character_wallets SET balance=10 WHERE character_id='${character}';
    COMMIT`);
  for (const session of [a, b]) {
    await session.query(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${player}',false)`);
  }

  async function contend(rpc, firstStatus, secondStatus) {
    await a.query('BEGIN');
    await b.query('BEGIN');
    const first = JSON.parse((await a.query(`SELECT ${rpc}`))[0]);
    assert.equal(first.status, firstStatus);
    // A has completed the RPC but retains its locks until COMMIT.
    // B must actually wait on A: a fast, nonlocking implementation fails the barrier.
    const secondPromise = b.query(`SELECT ${rpc}`);
    let settled = false;
    secondPromise.then(() => { settled = true; }, () => { settled = true; });
    const deadline = Date.now() + 10000;
    let blocked = false;
    while (Date.now() < deadline && !settled) {
      const [value] = await admin.query(`SELECT ${a.pid} = ANY(pg_blocking_pids(${b.pid}))`);
      if (value === 't') { blocked = true; break; }
      await delay(25);
    }
    assert(blocked, 'Second RPC must be observed waiting for the first transaction');
    await a.query('COMMIT');
    const second = JSON.parse((await secondPromise)[0]);
    assert.equal(second.status, secondStatus);
    await b.query('COMMIT');
    console.log(`PASS contended ${firstStatus}/${secondStatus}`);
  }

  await contend(`public.purchase_store_product('${character}','${offer}',1)`, 'purchased', 'insufficient_funds');
  const [purchase] = await admin.query(`SELECT jsonb_build_object(
    'balance',(SELECT balance FROM public.character_wallets WHERE character_id='${character}'),
    'quantity',(SELECT quantity FROM public.character_inventory WHERE character_id='${character}' AND item_id='${item}'),
    'purchases',(SELECT count(*) FROM public.purchases WHERE game_system_id='${system}'),
    'snapshot',(SELECT count(*) FROM public.purchases WHERE game_system_id='${system}' AND total_amount=10 AND currency_code='Test Coins'),
    'lines',(SELECT count(*) FROM public.purchase_items WHERE game_system_id='${system}' AND quantity=1 AND unit_price=10 AND product_name='Test Token'),
    'ledger',(SELECT count(*) FROM public.character_currency_ledger l JOIN public.purchases p ON p.id=l.source_id WHERE l.character_id='${character}' AND source_type='purchase' AND amount=-10 AND balance_after=0))`);
  assert.deepEqual(JSON.parse(purchase), { balance: 0, quantity: 1, purchases: 1, snapshot: 1, lines: 1, ledger: 1 });

  // Use the same user/system/character for both claims. All weekdays are configured.
  // Keep the test away from a UTC date boundary: the contract is one claim per day.
  const [secondsLeft] = await admin.query("SELECT extract(epoch FROM (date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') + interval '1 day' - (clock_timestamp() AT TIME ZONE 'UTC')))");
  assert(Number(secondsLeft) > 60, 'Rerun after UTC midnight to avoid crossing reward days');
  await contend(`public.claim_daily_login_reward('${system}','${character}')`, 'claimed', 'already_claimed');
  const [daily] = await admin.query(`SELECT jsonb_build_object(
    'balance',(SELECT balance FROM public.character_wallets WHERE character_id='${character}'),
    'quantity',(SELECT quantity FROM public.character_inventory WHERE character_id='${character}' AND item_id='${item}'),
    'claims',(SELECT count(*) FROM public.daily_login_claims WHERE game_system_id='${system}'),
    'ledger',(SELECT count(*) FROM public.character_currency_ledger WHERE character_id='${character}' AND source_type='daily_login' AND amount=7 AND balance_after=7),
    'ledger_total',(SELECT count(*) FROM public.character_currency_ledger WHERE character_id='${character}'))`);
  assert.deepEqual(JSON.parse(daily), { balance: 7, quantity: 2, claims: 1, ledger: 1, ledger_total: 2 });
  console.log('PASS balances, delivery, purchase history, daily claims and ledger');
} finally {
  try {
    if (admin) {
      // Terminate only this harness's workers before cleanup, including blocked/failed RPCs.
      for (const session of sessions.slice(1)) {
        if (session.pid) await admin.query(`SELECT pg_terminate_backend(${session.pid})`);
      }
      await admin.query(`ROLLBACK; BEGIN;
        DELETE FROM public.purchases WHERE game_system_id='${system}';
        DELETE FROM public.daily_login_claims WHERE game_system_id='${system}';
        DELETE FROM public.characters WHERE id='${character}';
        DELETE FROM public.daily_login_rewards WHERE game_system_id='${system}';
        DELETE FROM public.store_products WHERE id='${offer}';
        DELETE FROM public.products WHERE id='${product}';
        DELETE FROM public.items WHERE id='${item}';
        DELETE FROM public.game_systems WHERE id='${system}';
        DELETE FROM auth.users WHERE id IN ('${owner}','${player}');
        COMMIT`);
      console.log('Fixture cleanup complete');
    }
  } finally {
    for (const session of sessions) session.close();
  }
}
