// ════════════════════════════════════════════════════════════════════
// DEEPGRAM TRANSCRIPTION — app/api/transcribe/route.js
// Accepts audio blob via POST, returns AI-transcribed text
// Uses Deepgram Nova-2 — SA English
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
  // Quick key validation check
  const hasKey = !!process.env.DEEPGRAM_API_KEY;
  const keyLen = (process.env.DEEPGRAM_API_KEY || '').length;
  return new Response(
    JSON.stringify({ status: hasKey ? 'ok' : 'no_key', model: 'nova-2', language: 'en', keyLength: keyLen }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
  );
}

export async function POST(request) {
  const t0 = Date.now();
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'No Deepgram key configured', text: '' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    const audioBuffer = await request.arrayBuffer();
    const size = audioBuffer.byteLength;

    if (size < 100) {
      return new Response(
        JSON.stringify({ error: 'Recording too short', text: '' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const dgUrl = 'https://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&punctuate=true';

    const dgResponse = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Content-Type': 'audio/webm',
      },
      body: new Uint8Array(audioBuffer),
    });

    const dgBody = await dgResponse.text();

    if (!dgResponse.ok) {
      // Return the EXACT Deepgram error to the user for debugging
      console.error('[Transcribe] Deepgram ' + dgResponse.status + ': ' + dgBody.slice(0, 500));
      return new Response(
        JSON.stringify({
          error: 'Deepgram error ' + dgResponse.status + ': ' + (dgBody.slice(0, 100)),
          text: '',
          status: dgResponse.status
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Parse successful response
    let result;
    try {
      result = JSON.parse(dgBody);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid response from Deepgram', text: '' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = result?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    return new Response(
      JSON.stringify({ text: transcript, confidence }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    );

  } catch (error) {
    console.error('[Transcribe] Exception: ' + (error?.message || 'unknown'));
    return new Response(
      JSON.stringify({ error: 'Server error: ' + (error?.message || 'unknown'), text: '' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
}
