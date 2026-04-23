// ════════════════════════════════════════════════════════════════════
// DEEPGRAM TRANSCRIPTION — app/api/transcribe/route.js
// Accepts audio blob via POST, returns AI-transcribed text
// Uses Deepgram Nova-2 — best-in-class speech model, SA English
// ════════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Health check
export async function GET() {
  return new Response(
    JSON.stringify({ status: 'ok', model: 'nova-2', language: 'en-ZA' }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
  );
}

// Transcribe audio
export async function POST(request) {
  const t0 = Date.now();

  if (!process.env.DEEPGRAM_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Transcription not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    const audioBuffer = await request.arrayBuffer();

    if (!audioBuffer || audioBuffer.byteLength < 100) {
      return new Response(
        JSON.stringify({ error: 'No audio received', text: '' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const contentType = request.headers.get('content-type') || 'audio/webm';

    const dgResponse = await fetch(
      'https://api.deepgram.com/v1/listen?' + new URLSearchParams({
        model: 'nova-2',
        language: 'en-ZA',
        smart_format: 'true',
        punctuate: 'true',
        diarize: 'false',
        utterances: 'false',
      }),
      {
        method: 'POST',
        headers: {
          'Authorization': 'Token ' + process.env.DEEPGRAM_API_KEY,
          'Content-Type': contentType,
        },
        body: audioBuffer,
      }
    );

    if (!dgResponse.ok) {
      const errText = await dgResponse.text();
      console.error('[Transcribe] Deepgram error:', dgResponse.status, errText);
      return new Response(
        JSON.stringify({ error: 'Transcription failed', text: '' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const result = await dgResponse.json();
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = result?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    console.log('[Transcribe] ' + (Date.now() - t0) + 'ms | ' + (audioBuffer.byteLength / 1024).toFixed(1) + 'KB | conf:' + (confidence * 100).toFixed(0) + '% | "' + transcript.slice(0, 80) + '"');

    return new Response(
      JSON.stringify({ text: transcript, confidence }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    );

  } catch (error) {
    console.error('[Transcribe] Error:', error?.message);
    return new Response(
      JSON.stringify({ error: 'Transcription error', text: '' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
}
