import { SessionOptions, getIronSession } from "iron-session";
import { cookies } from "next/headers";

// 1. Remove PII from the Interface
export interface SessionData {
    shopifyId: string | null; // Just the ID
    fuid: string | null;      // Just the ID
    isLoggedIn: boolean;
    // Store non-PII preferences only
    fulfillment_type?: 'pickup' | 'delivery' | 'catering';
};

export const defaultSession: SessionData = {
    shopifyId: null,
    fuid: null,
    isLoggedIn: false,
};

export const sessionOptions: SessionOptions = {
    password: process.env.SESSION_SECRET as string,
    cookieName: "secure-app-session",
    cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict", // CSRF Protection
        httpOnly: true,     // XSS Protection
        maxAge: 60 * 60 * 24 * 7,
    },
};

// Helper to get session in App Router
export async function getSession() {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.isLoggedIn) {
        Object.assign(session, defaultSession);
    }
    return session;
}


