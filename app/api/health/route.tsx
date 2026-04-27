import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/firebase';
import { shopifyFetch } from '@/app/lib/shopify';

// 1. Define the dependencies we want to check
const checkShopify = async () => {
  try {
    // A minimal, low-cost query to verify API connectivity
    await shopifyFetch({ query: '{ shop { name } }' });
    return { status: 'up' };
  } catch (error: any) {
    return { status: 'down', error: error.message };
  }
};

const checkFirebase = async () => {
  try {
    // Verifying if the singleton is initialized and reachable
    if (!auth.app) throw new Error('Firebase app not initialized');
    return { status: 'up' };
  } catch (error: any) {
    return { status: 'down', error: error.message };
  }
};

export async function GET() {
  const start = Date.now();

  // Run checks in parallel to keep the health check fast
  const [shopify, firebase] = await Promise.all([
    checkShopify(),
    checkFirebase(),
  ]);

  const durationMs = Date.now() - start;
  const isSystemHealthy = shopify.status === 'up' && firebase.status === 'up';

  const healthData = {
    status: isSystemHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(), // Seconds since server started
    latency_ms: durationMs,
    services: {
      shopify,
      firebase,
    },
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    env: process.env.NODE_ENV,
  };

  // 2. Return 503 if the system is functionally broken
  if (!isSystemHealthy) {
    console.error('[HEALTH_CHECK_FAILURE]:', healthData);
    return NextResponse.json(healthData, { status: 503 });
  }

  return NextResponse.json(healthData, { status: 200 });
}

// 3. Prevent Next.js from caching the health check
export const dynamic = 'force-dynamic';
