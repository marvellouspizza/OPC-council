import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const redirectWithStateClear = (url: URL) => {
    const response = NextResponse.redirect(url);
    response.cookies.delete('oauth_state');
    return response;
  };

  console.log('OAuth callback:', { code: code?.slice(0, 10) + '...', state, error });

  if (error) {
    console.error('OAuth error from provider:', error);
    return redirectWithStateClear(new URL(`/?error=${error}`, request.url));
  }

  if (!code) {
    return redirectWithStateClear(new URL('/?error=no_code', request.url));
  }

  // 验证 state（防 CSRF）
  const cookieStore = await cookies();
  const savedState = cookieStore.get('oauth_state')?.value;
  if (savedState && state && savedState !== state) {
    console.error('State mismatch:', { savedState, state });
    return redirectWithStateClear(new URL('/?error=state_mismatch', request.url));
  }

  try {
    // 用授权码换取 Token
    console.log('Exchanging code for token...');
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code);
    console.log('Token exchange success:', { hasAccessToken: !!accessToken, expiresIn });
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // 获取用户信息
    const userInfoUrl = `${process.env.SECONDME_API_BASE_URL}/api/secondme/user/info`;
    console.log('Fetching user info from:', userInfoUrl);

    const userInfoResponse = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userInfoText = await userInfoResponse.text();
    console.log('User info response:', userInfoResponse.status, userInfoText.slice(0, 200));

    if (!userInfoResponse.ok) {
      throw new Error(`获取用户信息失败: ${userInfoResponse.status} ${userInfoText}`);
    }

    const userInfoResult = JSON.parse(userInfoText);

    // 提取 data 字段
    if (userInfoResult.code !== undefined && userInfoResult.code !== 0) {
      throw new Error(`获取用户信息失败: ${userInfoResult.message}`);
    }

    const userInfo = userInfoResult.data || userInfoResult;
    const secondmeUserId = userInfo.userId || userInfo.id;
    console.log('User info:', { id: secondmeUserId, name: userInfo.name, email: userInfo.email });

    if (!secondmeUserId) {
      throw new Error('用户信息缺少 userId');
    }

    // 存储或更新用户信息
    const user = await prisma.user.upsert({
      where: { secondmeUserId: String(secondmeUserId) },
      update: {
        email: userInfo.email || '',
        name: userInfo.name || userInfo.nickname || 'User',
        avatarUrl: userInfo.avatarUrl || userInfo.avatar || null,
        route: userInfo.route || null,
        accessToken,
        refreshToken: refreshToken || '',
        tokenExpiresAt,
      },
      create: {
        secondmeUserId: String(secondmeUserId),
        email: userInfo.email || '',
        name: userInfo.name || userInfo.nickname || 'User',
        avatarUrl: userInfo.avatarUrl || userInfo.avatar || null,
        route: userInfo.route || null,
        accessToken,
        refreshToken: refreshToken || '',
        tokenExpiresAt,
      },
    });

    console.log('User upserted:', user.id);

    // 设置 Cookie
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 天
    });
    response.cookies.delete('oauth_state');

    return response;
  } catch (error) {
    console.error('OAuth 回调错误:', error);
    return redirectWithStateClear(
      new URL(`/?error=callback_failed&detail=${encodeURIComponent(String(error))}`, request.url)
    );
  }
}
