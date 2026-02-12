import { cookies } from 'next/headers';
import { prisma } from './prisma';

export interface UserSession {
  id: string;
  secondmeUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  route: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}

/**
 * 获取当前登录用户
 */
export async function getCurrentUser(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_id')?.value;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return null;
  }

  // 检查 Token 是否过期
  if (user.tokenExpiresAt < new Date()) {
    // Token 过期，尝试刷新
    const refreshed = await refreshAccessToken(user.refreshToken);
    if (refreshed) {
      // 更新数据库中的 Token
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpiresAt: refreshed.expiresAt,
        },
      });
      return updatedUser;
    } else {
      // 刷新失败，清除 Cookie
      cookieStore.delete('user_id');
      return null;
    }
  }

  return user;
}

/**
 * 刷新 Access Token
 */
async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  try {
    const refreshUrl = process.env.SECONDME_TOKEN_REFRESH_ENDPOINT
      || `${process.env.SECONDME_API_BASE_URL}/api/oauth/token/refresh`;

    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.SECONDME_CLIENT_ID!,
        client_secret: process.env.SECONDME_CLIENT_SECRET!,
      }).toString(),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    const tokenData = result.data || result;
    const expiresIn = tokenData.expiresIn || tokenData.expires_in || 7200;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      accessToken: tokenData.accessToken || tokenData.access_token,
      refreshToken: tokenData.refreshToken || tokenData.refresh_token || refreshToken,
      expiresAt,
    };
  } catch (error) {
    console.error('刷新 Token 失败:', error);
    return null;
  }
}

/**
 * 用授权码换取 Access Token
 */
export async function exchangeCodeForToken(code: string) {
  const tokenUrl = process.env.SECONDME_TOKEN_ENDPOINT 
    || `${process.env.SECONDME_API_BASE_URL}/api/oauth/token/code`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.SECONDME_REDIRECT_URI!,
    client_id: process.env.SECONDME_CLIENT_ID!,
    client_secret: process.env.SECONDME_CLIENT_SECRET!,
  });

  console.log('Token exchange URL:', tokenUrl);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const responseText = await response.text();
  console.log('Token response:', response.status, responseText);

  if (!response.ok) {
    throw new Error(`Token 交换失败: ${response.status} ${responseText}`);
  }

  const result = JSON.parse(responseText);

  // SecondMe API 统一响应格式: { code: 0, data: { ... } }
  if (result.code !== undefined && result.code !== 0) {
    throw new Error(`Token error: ${result.message || 'Unknown error'}`);
  }

  // 兼容两种格式：直接返回 or data 包装
  const tokenData = result.data || result;

  console.log('Token 交换成功:', { hasAccessToken: !!tokenData.accessToken || !!tokenData.access_token });
  return {
    accessToken: tokenData.accessToken || tokenData.access_token,
    refreshToken: tokenData.refreshToken || tokenData.refresh_token,
    expiresIn: tokenData.expiresIn || tokenData.expires_in || 7200,
  };
}
