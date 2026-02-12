/**
 * 议会历史记录 API
 * GET /api/council/history - 获取用户的历史议会记录
 */

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  try {
    // 获取用户所有已完成或取消的会议记录
    const sessions = await prisma.councilSession.findMany({
      where: {
        userId: user.id,
        status: {
          in: ['COMPLETED', 'CANCELLED'],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 50, // 最多返回50条
      include: {
        logs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    return new Response(JSON.stringify({ sessions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    return new Response(
      JSON.stringify({ error: '获取历史记录失败' }),
      { status: 500 }
    );
  }
}
