import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: isSupabaseConfigured() ? 'configured' : 'not configured',
  });
}
