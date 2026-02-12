/**
 * GET /api/user/session - 获取当前用户会话信息（包括 accessToken）
 */

import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: '未登录' }, { status: 401 });
  }

  return Response.json({
    code: 0,
    data: {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      accessToken: user.accessToken,
      tokenExpiresAt: user.tokenExpiresAt,
    },
  });
}
