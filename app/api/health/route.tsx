import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/firebase';
import { shopifyFetch, UserQuery } from '@/app/lib/shopify';

// 1. Define the dependencies we want to check
const checkShopify = async () => {
  try {
    // 1. Provide a syntactically valid dummy phone number
    // It doesn't matter that this user doesn't exist; we only care if the query executes without a 400-level schema error.
    const testPhone = '+15555555555' as UsPhoneNumber;

    // 2. Execute the single critical auth path
    await UserQuery(testPhone);

    // 3. If it doesn't throw, the network is up, credentials are valid, and the schema matches Shopify's current API version.
    return {
      status: 'up',
      details: 'Primary Phone Auth schema validated successfully.',
    };
  } catch (error: any) {
    console.error('[SHOPIFY_HEALTH_FAILURE]:', error.message);

    return {
      status: 'down',
      error: `Auth path failure: ${error.message}`,
    };
  }
};

const checkFirebase = async () => {
  try {
    // 1. Verify Local Initialization
    if (!auth.app) {
      throw new Error('Firebase app not initialized locally');
    }

    // 2. The True Network Ping
    // Fetching just 1 user record proves the credentials work and Google's API is reachable.
    await auth.listUsers(1);

    // 3. Safe Metadata Extraction
    // Cast to any or your specific config type to safely access the options
    const options = auth.app.options as {
      projectId?: string;
      clientEmail?: string;
    };

    return {
      status: 'up',
      details: {
        appName: auth.app.name, // Usually returns "[DEFAULT]"
        projectId: options.projectId || 'unconfigured',
        clientEmail: options.clientEmail || 'unconfigured',
      },
    };
  } catch (error: any) {
    // If listUsers fails (e.g., bad private key, network timeout), this catches it.
    return {
      status: 'down',
      error: error.message,
    };
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
