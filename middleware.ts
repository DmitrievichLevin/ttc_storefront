import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Parse multiple origins from a single environment variable, separated by commas.
// e.g., ALLOWED_ORIGINS="https://www.totaltreatcreation.com,https://ascertain-emote-coke.ngrok-free.dev"
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

export function middleware(request: NextRequest) {
    const origin = request.headers.get('origin') ?? '';

    // Check if the incoming request origin is in our allowed list
    const isAllowedOrigin = allowedOrigins.includes(origin);

    // 1. Preflight (OPTIONS) Handling
    if (request.method === 'OPTIONS') {
        const preflightHeaders = {
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Shopify-Storefront-Access-Token',
            'Access-Control-Max-Age': '86400', // Cache preflight response for 24 hours
        };

        if (isAllowedOrigin) {
            return NextResponse.json({}, {
                status: 200,
                headers: {
                    ...preflightHeaders,
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Credentials': 'true',
                }
            });
        }

        // Deny preflight if origin doesn't match
        return NextResponse.json({}, { status: 403, headers: preflightHeaders });
    }

    // 2. Standard Request CORS Logic
    // Only block if an origin is present (browsers) and it's not allowed.
    // (Direct server-to-server calls often lack an origin header).
    if (origin && !isAllowedOrigin) {
        return new NextResponse(null, {
            status: 403,
            statusText: "Forbidden: CORS Policy Origin Not Allowed",
        });
    }

    // 3. Proceed with request and append standard CORS headers
    const response = NextResponse.next();

    if (isAllowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    // Optional: Add strict transport security or other baseline security headers here
    response.headers.set('X-Content-Type-Options', 'nosniff');

    return response;
}

export const config = {
    matcher: '/api/:path*',
};