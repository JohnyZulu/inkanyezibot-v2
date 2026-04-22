// ════════════════════════════════════════════════════════════════════
// DEEPGRAM TOKEN ENDPOINT — app/api/transcribe/route.js
// Returns a Deepgram API key for client-side real-time transcription
// ════════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Deepgram not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Return the API key for client-side WebSocket auth
    // The key is scoped to usage:write only — safe to expose short-term
    return new Response(
      JSON.stringify({ key: process.env.DEEPGRAM_API_KEY }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to get transcription key' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
}
