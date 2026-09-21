import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { seedDatabase, Engine, type Database } from "@peerloop/core";
import { tableOrder, transact, type StoreConnection } from "../lib/store";
import { PgDialect } from 'drizzle-orm/pg-core';
import { metricsRollupSQL } from '../lib/metrics';
test("PostgreSQL migration accepts seed, constraints and real pipeline rows", async () => {
  const pg = new PGlite();
  const migrations = new URL("../db/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
  const state = seedDatabase(Date.parse("2026-09-20T06:00:00Z"));
  for (const table of tableOrder)
    for (const row of state[table]) {
      const columns=Object.keys(row).map(k=>`"${k}"`).join(',');
      await pg.query(
        `insert into "${table}" (${columns}) select ${columns} from json_populate_record(null::"${table}",$1::json)`,
        [JSON.stringify(row)],
      );
    }
  const result = await pg.query<{ count: number }>(
    "select count(*)::int as count from space_memberships where space_id=$1",
    ["cse4790"],
  );
  assert.equal(result.rows[0].count, 38);
  const loaded: Record<string, unknown> = {};
  for (const table of tableOrder)
    loaded[table] = (
      await pg.query<{ row: unknown }>(
        `select row_to_json(t) as row from "${table}" t`,
      )
    ).rows.map((r) => r.row);
  const e = new Engine(loaded as unknown as Database, {
    user_id: "arisha",
    now: Date.parse("2026-09-20T06:00:00Z"),
  });
  const answer = await e.create({
    space_id: "cse4790",
    body_text: "Does anyone have the CSE 4790 Week 6 slides?",
  });
  assert.equal(answer.agent_outcome, "SERVE");
  await pg.query(
    "insert into requests select * from json_populate_record(null::requests,$1::json)",
    [JSON.stringify(answer.request)],
  );
  await assert.rejects(
    () =>
      pg.query(
        "insert into request_events select * from json_populate_record(null::request_events,$1::json)",
        [JSON.stringify(state.request_events[0])],
      ),
    /duplicate key/,
  );
  await assert.rejects(
    () =>
      pg.query(
        "insert into org_memberships(user_id,org_id,role) values('missing-user','iut-cse','DEPT_ADMIN')",
      ),
    /foreign key/,
  );
  const dialect=new PgDialect();
  const connection:StoreConnection={transaction:operation=>pg.transaction(tx=>operation({execute:async query=>{const compiled=dialect.sqlToQuery(query);return (await tx.query<Record<string,unknown>>(compiled.sql,compiled.params)).rows;}}))};
  await transact(async state=>{
    assert.ok(state.spaces.every(s=>s.id==='cse4790'));
    assert.ok(state.knowledge_items.every(k=>k.space_id==='cse4790'));
    const engine=new Engine(state,{user_id:'arisha',now:Date.parse('2026-09-20T06:00:00Z')});
    await engine.create({space_id:'cse4790',body_text:'How does orbital titanium scheduling work?',reject_knowledge:true});
  },{scope:{space_id:'cse4790',user_id:'arisha'}},connection);
  // PENDING isolates what this pipeline run queued from the seed's already-delivered inbox rows.
  assert.equal((await pg.query<{count:number}>(`select count(*)::int as count from notifications where attempts=0 and delivery_state='PENDING'`)).rows[0].count,10);
  await assert.rejects(()=>transact(state=>{state.request_events[0].reason='changed';},{},connection),/append-only/);
  const compiled=dialect.sqlToQuery(metricsRollupSQL);
  await pg.query(compiled.sql,compiled.params);
  const metrics=await pg.query<{requests_created:number}>('select requests_created from metrics_daily');
  assert.ok(metrics.rows.length>0);
  await pg.query(compiled.sql,compiled.params);
  assert.equal((await pg.query('select * from metrics_daily')).rows.length,metrics.rows.length);
  await pg.close();
});
