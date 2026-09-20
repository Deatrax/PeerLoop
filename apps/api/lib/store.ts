import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@peerloop/core";
import { database } from "../db/client";
export const tableOrder: (keyof Database)[] = [
  "users",
  "spaces",
  "org_memberships",
  "space_memberships",
  "escalation_policies",
  "requests",
  "request_events",
  "request_recipients",
  "messages",
  "knowledge_items",
  "approval_tasks",
  "notifications",
  "agent_runs",
];
const keys: Partial<Record<keyof Database, string[]>> = {
  org_memberships: ["user_id", "org_id"],
  request_recipients: ["request_id", "user_id"],
};
type Row = Record<string, unknown>;
export interface StoreConnection { transaction<T>(operation:(tx:{execute(query:SQL):Promise<Row[]>})=>Promise<T>):Promise<T> }
export interface StoreScope { space_id: string; user_id: string }
// Resolve only operations whose entire mutation is confined to one course.
// Imports, moves, user settings and department operations take the exclusive fallback.
export async function requestScope(path: string, body: unknown, user_id: string): Promise<StoreScope | undefined> {
  const p = path.replace(/^\/api\/v1\//, "").split("?")[0].split("/");
  if (p[0] === "spaces" && p.length >= 3 && !["members", "join-code"].includes(p[2])) return {space_id:p[1], user_id};
  if (p[0] === "requests" && p.length === 1 && body && typeof body === "object" && "space_id" in body && typeof body.space_id === "string") return {space_id:body.space_id, user_id};
  const table = p[0] === "requests" ? "requests" : p[0] === "knowledge" ? "knowledge_items" : p[0] === "approvals" ? "approval_tasks" : null;
  if (!table || !p[1] || p[2] === "move") return;
  const rows = await database().execute(sql`select space_id from ${sql.identifier(table)} where id=${p[1]}`);
  return rows[0] ? {space_id:String(rows[0].space_id), user_id} : undefined;
}
export function scopePredicate(table: keyof Database, scope: StoreScope) {
  const {space_id:sid,user_id:uid}=scope;
  if (table === "spaces") return sql`t.id=${sid}`;
  if (table === "users") return sql`t.id=${uid} or t.id in (select user_id from space_memberships where space_id=${sid}) or t.id in (select user_id from org_memberships where org_id in (select org_id from spaces where id=${sid}))`;
  if (table === "org_memberships") return sql`t.user_id=${uid} or t.org_id in (select org_id from spaces where id=${sid})`;
  if (table === "requests") return sql`t.space_id=${sid} or t.author_id=${uid}`;
  if (["request_events","request_recipients","agent_runs"].includes(table)) return sql`t.request_id in (select id from requests where space_id=${sid})`;
  if (table === "messages") return sql`t.author_id=${uid} or t.request_id in (select id from requests where space_id=${sid})`;
  return sql`t.space_id=${sid}`;
}
export async function transact<T>(
  operation: (state: Database) => Promise<T> | T,
  options: { cron?: boolean; reset?: Database; scope?: StoreScope } = {},
  db: StoreConnection = database(),
): Promise<T> {
  return db.transaction(async (tx) => {
    const scope = options.reset ? undefined : options.scope;
    if (scope) {
      await tx.execute(sql`select pg_advisory_xact_lock_shared(47904712)`);
      await tx.execute(sql`select pg_advisory_xact_lock(4790,hashtext(${scope.space_id}))`);
      // User locks also protect per-person quotas and shared profile fields across hubs.
      await tx.execute(sql`select t.id from users t where ${scopePredicate("users",scope)} order by t.id for update`);
    } else await tx.execute(sql`select pg_advisory_xact_lock(47904712)`);
    if (options.cron)
      await tx.execute(
        sql`select id from requests where next_escalation_at <= now() and state in ('ROUTED','ESCALATED','IN_PROGRESS') order by next_escalation_at limit 200 for update skip locked`,
      );
    const raw: Record<string, unknown> = {};
    for (const table of tableOrder) {
      const rows = await tx.execute(
        sql`select row_to_json(t) as row from ${sql.identifier(table)} t ${scope ? sql`where ${scopePredicate(table,scope)}` : sql``}`,
      );
      raw[table] = rows.map((r) => r.row);
    }
    // PostgreSQL JSON serialization boundary: schema.ts defines the stored shapes.
    const before = raw as unknown as Database;
    const state =
      options.reset ?? (JSON.parse(JSON.stringify(before)) as Database);
    const result = await operation(state);
    if (options.reset)
      await tx.execute(
        sql`truncate table ${sql.join(
          [...tableOrder].reverse().map((t) => sql.identifier(t)),
          sql`, `,
        )} cascade`,
      );
    for (const table of tableOrder) {
      const pk = keys[table] ?? ["id"];
      const oldRows = before[table] as unknown as Row[];
      const index = new Map(oldRows.map(row => [JSON.stringify(pk.map(k => row[k])), row]));
      const rows = state[table] as unknown as Row[];
      for (const row of rows) {
        const old = options.reset
          ? undefined
          : index.get(JSON.stringify(pk.map(k => row[k])));
        if (old && JSON.stringify(old) === JSON.stringify(row)) continue;
        if (old && (table === "request_events" || table === "agent_runs"))
          throw new Error("Audit records are append-only.");
        const cols = Object.keys(row);
        const conflict = pk.map((k) => sql.identifier(k));
        const update = cols
          .filter((c) => !pk.includes(c) && (!old || JSON.stringify(old[c]) !== JSON.stringify(row[c])))
          .map(
            (c) => sql`${sql.identifier(c)} = excluded.${sql.identifier(c)}`,
          );
        // json_populate_record delegates JSON/date conversion to the actual table types.
        const tail =
          table === "request_events" || table === "agent_runs"
            ? sql`do nothing`
            : sql`do update set ${sql.join(update, sql`, `)}`;
        await tx.execute(
          sql`insert into ${sql.identifier(table)} (${sql.join(
            cols.map((c) => sql.identifier(c)),
            sql`, `,
          )}) select ${sql.join(
            cols.map((c) => sql.identifier(c)),
            sql`, `,
          )} from json_populate_record(null::${sql.identifier(table)}, ${JSON.stringify(row)}::json) on conflict (${sql.join(conflict, sql`, `)}) ${tail}`,
        );
      }
    }
    return result;
  });
}
