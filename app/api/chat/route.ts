import { NextResponse } from 'next/server';

/**
 * The one server route in this project.
 *
 * It exists for a single reason: a Gemini API key must never reach the browser.
 * Everything else — the solver, the rules, the board — still runs entirely on
 * the client, and the app works with this route absent or unconfigured. If no
 * key is set the route says so plainly and the console falls back to its own
 * parser, so the live URL never depends on a third-party service being up.
 *
 * The model is not trusted to change anything. It may propose one command from
 * a fixed list; the browser then validates that command and runs it through the
 * same handlers the buttons use, so it still passes checkFeasible. The model
 * cannot invent a rule, bypass one, or touch anything outside this vocabulary.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** The commands the model may propose. Mirrors the typed Command in lib/console.ts. */
const COMMAND_KINDS = [
  'none', 'solve', 'clear', 'restore', 'move', 'unassign', 'sick',
  'setRule', 'loadCase', 'view', 'explain', 'whoCanTake', 'summary',
  'listBlocked', 'busiest',
] as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description:
        'The answer for the dispatcher, in plain English. Two or three sentences at most. Quote the exact times, minutes and rule names from the board rather than paraphrasing them.',
    },
    command: {
      type: 'object',
      description: 'The single action to take, or kind "none" to only answer.',
      properties: {
        kind: { type: 'string', enum: [...COMMAND_KINDS] },
        jobId: { type: 'string', description: 'A job id exactly as it appears, e.g. J13.' },
        techId: { type: 'string', description: 'A technician id exactly as it appears, e.g. T04.' },
        caseId: { type: 'string' },
        view: { type: 'string', enum: ['timeline', 'map'] },
        requireReturnHome: { type: 'boolean' },
      },
      required: ['kind'],
    },
  },
  required: ['reply', 'command'],
} as const;

const SYSTEM = `You are the assistant inside a dispatch board for a home-service company in Dhaka. A dispatcher is talking to you about today's plan.

You will be given the day: the technicians, their skills, shifts and home areas; the jobs with their areas, skills, durations and customer windows; which jobs are scheduled and which could not be, with the exact rule that blocked each; and the area-to-area travel table.

Answer from that information only. Never invent a technician, a job, a time or a rule. If the day does not tell you something, say you cannot tell from the board. Quote real figures — times as HH:MM, durations in minutes — because the dispatcher is reading the same numbers on screen.

You may also propose ONE action, by setting command.kind. Use "none" when the dispatcher only asked a question. Use ids exactly as they appear in the day, never names, for jobId and techId.

You do not decide whether an action is legal. The board checks every move against the hard rules and will refuse yours if it breaks one, so propose what the dispatcher asked for and let the board rule on it. Never claim a move succeeded — say what you are about to try.

Be brief and concrete. This is an operations tool, not a chat companion.`;

interface ChatRequest {
  message?: unknown;
  day?: unknown;
  rules?: unknown;
  history?: unknown;
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // Not an error: the app is designed to run without it.
    return NextResponse.json(
      { configured: false, reason: 'No GEMINI_API_KEY is set on the server.' },
      { status: 200 },
    );
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const day = typeof body.day === 'string' ? body.day : '';
  const rules = typeof body.rules === 'string' ? body.rules : '';
  if (!message) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
  if (message.length > 2000) {
    return NextResponse.json({ error: 'That message is too long.' }, { status: 413 });
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (h): h is { role: string; text: string } =>
            typeof h === 'object' && h !== null && typeof (h as { text?: unknown }).text === 'string',
        )
        .slice(-6)
        .map((h) => ({
          role: h.role === 'board' ? 'model' : 'user',
          parts: [{ text: String(h.text).slice(0, 2000) }],
        }))
    : [];

  try {
    const response = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          ...history,
          {
            role: 'user',
            parts: [{ text: `${rules}\n\n${day}\n\nDISPATCHER: ${message}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      // A dispatcher will not wait, and the local parser is right there.
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Gemini refused the request', response.status, detail.slice(0, 500));
      // A quota refusal is the one a demo actually hits, and it deserves its
      // own words rather than a status code. Free tiers on the small models
      // are measured in requests per minute, not per hour.
      const message =
        response.status === 429
          ? 'The assistant has hit its rate limit for the moment.'
          : response.status === 404
            ? `No model named "${MODEL}" is available to this key.`
            : `The model service answered ${response.status}.`;
      return NextResponse.json({ error: message, retryable: response.status === 429 }, { status: 502 });
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return NextResponse.json({ error: 'The model returned nothing.' }, { status: 502 });

    let parsed: { reply?: string; command?: Record<string, unknown> };
    try {
      parsed = JSON.parse(text);
    } catch {
      // Structured output should make this impossible, but a bad day upstream
      // should degrade to a plain answer rather than an error.
      return NextResponse.json({ configured: true, reply: text, command: { kind: 'none' } });
    }

    const kind = String(parsed.command?.kind ?? 'none');
    return NextResponse.json({
      configured: true,
      reply: typeof parsed.reply === 'string' ? parsed.reply : '',
      command: COMMAND_KINDS.includes(kind as (typeof COMMAND_KINDS)[number])
        ? { ...parsed.command, kind }
        : { kind: 'none' },
      model: MODEL,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'TimeoutError';
    console.error('Gemini call failed', e);
    return NextResponse.json(
      { error: aborted ? 'The model took too long to answer.' : 'Could not reach the model.' },
      { status: 504 },
    );
  }
}
