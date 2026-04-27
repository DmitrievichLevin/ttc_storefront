// /proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 Proxy implementation replacing deprecated Middleware.
 * This handles CORS and Host Header validation at the edge.
 */
export function proxy(request: NextRequest) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    const allowedHost = process.env.ALLOWED_HOST;

    // 1. Host Header Validation
    if (host !== allowedHost) {
        return new NextResponse(null, {
            status: 403,
            statusText: "Invalid Host Header"
        });
    }

    // 2. CORS Logic
    if (origin && origin !== allowedOrigin) {
        return new NextResponse(null, {
            status: 403,
            statusText: "CORS Policy: Origin Not Allowed"
        });
    }

    // 3. Preflight Handling
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': allowedOrigin || '',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    const response = NextResponse.next();
    if (allowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return response;
}

// The matcher configuration remains the same
export const config = {
    matcher: '/api/:path*',
};