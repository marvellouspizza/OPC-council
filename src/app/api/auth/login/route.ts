import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();

  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
  });

  const params = new URLSearchParams({
    client_id: process.env.SECONDME_CLIENT_ID!,
    redirect_uri: process.env.SECONDME_REDIRECT_URI!,
    response_type: 'code',
    scope: 'user.info user.info.shades user.info.softmemory chat note.add',
    state,
  });

  const authUrl = `${process.env.SECONDME_AUTH_URL}/?${params}`;
  console.log('Auth URL:', authUrl);
  return NextResponse.redirect(authUrl);
}
