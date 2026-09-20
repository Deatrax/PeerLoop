import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runJob } from "../../../../lib/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> },
) {
  const expected = process.env.CRON_SECRET ?? "";
  const supplied =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ??
    req.headers.get("CRON_SECRET") ??
    "";
  if (
    !expected ||
    Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { job } = await params;
  if (
    ![
      "escalation-tick",
      "digest-builder",
      "knowledge-staleness",
      "score-recompute",
      "metrics-rollup",
    ].includes(job)
  )
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  try {
    return NextResponse.json(await runJob(job));
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Job failed; inspect server logs." },
      { status: 503 },
    );
  }
}
export const POST = handler;
export const GET = handler;
