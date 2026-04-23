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

export async function GET() {
  return new Response(
    JSON.stringify({ status: 'ok', model: 'nova-2', language: 'en-ZA' }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
  );
}

export async function POST(request) {
  const t0 = Date.now();

  if (!process.env.DEEPGRAM_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Transcription not configured', text: '' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    // Get raw audio bytes
    const audioBuffer = await request.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    if (audioBytes.length < 100) {
      return new Response(
        JSON.stringify({ error: 'No audio received', text: '' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    console.log('[Transcribe] Received ' + (audioBytes.length / 1024).toFixed(1) + 'KB audio');

    // Deepgram auto-detects format — use generic content type
    // This avoids issues with browser-specific MIME types like audio/webm;codecs=opus
    const dgUrl = 'https://api.deepgram.com/v1/listen?'
      + 'model=nova-2'
      + '&language=en-ZA'
      + '&smart_format=true'
      + '&punctuate=true'
      + '&detect_language=false';

    const dgResponse = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + process.env.DEEPGRAM_API_KEY,
        'Content-Type': 'audio/webm',
      },
      body: audioBytes,
    });

    if (!dgResponse.ok) {
      const errBody = await dgResponse.text();
      console.error('[Transcribe] Deepgram HTTP ' + dgResponse.status + ': ' + errBody.slice(0, 300));

      // If 401/403 — key issue
      if (dgResponse.status === 401 || dgResponse.status === 403) {
        return new Response(
          JSON.stringify({ error: 'API key invalid — contact support', text: '' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Transcription failed', text: '' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const result = await dgResponse.json();
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = result?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    console.log('[Transcribe] ' + (Date.now() - t0) + 'ms | conf:' + (confidence * 100).toFixed(0) + '% | "' + transcript.slice(0, 80) + '"');

    return new Response(
      JSON.stringify({ text: transcript, confidence }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    );

  } catch (error) {
    console.error('[Transcribe] Exception: ' + (error?.message || 'unknown'));
    return new Response(
      JSON.stringify({ error: 'Transcription error', text: '' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
}
