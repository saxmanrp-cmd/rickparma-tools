import landing from '../site/landing.html?raw';
export const dynamic = 'force-dynamic';
export function GET() {
  return new Response(landing, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
