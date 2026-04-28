import { auth } from '@/app/lib/firebase';
import { IUserLoginData } from '@/app/lib/shopify';
import { User } from '@/app/schema/user.schema';
import { getSession } from '@/app/middleware/ironsession/ironsession';

export async function POST(req: Request) {
  try {
    const { token, info }: { token: FirebaseIdToken; info: IUserLoginData } =
      await req.json();
    const session = await getSession();

    // 1. Initialize/Lookup User
    let res = await User(token);

    // 2. Safe Creation Path
    if (!res.user) {
      if (!res.create) {
        throw new Error(
          'User not found and registration is unavailable. Please verify your token.',
        );
      }

      const creationResult = await res.create(info);

      res.user = creationResult.user;
    }

    // 3. Update Encrypted Session (No PII)
    session.shopifyId = res.user!.id;
    session.fuid = res.user!.fuid;
    session.isLoggedIn = true;

    await session.save(); // Encrypts and sets the cookie automatically

    return Response.json({ success: true, isLoggedIn: true, user: res.user });
  } catch (error: any) {
    console.error('[AUTH_ERROR]:', error.message);
    return Response.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 401 },
    );
  }
}

export async function GET() {
  try {
    const session = await getSession(); //

    // 1. Protection Check: If no session exists, return a clear 'logged out' state
    if (!session.isLoggedIn || !session.shopifyId) {
      return Response.json(
        { user: null, isLoggedIn: false },
        { status: 200 }, // Standard practice for session checks
      );
    }

    // 2. Data Hydration: Re-fetch the full user object using the secure ID from the cookie
    // We use the same 'User' utility to maintain parity with the POST logic
    const res = await User(session.shopifyId as string);

    // 3. Validation: Handle cases where the Shopify user might have been deleted/changed
    if (!res.user) {
      // If the ID in the cookie is no longer valid, destroy the session
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

    // 3. SLIDING WINDOW: Extend the session life
    // Calling .save() updates the cookie's 'Expires' attribute in the browser
    await session.save();

    // 4. Sanitized Return: The 'User' utility has already handled PII stripping
    // and name formatting via its internal mapping logic.
    return Response.json({
      user: res.user,
      isLoggedIn: true,
    });
  } catch (error: any) {
    console.error('[GET_AUTH_ERROR]:', error.message);
    return Response.json(
      { error: 'Failed to retrieve session data.' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const session = await getSession();

    // 1. Session Destruction: Clears the encrypted cookie from the user's browser
    session.destroy();

    // 2. Clean Return: Provide a clear state update for the frontend to consume
    return Response.json({ success: true, isLoggedIn: false }, { status: 200 });
  } catch (error: any) {
    console.error('[SIGNOUT_ERROR]:', error.message);
    return Response.json(
      { error: 'Failed to complete sign out process.' },
      { status: 500 },
    );
  }
}
