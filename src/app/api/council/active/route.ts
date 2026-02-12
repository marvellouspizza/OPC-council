/**
 * 活跃议会 API
 * GET /api/council/active - 获取用户当前正在进行的议会
 * DELETE /api/council/active - 终止当前议会
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
    // 查找用户当前活跃的会议
    const activeSession = await prisma.councilSession.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        logs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    return new Response(JSON.stringify({ session: activeSession }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('获取活跃议会失败:', error);
    return new Response(
      JSON.stringify({ error: '获取活跃议会失败' }),
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  try {
    // 查找并终止用户当前活跃的会议
    const activeSession = await prisma.councilSession.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!activeSession) {
      return new Response(
        JSON.stringify({ error: '没有正在进行的议会' }),
        { status: 404 }
      );
    }

    // 更新会议状态为已取消
    const cancelledSession = await prisma.councilSession.update({
      where: {
        id: activeSession.id,
      },
      data: {
        status: 'CANCELLED',
      },
    });

    return new Response(
      JSON.stringify({
        message: '议会已终止',
        session: cancelledSession,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('终止议会失败:', error);
    return new Response(
      JSON.stringify({ error: '终止议会失败' }),
      { status: 500 }
    );
  }
}
