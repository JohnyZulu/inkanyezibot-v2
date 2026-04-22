const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  if (!process.env.DEEPGRAM_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Deepgram not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
  return new Response(
    JSON.stringify({ key: process.env.DEEPGRAM_API_KEY }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
  );
}
