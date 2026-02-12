/**
 * Silent Council - 议会 API 路由 v3
 * POST /api/council - 发起议会讨论，返回 SSE 流式响应
 * 4代理·Token经济·Escrow
 */

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { runCouncilSession, encodeSSE } from '@/lib/council/orchestrator';
import type { CouncilLogEntry, UserProfile, TokenAllocation } from '@/lib/council/types';
import { DEFAULT_TOKEN_ALLOCATION } from '@/lib/council/types';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      trigger,
      templateId = 'balanced-life',
      userProfile,
      tokenAllocation,
      scheduleBlocks, // 接收日程任务列表
    } = body;

    if (!trigger) {
      return new Response(
        JSON.stringify({ error: '请提供议题 (trigger)' }),
        { status: 400 }
      );
    }

    const profile: UserProfile = userProfile || {
      professionCategory: 'mid',
      rigidityCoefficient: 0.5,
      moodState: 'flow',
      energyLevel: 80,
      hobbies: [],
      moodScore: 5,
      tokenBudgetPerHour: 10000,
    };

    const alloc: TokenAllocation = tokenAllocation || DEFAULT_TOKEN_ALLOCATION;

    // 先检查是否有活跃的会议
    const existingSession = await prisma.councilSession.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 如果有活跃会议，先关闭它
    if (existingSession) {
      await prisma.async (log: CouncilLogEntry) => {
              const eventData = formatSSEEvent(log);
              controller.enqueue(encoder.encode(eventData));
              
              // 同时保存日志到数据库
              await prisma.councilLog.create({
                data: {
                  sessionId: councilSession.id,
                  agentId: log.agentId,
                  type: log.type,
                  content: log.content,
                  internalState: log.internalState as any,
                  metadata: log.metadata as any,
                  timestamp: log.timestamp,
                },
              }).catch(err => {
                console.error('保存日志失败:', err);
              }
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });
    }

    // 创建新的议会会话记录
    const councilSession = await prisma.councilSession.create({
      data: {
        userId: user.id,
        templateId,
        trigger,
        status: 'ACTIVE',
        userProfileSnapshot: profile,
      },
    });

    // 创建 SSE 流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await runCouncilSession({
            maxRounds: 25,  // 提高上限，给AI充分博弈时间
            templateId,
            userProfile: profile,
            tokenAllocation: alloc,
            trigger,
            accessToken: user.accessToken,
            scheduleBlocks: scheduleBlocks || [], // 传递日程任务
            onLog: async (log: CouncilLogEntry) => {
              const eventData = formatSSEEvent(log);
              controller.enqueue(encoder.encode(eventData));
              
              // 同时保存日志到数据库
              await prisma.councilLog.create({
                data: {
                  sessionId: councilSession.id,
                  agentId: log.agentId,
                  type: log.type,
                  content: log.content,
                  internalState: log.internalState as any,
                  metadata: log.metadata as any,
                  timestamp: log.timestamp,
                },
              }).catch(err => {
                console.error('保存日志失败:', err);
              });
            },
          });

          // Send verdict
          const verdictEvent = `event: verdict\ndata: ${JSON.stringify(result.verdict)}\n\n`;
          controller.enqueue(encoder.encode(verdictEvent));

          // Send result card (设计文档 §7: 终极优化报告)
          const resultCardEvent = `event: resultcard\ndata: ${JSON.stringify(result.resultCard)}\n\n`;
          controller.enqueue(encoder.encode(resultCardEvent));

          // §8: 更新 Agent 权重（基于 Token 投入）
          if (result.resultCard?.tasks) {
            // Token统计已统一在orchestrator中处理
            console.log('📊 议会完成，任务数:', result.resultCard.tasks.length);
          }

          // 更新会议状态为已完成，保存结果
          await prisma.councilSession.update({
            where: { id: councilSession.id },
            data: {
              status: 'COMPLETED',
              finalVerdict: result.verdict as any,
              resultCard: result.resultCard as any,
              roundNumber: result.verdict?.roundNumber || 0,
            },
          });

          controller.enqueue(encoder.encode('event: done\ndata: [DONE]\n\n'));
        } catch (error) {
          console.error('议会运行错误:', error);
          
          // 标记会议为取消状态
          await prisma.councilSession.update({
            where: { id: councilSession.id },
            data: {
              status: 'CANCELLED',
            },
          }).catch(err => console.error('更新会议状态失败:', err));
          
          const errorEvent = formatSSEEvent({
            id: `err_${Date.now()}`,
            agentId: null,
            type: 'SYSTEM',
            content: `议会运行出错: ${error instanceof Error ? error.message : '未知错误'}`,
            timestamp: new Date(),
          });
          controller.enqueue(encoder.encode(errorEvent));
          controller.enqueue(encoder.encode('event: done\ndata: [DONE]\n\n'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('议会 API 错误:', error);
    return new Response(
      JSON.stringify({ error: '议会请求失败' }),
      { status: 500 }
    );
  }
}

/** 将日志条目格式化为 SSE 事件 */
function formatSSEEvent(log: CouncilLogEntry): string {
  const eventType = log.type.toLowerCase();
  const data = JSON.stringify({
    id: log.id,
    agentId: log.agentId,
    type: log.type,
    content: log.content,
    internalState: log.internalState,
    metadata: log.metadata,
    timestamp: log.timestamp.toISOString(),
  });
  return `event: ${eventType}\ndata: ${data}\n\n`;
}
