/**
 * GET/PUT /api/user/profile - 用户画像 CRUD
 * 管理用户的 MBTI、职业、Rc系数、心情状态、底线设置
 */

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET - 获取用户画像 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        mbtiType: true,
        profession: true,
        professionCategory: true,
        rigidityCoefficient: true,
        moodState: true,
        energyLevel: true,
        ublSleepHours: true,
        ublMinBudget: true,
        ublSocialMinutes: true,
        ublMaxWorkHours: true,
      },
    });

    if (!dbUser) {
      return Response.json({
        code: 0,
        data: {
          userProfile: {
            professionCategory: 'mid',
            rigidityCoefficient: 0.5,
            moodState: 'flow',
            energyLevel: 80,
          },
          userBottomLine: {
            sleepHours: 8,
            minBudget: 500,
            dailySocialMinutes: 60,
            maxWorkHours: 2,
          },
        },
      });
    }

    return Response.json({
      code: 0,
      data: {
        userProfile: {
          mbtiType: dbUser.mbtiType,
          profession: dbUser.profession,
          professionCategory: dbUser.professionCategory || 'mid',
          rigidityCoefficient: dbUser.rigidityCoefficient || 0.5,
          moodState: dbUser.moodState || 'flow',
          energyLevel: dbUser.energyLevel || 80,
          isotopeAgentId: dbUser.mbtiType,
        },
        userBottomLine: {
          sleepHours: dbUser.ublSleepHours || 8,
          minBudget: dbUser.ublMinBudget || 500,
          dailySocialMinutes: dbUser.ublSocialMinutes || 60,
          maxWorkHours: dbUser.ublMaxWorkHours || 2,
        },
      },
    });
  } catch (error) {
    console.error('获取用户画像失败:', error);
    return new Response(
      JSON.stringify({ error: '获取用户画像失败' }),
      { status: 500 }
    );
  }
}

/** PUT - 更新用户画像 */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { userProfile, userBottomLine } = body;

    const updateData: Record<string, unknown> = {};

    // 用户画像字段
    if (userProfile) {
      if (userProfile.mbtiType !== undefined) updateData.mbtiType = userProfile.mbtiType;
      if (userProfile.profession !== undefined) updateData.profession = userProfile.profession;
      if (userProfile.professionCategory !== undefined) updateData.professionCategory = userProfile.professionCategory;
      if (userProfile.rigidityCoefficient !== undefined) updateData.rigidityCoefficient = userProfile.rigidityCoefficient;
      if (userProfile.moodState !== undefined) updateData.moodState = userProfile.moodState;
      if (userProfile.energyLevel !== undefined) updateData.energyLevel = userProfile.energyLevel;
    }

    // 用户底线字段
    if (userBottomLine) {
      if (userBottomLine.sleepHours !== undefined) updateData.ublSleepHours = userBottomLine.sleepHours;
      if (userBottomLine.minBudget !== undefined) updateData.ublMinBudget = userBottomLine.minBudget;
      if (userBottomLine.dailySocialMinutes !== undefined) updateData.ublSocialMinutes = userBottomLine.dailySocialMinutes;
      if (userBottomLine.maxWorkHours !== undefined) updateData.ublMaxWorkHours = userBottomLine.maxWorkHours;
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ error: '没有提供更新数据' }),
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        mbtiType: true,
        profession: true,
        professionCategory: true,
        rigidityCoefficient: true,
        moodState: true,
        energyLevel: true,
        ublSleepHours: true,
        ublMinBudget: true,
        ublSocialMinutes: true,
        ublMaxWorkHours: true,
      },
    });

    return Response.json({
      code: 0,
      data: {
        message: '用户画像更新成功',
        userProfile: {
          mbtiType: updated.mbtiType,
          profession: updated.profession,
          professionCategory: updated.professionCategory,
          rigidityCoefficient: updated.rigidityCoefficient,
          moodState: updated.moodState,
          energyLevel: updated.energyLevel,
          isotopeAgentId: updated.mbtiType,
        },
        userBottomLine: {
          sleepHours: updated.ublSleepHours,
          minBudget: updated.ublMinBudget,
          dailySocialMinutes: updated.ublSocialMinutes,
          maxWorkHours: updated.ublMaxWorkHours,
        },
      },
    });
  } catch (error) {
    console.error('更新用户画像失败:', error);
    return new Response(
      JSON.stringify({ error: '更新用户画像失败' }),
      { status: 500 }
    );
  }
}
