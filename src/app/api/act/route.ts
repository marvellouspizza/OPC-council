import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { message, actionControl, sessionId, systemPrompt, appId } = body;

    const response = await fetch(
      `${process.env.SECONDME_API_BASE_URL}/api/secondme/act/stream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          actionControl,
          sessionId,
          systemPrompt,
          appId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Act 请求失败');
    }

    // 直接将 SSE 流转发给客户端
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Act 错误:', error);
    return new Response(
      JSON.stringify({ error: 'Act 请求失败' }),
      { status: 500 }
    );
  }
}
