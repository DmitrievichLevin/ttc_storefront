import { auth } from '@/app/lib/firebase';
import { IUserLoginData } from '@/app/lib/shopify';
import { User } from '@/app/schema/user.schema';
import { getSession } from '@/app/middleware/ironsession/ironsession';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Input Validation
    if (!body?.token) {
      return Response.json(
        { error: 'Missing authentication token.' },
        { status: 400 },
      );
    }

    const { token, info } = body;
    let session = await getSession();

    // 2. Initialize/Lookup User
    const res = await User(token);

    // 3. Safe Creation Path
    if (!res.user) {
      if (!res.create) {
        throw new Error('User not found and registration is unavailable.');
      }
      const creationResult = await res.create(info);
      res.user = creationResult.user;
    }

    // 4. SESSION BLEED PREVENTION
    // Explicitly destroy any existing dirty session before writing a new one.
    // This ensures no leftover preferences (like fulfillment_type) from a previous user bleed into this session.
    session.destroy();

    // Grab a fresh, clean session object after the destruction
    session = await getSession();

    // 5. Update Encrypted Session
    session.shopifyId = res.user!.id;
    session.fuid = res.user!.fuid;
    session.isLoggedIn = true;

    await session.save();

    return Response.json(
      { success: true, isLoggedIn: true, user: res.user },
      { status: 200 },
    );
  } catch (error: any) {
    // Log the real error to the server console, but return a safe generic error to the client
    console.error('[AUTH_POST_ERROR]:', error.message || error);
    return Response.json(
      {
        error:
          'Authentication failed. Please check your credentials and try again.',
      },
      { status: 401 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const session = await getSession();

    // 1. Protection Check
    if (!session.isLoggedIn || !session.shopifyId) {
      return Response.json({ user: null, isLoggedIn: false }, { status: 200 });
    }

    // 2. Data Hydration
    const res = await User(session.shopifyId as string);

    // 3. ZOMBIE SESSION FIX
    // The user has a cookie, but Shopify says they don't exist (deleted in Admin).
    if (!res.user) {
      console.warn(
        `[AUTH_WARN]: Zombie session detected for ID ${session.shopifyId}. Wiping session.`,
      );

      // Explicitly wipe the cookie from the browser
      session.destroy();

      return Response.json(
        {
          user: null,
          isLoggedIn: false,
          error: 'Session invalid or user not found.',
        },
        { status: 401 },
      );
    }

    // 4. Sliding Window: Extend the session life
    await session.save();

    return Response.json({ user: res.user, isLoggedIn: true }, { status: 200 });
  } catch (error: any) {
    console.error('[AUTH_GET_ERROR]:', error.message || error);

    // CRITICAL: Do NOT destroy the session here!
    // If the Shopify API times out or your server loses internet connection, you don't want to log every user out.
    return Response.json(
      { error: 'Failed to retrieve session data. Please try again later.' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const session = await getSession();

    // 1. Session Destruction
    session.destroy();

    return Response.json({ success: true, isLoggedIn: false }, { status: 200 });
  } catch (error: any) {
    console.error('[AUTH_DELETE_ERROR]:', error.message || error);
    return Response.json(
      { error: 'Failed to complete sign out process.' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();

    // 1. Protection Check
    if (!session.isLoggedIn || !session.shopifyId) {
      return Response.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 },
      );
    }

    const body = await req.json();

    // 2. Construct Payload Securely
    // Forcibly inject the session ID so malicious users cannot send a different ID in the payload
    const updatePayload = {
      ...body,
      id: session.shopifyId,
    };

    // 3. Execute Dynamic Update
    await User.update(updatePayload);

    // 4. Data Parity
    const res = await User(session.shopifyId as string);

    // Edge case: If the update somehow deleted them or they vanished during the network request
    if (!res.user) {
      session.destroy();
      throw new Error('User profile could not be resolved after update.');
    }

    return Response.json({ success: true, user: res.user }, { status: 200 });
  } catch (error: any) {
    console.error('[AUTH_PATCH_ERROR]:', error.message || error);

    // 5. SAFE ERROR MASKING
    // Shopify GraphQL schema errors are highly technical. We intercept known ones to make them user-friendly,
    // and mask unknown ones so we don't leak database logic to the frontend.
    const rawMessage = error.message?.toLowerCase() || '';
    let clientMessage =
      'Failed to update user profile. Please check your inputs.';

    if (rawMessage.includes('already exists')) {
      clientMessage = 'This address already exists in your account.';
    } else if (rawMessage.includes('zip') || rawMessage.includes('postal')) {
      clientMessage = 'The zip code provided is invalid for that region.';
    }

    return Response.json({ error: clientMessage }, { status: 500 });
  }
}
