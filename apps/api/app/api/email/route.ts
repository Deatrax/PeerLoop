import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
export const runtime = 'nodejs';

// Adapter for EMAIL_WEBHOOK_URL. PeerLoop posts {to, subject, text} to whatever URL that
// variable names; this route adapts that to Resend so no email SDK enters the codebase and
// swapping provider means editing one file. Point EMAIL_WEBHOOK_URL at this route.
export async function POST(req: NextRequest) {
  const expected = process.env.EMAIL_WEBHOOK_SECRET ?? '';
  const supplied = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  // Without a secret this is an open relay, so an unset secret fails closed.
  if (
    !expected ||
    Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 503 });

  const { to, subject, text } = (await req.json()) as { to?: string; subject?: string; text?: string };
  if (!to || !subject || !text) return NextResponse.json({ error: 'to, subject and text are required' }, { status: 400 });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    // resend.dev needs no domain verification but only delivers to your own Resend signup
    // address. Set RESEND_FROM to an address on a domain you have verified for real users.
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? 'PeerLoop <onboarding@resend.dev>', to: [to], subject, text }),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await response.json()) as { id?: string; message?: string };
  if (!response.ok)
    return NextResponse.json({ error: body.message ?? `Resend returned ${response.status}` }, { status: 502 });
  return NextResponse.json({ id: body.id });
}
