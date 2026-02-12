/**
 * Silent Council - OPC 数字日程 API (Token 驱动)
 * POST: 生成日程 / PUT: 更新日程(编辑/锁定/降级/确认/评级) / GET: 获取当前日程
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { generateScheduleWithAI, serializeScheduleAsBill, generateScheduleTrigger, freezeEscrow, releaseEscrow } from '@/lib/council/schedule-engine';
import type { AGEParams, DaySchedule, ScheduleBlock, UserProfile, ModelTier, TaskGrade, TokenAllocation } from '@/lib/council/types';
import { DEFAULT_TOKEN_ALLOCATION } from '@/lib/council/types';

// 内存中的日程缓存（生产环境应存入数据库）
let currentSchedule: DaySchedule | null = null;

/**
 * POST /api/schedule - 生成新日程（Token驱动，始终通过 AI 动态生成）
 */
export async function POST(request: Request) {
  try {
    // 从服务器端 session 获取 accessToken（与 council 路由一致）
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: '未登录，请先通过 SecondMe 登录以启用 AI 日程生成' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      userProfile,
      date,
      tokenBudget,
      hobbies,
      structurePreference,
      allowDeficit,
      tokenAllocation,
    } = body;

    const profile: UserProfile = userProfile || {
      professionCategory: 'mid',
      rigidityCoefficient: 0.5,
      moodState: 'flow',
      energyLevel: 80,
      hobbies: [],
      moodScore: 5,
      tokenBudgetPerHour: 10000,
    };

    const today = date || new Date().toISOString().split('T')[0];

    // 直接使用Token分配
    const adjustedAllocation = tokenAllocation || DEFAULT_TOKEN_ALLOCATION;

    const params: AGEParams = {
      userProfile: profile,
      date: today,
      tokenBudget,
      hobbies: hobbies || profile.hobbies,
      structurePreference,
      allowDeficit,
      tokenAllocation: adjustedAllocation,
    };

    // 始终通过 AI 动态生成（不再使用静态任务池）
    const schedule = await generateScheduleWithAI(params, user.accessToken);
    currentSchedule = schedule;

    return NextResponse.json({
      success: true,
      schedule,
      source: 'ai-generated',
    });
  } catch (error) {
    console.error('日程生成错误:', error);
    return NextResponse.json(
      { error: '日程生成失败', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/schedule - 获取当前日程
 */
export async function GET() {
  if (!currentSchedule) {
    return NextResponse.json({ schedule: null });
  }
  return NextResponse.json({ schedule: currentSchedule });
}

/**
 * PUT /api/schedule - 更新日程
 * Actions: lock, edit, delete, downgrade, confirm, to-council
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { action, blockId, updates } = body;

    if (!currentSchedule) {
      return NextResponse.json({ error: '没有活动日程' }, { status: 404 });
    }

    switch (action) {
      case 'lock': {
        currentSchedule.blocks = currentSchedule.blocks.map(b =>
          b.id === blockId ? { ...b, isLocked: !b.isLocked } : b
        );
        currentSchedule.updatedAt = new Date().toISOString();
        break;
      }

      case 'edit': {
        currentSchedule.blocks = currentSchedule.blocks.map(b =>
          b.id === blockId ? { ...b, ...updates } : b
        );
        currentSchedule.status = 'EDITED';
        currentSchedule.updatedAt = new Date().toISOString();
        break;
      }

      case 'delete': {
        // Deadline 任务不可删除
        const target = currentSchedule.blocks.find(b => b.id === blockId);
        if (target?.isDeadline) {
          return NextResponse.json(
            { error: 'Deadline 任务不可删除，只能降级模型' },
            { status: 400 }
          );
        }
        currentSchedule.blocks = currentSchedule.blocks.filter(b => b.id !== blockId);
        currentSchedule.status = 'EDITED';
        currentSchedule.updatedAt = new Date().toISOString();
        break;
      }

      case 'downgrade': {
        // 降级模型（关键的Token节省策略）
        const { targetTier } = body as { targetTier: ModelTier };
        currentSchedule.blocks = currentSchedule.blocks.map(b => {
          if (b.id !== blockId) return b;
          // 直接使用 block 自身数据进行降级，不依赖静态任务库
          const baseCost = b.originalTokenCost || b.tokenCost;
          const costMultiplier = targetTier === 'gpt-4o' ? 1.0 : targetTier === 'gpt-4o-mini' ? 0.1 : 0.01;
          const newCost = Math.round(baseCost * costMultiplier);
          return {
            ...b,
            originalTokenCost: baseCost,
            tokenCost: newCost,
            modelTier: targetTier,
            generationNote: `🔽 模型降级: ${b.modelTier} → ${targetTier} | Token: ${b.tokenCost} → ${newCost}`,
          };
        });
        currentSchedule.status = 'EDITED';
        currentSchedule.updatedAt = new Date().toISOString();

        // 重新计算统计
        recalculateStats(currentSchedule);
        break;
      }

      case 'confirm': {
        // 冻结所有非锁定任务的 Token (Escrow)
        currentSchedule.blocks = freezeEscrow(currentSchedule.blocks);
        currentSchedule.status = 'CONFIRMED';
        currentSchedule.updatedAt = new Date().toISOString();

        const trigger = generateScheduleTrigger(currentSchedule, currentSchedule.generationParams?.userProfile || {
          professionCategory: 'mid', rigidityCoefficient: 0.5, moodState: 'flow',
          energyLevel: 80, hobbies: [], moodScore: 5, tokenBudgetPerHour: 10000,
        } as UserProfile);
        const bill = serializeScheduleAsBill(currentSchedule);

        return NextResponse.json({
          success: true,
          schedule: currentSchedule,
          councilTrigger: trigger,
          bill,
        });
      }

      case 'grade': {
        // 任务完成评级 → 释放 Escrow
        const { grade } = body as { grade: TaskGrade };
        if (!grade || !['S', 'A', 'B', 'C', 'D'].includes(grade)) {
          return NextResponse.json({ error: '无效评级，需为 S/A/B/C/D' }, { status: 400 });
        }
        const target = currentSchedule.blocks.find(b => b.id === blockId);
        if (!target) {
          return NextResponse.json({ error: '未找到任务块' }, { status: 404 });
        }
        const released = releaseEscrow(target, grade);
        currentSchedule.blocks = currentSchedule.blocks.map(b =>
          b.id === blockId ? released : b
        );
        currentSchedule.updatedAt = new Date().toISOString();
        recalculateStats(currentSchedule);
        break;
      }

      case 'to-council': {
        currentSchedule.status = 'IN_COUNCIL';
        currentSchedule.updatedAt = new Date().toISOString();
        break;
      }

      default:
        return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      schedule: currentSchedule,
    });
  } catch (error) {
    console.error('日程更新错误:', error);
    return NextResponse.json(
      { error: '日程更新失败', details: String(error) },
      { status: 500 }
    );
  }
}

/** 重新计算统计信息 */
function recalculateStats(schedule: DaySchedule) {
  let totalTokensUsed = 0;
  let deadlineTokens = 0;
  let deadlineCount = 0;

  const categoryBreakdown: Record<string, number> = {};
  const modelTierBreakdown: Record<string, number> = {};

  for (const block of schedule.blocks) {
    totalTokensUsed += block.tokenCost;
    categoryBreakdown[block.category] = (categoryBreakdown[block.category] || 0) + block.tokenCost;
    modelTierBreakdown[block.modelTier] = (modelTierBreakdown[block.modelTier] || 0) + block.tokenCost;

    if (block.isDeadline) {
      deadlineTokens += block.tokenCost;
      deadlineCount++;
    }
  }

  schedule.stats = {
    ...schedule.stats,
    totalTokensUsed,
    deadlineTokensReserved: deadlineTokens,
    deadlineTaskCount: deadlineCount,
    taskCount: schedule.blocks.length,
    tokenUtilization: schedule.tokenBudget.totalBudget > 0 ? totalTokensUsed / schedule.tokenBudget.totalBudget : 0,
    tokenDeficit: Math.max(0, totalTokensUsed - schedule.tokenBudget.totalBudget),
    overBudgetPercent: Math.round(Math.max(0, ((totalTokensUsed - schedule.tokenBudget.totalBudget) / schedule.tokenBudget.totalBudget) * 100)),
    categoryBreakdown: categoryBreakdown as typeof schedule.stats.categoryBreakdown,
    modelTierBreakdown: modelTierBreakdown as typeof schedule.stats.modelTierBreakdown,
  };

  schedule.tokenBudget.spent = totalTokensUsed;
  schedule.tokenBudget.available = schedule.tokenBudget.totalBudget - totalTokensUsed;
}
