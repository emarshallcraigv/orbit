# Local-Postgres tests

Tests that need a **real PostgreSQL** — trigger + foreign-key **cascade ordering**,
which depends on Postgres internals an emulator won't reproduce faithfully. These
are deliberately **separate** from the Supabase-backed suite (`npm run
test:integration`): they run against a throwaway local Postgres, touch no live data,
and need no Supabase credentials.

## Run

```bash
cd tests/local-pg
./run.sh
```

`run.sh` downloads a self-contained PostgreSQL 16.2 binary (zonky
embedded-postgres) into a gitignored `.pgcache/` on first run, inits a throwaway
data dir, starts the server on `127.0.0.1:5433`, runs `node --test`, and stops it.
Requires `node`/`npm` on `PATH` (this repo has no system Node — put the project-local
Node on `PATH` first).

## What's covered

- **`cascade_last_owner.test.mjs`** — the `enforce_last_owner` trigger from
  migration `0020`, on a minimal `practices`/`profiles` schema mirroring the real
  `ON DELETE CASCADE`:
  - hard-deleting a **single-owner** practice cascades through **without** the
    trigger raising (the `not exists (…practices…)` guard sees the parent already
    gone mid-cascade) — the subtle ordering case;
  - demoting the **sole owner** while the practice exists is **blocked**;
  - with **two owners**, demoting one is allowed and cascade-delete removes both.

Why not in `test:integration`? Confirming this on the live DB would need a
`service_role` hard-delete of a practice (tenants can't `DELETE practices`), and it
tests Postgres mechanics, not tenant RLS — so a local Postgres is both sufficient
and safer.
