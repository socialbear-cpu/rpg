# Store transaction contention test

`store-concurrency.mjs` is a separate integration harness, not a pgTAP file.
It requires Node.js, `psql` on PATH, and a **disposable Supabase PostgreSQL
database with all repository migrations already applied**. Use a direct admin
connection, not a transaction pooler. No new npm dependencies or extensions are
required. The harness neither starts Docker nor applies/resets migrations.

PowerShell:

```powershell
$env:RPG_TEST_DATABASE_URL = 'postgresql://postgres:password@localhost:54322/postgres'
node supabase/tests/store-concurrency.mjs
```

The variable is passed to libpq through `PGDATABASE`; it is not printed or put
on the process command line. Do not point it at production.

The harness creates random UUID fixtures in a committed setup transaction so
both authenticated worker sessions can see them. A third admin session observes
locks. For each case, worker A calls the RPC inside an open transaction; worker B
calls the same RPC while A still holds its locks. The harness requires
`pg_blocking_pids(B)` to contain A before committing A. Polling has a bounded
deadline; elapsed time alone never satisfies the barrier. If B completes without
waiting, the test fails.

- Purchases: funds cover exactly one item; expect `purchased` followed by
  `insufficient_funds`, zero balance, one delivered item, one purchase and line,
  matching price/currency snapshots and one debit ledger entry.
- Daily claims: expect `claimed` followed by `already_claimed`, exactly one item
  and seven coins added, one claim and one reward ledger entry. All weekdays are
  configured; the test fails with a rerun instruction during the last minute of
  a UTC day to avoid crossing the per-day boundary.

Every SQL statement and client wait has a timeout. On success or assertion/query
failure, `finally` terminates only the two known worker backend PIDs, then deletes
the UUID-scoped fixture rows in foreign-key order in a transaction. All psql
processes are closed. The fixture system UUID is printed before setup. Forced
process termination or loss of the admin connection can prevent cleanup; discard
the disposable test database in that case. Never rely on this harness to clean a
shared or production database.

Run the existing `014_system_store_economy.test.sql` separately with the project's
pgTAP runner for RLS and rollback checks. A syntax check (`node --check`) does not
validate SQL execution or prove the concurrency assertions pass.
