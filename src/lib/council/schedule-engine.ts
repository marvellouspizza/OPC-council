/**
 * Silent Council - 日程引擎
 * 1小时日程 · Token分配 · J/P排程风格 · Escrow预扣 · 账单序列化
 * 所有任务均通过 AI API 动态生成，不使用静态任务库
 */

import type {
  AgentId, UserProfile, DigitalTaskEntry,
  ScheduleBlock, DaySchedule, ScheduleStats, TokenBudget,
  TokenConflict, AGEParams, DigitalTaskCategory,
  ModelTier, EscrowState, TokenAllocation,
  RNGResult, RNGResultType, TaskGrade,
} from './types';
import { DEFAULT_TOKEN_BUDGET, MOOD_STRATEGIES, DEFAULT_TOKEN_ALLOCATION, LEVEL_COST_MULTIPLIERS, RNG_THRESHOLDS, RNG_NARRATIVES } from './types';
import { ALL_AGENT_IDS, AGENT_DEFINITIONS, computeMBTIAllocation } from './agents';

// ==================== Token 分配（按4维度） ====================

/** 根据 TokenAllocation 4维度分配各代理的 Token 预算 */
export function allocateTokens(
  allocation: TokenAllocation,
  totalBudget: number,
): Record<AgentId, number> {
  const total = allocation.efficiency + allocation.health + allocation.relationship + allocation.risk;
  if (total === 0) {
    const quarter = Math.round(totalBudget / 4);
    return { ENTJ: quarter, ISFJ: quarter, INFJ: quarter, ESTP: quarter };
  }
  return {
    ENTJ: Math.round(totalBudget * (allocation.efficiency / total)),
    ISFJ: Math.round(totalBudget * (allocation.health / total)),
    INFJ: Math.round(totalBudget * (allocation.relationship / total)),
    ESTP: Math.round(totalBudget * (allocation.risk / total)),
  };
}

// ==================== 任务候选筛选 ====================

export function selectCandidateTasks(
  tasks: DigitalTaskEntry[],
  profile: UserProfile,
  allocation: TokenAllocation,
  tokenBudget: number,
): DigitalTaskEntry[] {
  const total = allocation.efficiency + allocation.health + allocation.relationship + allocation.risk || 100;
  const weights: Record<AgentId, number> = {
    ENTJ: allocation.efficiency / total,
    ISFJ: allocation.health / total,
    INFJ: allocation.relationship / total,
    ESTP: allocation.risk / total,
  };

  // Filter tasks by mood constraints
  const mood = MOOD_STRATEGIES[profile.moodState];
  let candidates = [...tasks];

  // In survival mode, only allow essential tasks
  if (profile.moodState === 'survival') {
    candidates = candidates.filter(t =>
      t.category === 'SLEEP_AI' || t.category === 'HEALTH_AI' || t.isDeadline,
    );
  }

  // --- 用户画像相关性过滤 (设计文档 §2) ---

  // 1. 职业相关性: 提升与职业匹配的任务权重
  const professionBoost = buildProfessionBoost(profile.profession);

  // 2. 爱好相关性: 提升与爱好匹配的任务权重
  const hobbyCategories = mapHobbiesToCategories(profile.hobbies);

  // 3. 能量值过滤: 低能量时过滤掉高耗能任务
  if (profile.energyLevel < 30) {
    candidates = candidates.filter(t =>
      t.baseTokenCost <= tokenBudget * 0.3 || t.isDeadline,
    );
  }

  // 4. 焦虑模式: 拆解大任务，偏好小颗粒任务
  if (profile.moodState === 'anxiety') {
    candidates = candidates.filter(t =>
      parseFloat(t.executionDuration) <= 0.5 || t.isDeadline,
    );
  }

  // 5. 心流模式: 偏好大块连续任务，过滤琐碎
  if (profile.moodState === 'flow') {
    candidates.sort((a, b) => {
      const durA = parseFloat(a.executionDuration);
      const durB = parseFloat(b.executionDuration);
      return durB - durA; // 大块任务优先
    });
  }

  // Score each candidate by composite weight
  const scored = candidates.map(task => {
    let score = 0;

    // Base weight from token allocation
    score += (weights[task.ownerAgent] || 0) * 100;

    // Deadline always boosted
    if (task.isDeadline) score += 500;

    // Profession boost
    score += professionBoost[task.category] || 0;

    // Hobby boost
    if (hobbyCategories.has(task.category)) score += 30;

    // Energy-adjusted: low energy boosts light tasks
    if (profile.energyLevel < 50 && task.baseTokenCost < 300) score += 20;

    // Mood score influence: high mood → more adventure; low mood → more comfort
    if (profile.moodScore >= 7 && task.ownerAgent === 'ESTP') score += 15;
    if (profile.moodScore <= 3 && (task.ownerAgent === 'ISFJ' || task.category === 'HEALTH_AI')) score += 25;

    return { task, score };
  });

  // Sort by composite score descending
  scored.sort((a, b) => b.score - a.score);

  // 设计文档要求: 至少生成10个任务，才能触发议会讨价还价
  const maxTasks = Math.max(10, Math.min(mood.maxTaskCount * 3, 15));
  let selected = scored.slice(0, maxTasks).map(s => s.task);

  // --- Mix 强制约束 (设计文档 §2.1) ---
  // 必须包含: 1 个高耗能任务 + 1 个 Deadline 任务 + 若干低耗能琐事
  selected = enforceMix(selected, candidates);

  return selected;
}

/** 设计文档 §2.1: Mix 约束 — 确保日程包含高耗能 + Deadline + 低耗能 */
function enforceMix(selected: DigitalTaskEntry[], pool: DigitalTaskEntry[]): DigitalTaskEntry[] {
  const hasDeadline = selected.some(t => t.isDeadline);
  const hasHeavy = selected.some(t => t.baseTokenCost >= 500);
  const hasLight = selected.some(t => t.baseTokenCost < 200);

  // 从 pool 中补充缺失类型
  if (!hasDeadline) {
    const deadline = pool.find(t => t.isDeadline && !selected.includes(t));
    if (deadline) selected.push(deadline);
  }
  if (!hasHeavy) {
    const heavy = pool.find(t => t.baseTokenCost >= 500 && !selected.includes(t));
    if (heavy) selected.push(heavy);
  }
  if (!hasLight) {
    const light = pool.find(t => t.baseTokenCost < 200 && !selected.includes(t));
    if (light) selected.push(light);
  }

  return selected;
}

// ==================== 职业→任务类别映射 ====================

/** 根据职业关键词提升相关任务类别的权重 */
function buildProfessionBoost(profession?: string): Partial<Record<DigitalTaskCategory, number>> {
  if (!profession) return {};
  const p = profession.toLowerCase();

  const boosts: Partial<Record<DigitalTaskCategory, number>> = {};

  // 技术/工程类
  if (/engineer|develop|程序|工程|tech|码农|前端|后端|全栈/.test(p)) {
    boosts.WORK_AI = 40;
    boosts.LEARNING_AI = 20;
  }
  // 设计/创意类
  if (/design|设计|创意|美术|UI|UX|artist/.test(p)) {
    boosts.ENTERTAIN_AI = 25;
    boosts.WORK_AI = 30;
  }
  // 金融/商务类
  if (/financ|金融|银行|投资|会计|商务|business|trading/.test(p)) {
    boosts.SAVINGS_AI = 40;
    boosts.WORK_AI = 30;
  }
  // 学生
  if (/student|学生|研究生|大学|高中/.test(p)) {
    boosts.LEARNING_AI = 50;
    boosts.WORK_AI = 20;
  }
  // 自由职业/创作者
  if (/freelanc|自由|博主|作家|writer|content|创作/.test(p)) {
    boosts.ENTERTAIN_AI = 20;
    boosts.SOCIAL_AI = 25;
    boosts.WORK_AI = 25;
  }
  // 医疗/健康行业
  if (/doctor|医|护士|health|健康|心理/.test(p)) {
    boosts.HEALTH_AI = 40;
  }
  // 教育
  if (/teacher|教师|教授|教育|讲师|tutor/.test(p)) {
    boosts.LEARNING_AI = 40;
    boosts.SOCIAL_AI = 20;
  }

  return boosts;
}

// ==================== 爱好→任务类别映射 ====================

function mapHobbiesToCategories(hobbies?: string[]): Set<DigitalTaskCategory> {
  const cats = new Set<DigitalTaskCategory>();
  if (!hobbies?.length) return cats;

  for (const h of hobbies) {
    const hobby = h.toLowerCase();
    if (/game|游戏|电竞|steam/.test(hobby)) cats.add('GAMING_AI');
    if (/music|音乐|唱歌|乐器/.test(hobby)) cats.add('ENTERTAIN_AI');
    if (/movie|电影|anime|动漫|追剧|netflix/.test(hobby)) cats.add('ENTERTAIN_AI');
    if (/read|阅读|书|小说|漫画/.test(hobby)) cats.add('LEARNING_AI');
    if (/social|社交|聊天|朋友/.test(hobby)) cats.add('SOCIAL_AI');
    if (/sport|运动|健身|跑步|瑜伽/.test(hobby)) cats.add('HEALTH_AI');
    if (/invest|投资|理财|基金|股票|crypto/.test(hobby)) cats.add('SAVINGS_AI');
    if (/code|编程|开发|tech|hacker/.test(hobby)) cats.add('WORK_AI');
    if (/travel|旅游|摄影|photo/.test(hobby)) cats.add('ENTERTAIN_AI');
    if (/cook|烹饪|烘焙|美食/.test(hobby)) cats.add('HEALTH_AI');
  }

  return cats;
}

// ==================== 日程生成（1小时）- 已废弃，仅保留签名供兼容 ====================

/** @deprecated 请使用 generateScheduleWithAI。此函数仅作为兼容签名保留。 */
export function generateSchedule(_params: AGEParams): DaySchedule {
  throw new Error('静态任务池已移除，请使用 generateScheduleWithAI() 通过 AI 动态生成任务');
}

// ==================== AI 动态任务生成 (设计文档 §2) ====================

const SECONDME_API_BASE_URL = process.env.SECONDME_API_BASE_URL || 'https://app.mindos.com/gate/lab';

const CATEGORY_TO_AGENT: Record<string, AgentId> = {
  WORK_AI: 'ENTJ', LEARNING_AI: 'ENTJ',
  SLEEP_AI: 'ISFJ', HEALTH_AI: 'ISFJ', SAVINGS_AI: 'ISFJ',
  SOCIAL_AI: 'INFJ',
  ENTERTAIN_AI: 'ESTP', GAMING_AI: 'ESTP',
};

/**
 * AI 动态日程生成: 调 SecondMe API 用 buildArchitectPrompt 根据用户画像生成任务
 * 不再回退到静态任务池，失败时抛出错误
 */
export async function generateScheduleWithAI(
  params: AGEParams,
  accessToken: string,
): Promise<DaySchedule> {
  const { buildArchitectPrompt } = await import('./prompts');

  const prompt = buildArchitectPrompt(params.userProfile);

  const response = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    // SecondMe API 使用 message(单个字符串) 而非 OpenAI 格式的 messages 数组
    body: JSON.stringify({ message: prompt, stream: true }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`SecondMe API 返回 ${response.status}: ${errText.slice(0, 200)}`);
  }

  // 解析 SecondMe 响应 (SSE stream 格式)
  const text = await response.text();
  
  // 检查 SecondMe 业务错误码 (HTTP 200 但 body 可能是错误 JSON)
  if (text.startsWith('{')) {
    try {
      const bodyJson = JSON.parse(text);
      if (bodyJson.code && bodyJson.code !== 0) {
        throw new Error(`SecondMe API 业务错误: ${bodyJson.message || '未知错误'} (code: ${bodyJson.code})`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('SecondMe API')) throw e;
      // 不是 JSON 或解析失败，继续正常流程
    }
  }
  
  console.log('[ScheduleAI] SecondMe API 原始响应 (前500字):', text.slice(0, 500));
  const aiTasks = parseAIGeneratedTasks(text, params.userProfile);

  if (aiTasks.length === 0) {
    console.error('[ScheduleAI] 解析后任务数为0。原始响应全文:', text);
    throw new Error('AI 未返回有效任务，请检查 SecondMe API 连接或重试');
  }
  console.log(`[ScheduleAI] 成功解析 ${aiTasks.length} 个 AI 生成任务`);

  // 用 AI 生成的任务构建日程
  const totalBudget = params.tokenBudget || params.userProfile.tokenBudgetPerHour;
  const allocation = params.tokenAllocation
    || (params.userProfile.mbtiType ? computeMBTIAllocation(params.userProfile.mbtiType) : DEFAULT_TOKEN_ALLOCATION);
  const schedulingStyle = determineSchedulingStyle(params.userProfile);

  // 经过画像相关性评分排序
  const candidates = selectCandidateTasks(aiTasks, params.userProfile, allocation, totalBudget);
  const blocks = buildScheduleBlocks(candidates, params, schedulingStyle, totalBudget);

  const escrowResult = phase0EscrowDeduction(blocks, totalBudget);
  const conflict = detectTokenConflict(blocks, escrowResult.liquidBudget);
  if (conflict) resolveTokenConflict(blocks, conflict, allocation);

  if (escrowResult.liquidBudget <= 0) {
    for (const block of blocks) {
      if (!block.isDeadline && !block.isLocked) {
        block.generationNote = '⚠️ 流动资金耗尽，ISFJ建议移除';
      }
    }
  }

  const stats = calculateStats(blocks, totalBudget);
  const budget: TokenBudget = {
    ...DEFAULT_TOKEN_BUDGET,
    totalBudget,
    hourlyBudget: totalBudget,
    spent: stats.totalTokensUsed,
    reserved: escrowResult.frozenForDeadlines,
    available: escrowResult.liquidBudget - (stats.totalTokensUsed - escrowResult.frozenForDeadlines),
  };

  return {
    scheduleId: `sched_ai_${Date.now()}`,
    userId: '',
    date: params.date,
    blocks,
    tokenBudget: budget,
    generationParams: {
      templateId: 'ai-generated',
      userProfile: params.userProfile,
      moodState: params.userProfile.moodState,
      energyLevel: params.userProfile.energyLevel,
    },
    status: 'DRAFT',
    stats,
    schedulingStyle,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** 解析 AI 返回的 JSON 任务列表, 转换为 DigitalTaskEntry[] */
function parseAIGeneratedTasks(rawText: string, profile: UserProfile): DigitalTaskEntry[] {
  try {
    // 从 SSE/混合文本中提取 JSON
    let jsonStr = rawText;

    // 尝试提取 SSE data 行中的 content
    const dataLines = rawText.split('\n')
      .filter(l => l.startsWith('data:'))
      .map(l => l.replace(/^data:\s*/, '').trim())
      .filter(l => l && l !== '[DONE]');
    
    if (dataLines.length > 0) {
      // 尝试解析 SSE 中的 JSON 内容
      const contents: string[] = [];
      for (const line of dataLines) {
        try {
          const parsed = JSON.parse(line);
          // SecondMe 格式兼容：多种可能的内容字段
          if (parsed.content) contents.push(parsed.content);
          else if (parsed.choices?.[0]?.delta?.content) contents.push(parsed.choices[0].delta.content);
          else if (parsed.choices?.[0]?.message?.content) contents.push(parsed.choices[0].message.content);
          else if (parsed.data?.content) contents.push(parsed.data.content);
          else if (parsed.text) contents.push(parsed.text);
          else if (typeof parsed === 'string') contents.push(parsed);
        } catch {
          // 非 JSON 的 SSE 数据行，直接当作文本内容
          if (line.length > 2) contents.push(line);
        }
      }
      if (contents.length > 0) {
        jsonStr = contents.join('');
      }
    }

    console.log('[ScheduleAI] 拼接后用于JSON解析的文本 (前300字):', jsonStr.slice(0, 300));

    // 去掉 markdown code block 包裹
    jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // 提取 JSON 块 (支持多种格式)
    // 1. 尝试匹配包含 "tasks" 的 JSON 对象
    let jsonMatch = jsonStr.match(/\{[\s\S]*"tasks"\s*:\s*\[[\s\S]*\]\s*\}/);
    
    // 2. 如果失败，尝试直接匹配 JSON 数组
    if (!jsonMatch) {
      const arrayMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
        jsonStr = `{"tasks":${arrayMatch[0]}}`;
        jsonMatch = [jsonStr];
      }
    }

    if (!jsonMatch) {
      console.warn('[ScheduleAI] 无法从响应中提取 JSON。处理后文本:', jsonStr.slice(0, 500));
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const tasks: unknown[] = parsed.tasks || [];

    if (tasks.length === 0) {
      console.warn('[ScheduleAI] JSON 解析成功但 tasks 数组为空');
      return [];
    }

    return tasks.map((t: unknown, i: number) => {
      const task = t as Record<string, unknown>;
      const rawCategory = (task.category as string || 'WORK_AI').toUpperCase();
      // 规范化 category: 确保以 _AI 结尾
      const category = rawCategory.endsWith('_AI') ? rawCategory : `${rawCategory}_AI` as string;
      const validCategories = ['WORK_AI', 'LEARNING_AI', 'SLEEP_AI', 'HEALTH_AI', 'SAVINGS_AI', 'SOCIAL_AI', 'ENTERTAIN_AI', 'GAMING_AI'];
      const finalCategory = (validCategories.includes(category) ? category : 'WORK_AI') as DigitalTaskCategory;

      return {
        id: `AI-${Date.now()}-${i}`,
        name: (task.name as string) || `AI任务${i + 1}`,
        category: finalCategory,
        description: (task.description as string) || '',
        baseTokenCost: (task.token_cost as number) || 500,
        modelTier: 'gpt-4o' as ModelTier,
        executionDuration: String((task.duration_min as number || 15) / 60),
        isBackground: false,
        isDeadline: !!(task.is_deadline as boolean),
        ownerAgent: CATEGORY_TO_AGENT[finalCategory] || 'ENTJ',
        expectedOutput: (task.description as string) || '',
        aiTool: (task.ai_tool as string) || undefined,
      };
    });
  } catch (err) {
    console.warn('[ScheduleAI] 解析 AI 任务失败:', err);
    console.warn('[ScheduleAI] 原始文本:', rawText.slice(0, 500));
    return [];
  }
}

// ==================== J/P 排程风格 ====================

function determineSchedulingStyle(profile: UserProfile): 'J' | 'P' {
  if (!profile.mbtiType) return 'J';
  const lastChar = profile.mbtiType.charAt(3);
  return lastChar === 'P' ? 'P' : 'J';
}

// ==================== 时间块构建（1小时范围） ====================

function buildScheduleBlocks(
  tasks: DigitalTaskEntry[],
  params: AGEParams,
  style: 'J' | 'P',
  totalBudget: number,
): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];

  // Fixed tasks first (user pre-set)
  if (params.fixedTasks) {
    blocks.push(...params.fixedTasks);
  }

  // 1-hour schedule: use current hour or random fallback
  const now = new Date();
  const startHour = now.getHours();
  const totalMinutes = 60;

  // 设计文档要求: 任务总token要达到预算，才能触发议会讨价还价
  // 首先添加所有 Deadline 任务
  const deadlineTasks = tasks.filter(t => t.isDeadline);
  const normalTasks = tasks.filter(t => !t.isDeadline);
  
  let budgetUsed = 0;
  const targetBudget = totalBudget * 1.2; // 目标是超预算20%，触发博弈
  
  // 方案2: AI并行工作 - 所有任务都在1小时窗口内重叠执行
  // 任务按重要性/时长分配开始时间，可以重叠
  let taskIndex = 0;
  
  // Build blocks from candidate tasks - 并行分配
  for (const task of [...deadlineTasks, ...normalTasks]) {
    // 继续添加任务直到接近目标预算，或者至少有10个任务
    if (budgetUsed >= targetBudget && blocks.length >= 10 && !task.isDeadline) break;

    // Scale task duration for 1-hour schedule
    const rawMinutes = parseFloat(task.executionDuration) * 60;
    const taskMinutes = Math.max(3, Math.min(rawMinutes, totalMinutes));

    // 并行分配: 根据任务索引和类型分配开始时间
    // Deadline任务从0分钟开始，其他任务错开分布在1小时内
    let startMin = 0;
    if (!task.isDeadline) {
      // 非Deadline任务错开开始，形成重叠效果
      startMin = Math.min((taskIndex * 5) % 50, totalMinutes - taskMinutes);
    }
    const endMin = Math.min(startMin + taskMinutes, totalMinutes);

    const block: ScheduleBlock = {
      id: `blk_${task.id}_${Date.now()}_${blocks.length}`,
      timeStart: formatTimeFromBase(startHour, startMin),
      timeEnd: formatTimeFromBase(startHour, endMin),
      duration: taskMinutes / 60,
      category: task.category,
      taskName: task.name,
      taskId: task.id,
      tokenCost: task.baseTokenCost,
      modelTier: task.modelTier,
      isDeadline: task.isDeadline,
      deadlineTime: task.deadlineTime,
      isLocked: task.isDeadline,
      executionStatus: 'pending',
      ownerAgent: task.ownerAgent,
      escrowState: 'PENDING',
    };

    blocks.push(block);
    budgetUsed += task.baseTokenCost;
    taskIndex++;
  }
  
  // 确保至少有10个任务
  if (blocks.length < 10 && normalTasks.length > 0) {
    console.warn(`[ScheduleEngine] 仅生成${blocks.length}个任务，补充至10个以触发议会`);
    // 从未使用的任务中随机选择补充
    const unusedTasks = normalTasks.filter(t => !blocks.find(b => b.taskId === t.id));
    for (const task of unusedTasks) {
      if (blocks.length >= 10) break;
      
      const rawMinutes = parseFloat(task.executionDuration) * 60;
      const taskMinutes = Math.max(3, Math.min(rawMinutes, totalMinutes));
      const startMin = Math.min((taskIndex * 5) % 50, totalMinutes - taskMinutes);
      const endMin = Math.min(startMin + taskMinutes, totalMinutes);
      
      const block: ScheduleBlock = {
        id: `blk_${task.id}_${Date.now()}_${blocks.length}`,
        timeStart: formatTimeFromBase(startHour, startMin),
        timeEnd: formatTimeFromBase(startHour, endMin),
        duration: taskMinutes / 60,
        category: task.category,
        taskName: task.name,
        taskId: task.id,
        tokenCost: task.baseTokenCost,
        modelTier: task.modelTier,
        isDeadline: false,
        isLocked: false,
        executionStatus: 'pending',
        ownerAgent: task.ownerAgent,
        escrowState: 'PENDING',
      };
      blocks.push(block);
      budgetUsed += task.baseTokenCost;
      taskIndex++;
    }
  }

  return blocks;
}

// ==================== Token 冲突检测 ====================

export function detectTokenConflict(
  blocks: ScheduleBlock[],
  totalBudget: number,
): TokenConflict | null {
  const totalDemand = blocks.reduce((s, b) => s + b.tokenCost, 0);
  if (totalDemand <= totalBudget) return null;

  const agentDemands: Record<string, { tokens: number; taskIds: string[] }> = {};
  for (const block of blocks) {
    if (!agentDemands[block.ownerAgent]) {
      agentDemands[block.ownerAgent] = { tokens: 0, taskIds: [] };
    }
    agentDemands[block.ownerAgent].tokens += block.tokenCost;
    agentDemands[block.ownerAgent].taskIds.push(block.taskId);
  }

  const deadlineLocked = blocks
    .filter(b => b.isDeadline)
    .reduce((s, b) => s + b.tokenCost, 0);

  return {
    totalDemand,
    totalBudget,
    overagePercent: ((totalDemand - totalBudget) / totalBudget) * 100,
    conflictingAgents: Object.entries(agentDemands).map(([agentId, d]) => ({
      agentId: agentId as AgentId,
      requestedTokens: d.tokens,
      taskIds: d.taskIds,
      priority: AGENT_DEFINITIONS[agentId as AgentId]?.hasVetoPower ? 2 : 1,
    })),
    deadlineLocked,
    negotiableTokens: totalDemand - deadlineLocked,
  };
}

// ==================== 冲突解决 ====================

function resolveTokenConflict(
  blocks: ScheduleBlock[],
  conflict: TokenConflict,
  allocation: TokenAllocation,
): void {
  const overage = conflict.totalDemand - conflict.totalBudget;
  let remaining = overage;

  const total = allocation.efficiency + allocation.health + allocation.relationship + allocation.risk || 100;
  const agentWeight: Record<AgentId, number> = {
    ENTJ: allocation.efficiency / total,
    ISFJ: allocation.health / total,
    INFJ: allocation.relationship / total,
    ESTP: allocation.risk / total,
  };

  // Sort non-deadline blocks by allocation weight (lowest = first to downgrade)
  const downgradeable = blocks
    .filter(b => !b.isDeadline && !b.isLocked)
    .sort((a, b) => {
      const wA = agentWeight[a.ownerAgent as AgentId] || 0;
      const wB = agentWeight[b.ownerAgent as AgentId] || 0;
      return wA - wB;
    });

  for (const block of downgradeable) {
    if (remaining <= 0) break;
    if (block.modelTier === 'gpt-4o') {
      const saved = block.tokenCost * 0.9;
      block.originalTokenCost = block.tokenCost;
      block.tokenCost = Math.round(block.tokenCost * 0.1);
      block.modelTier = 'gpt-4o-mini';
      block.generationNote = '因Token不足降级模型';
      remaining -= saved;
    } else if (remaining > 0) {
      const savedTokens = block.tokenCost;
      block.originalTokenCost = block.tokenCost;
      // 保留原始tokenCost用于显示，不设为0
      block.generationNote = '因Token不足被降级';
      block.modelTier = 'rule-based';
      remaining -= savedTokens;
    }
  }
}

// ==================== Escrow 操作 ====================

export function freezeEscrow(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return blocks.map(b => ({
    ...b,
    escrowState: (b.escrowState === 'RELEASED' || b.escrowState === 'BURNED')
      ? b.escrowState
      : 'FROZEN' as EscrowState,
  }));
}

export function releaseEscrow(
  block: ScheduleBlock,
  grade: import('./types').TaskGrade,
): ScheduleBlock {
  const gradeMultiplier: Record<import('./types').TaskGrade, number> = {
    S: 2.0, A: 1.5, B: 1.0, C: 0.5, D: 0,
  };

  return {
    ...block,
    escrowState: 'RELEASED',
    finalGrade: grade,
    tokenCost: Math.round(block.tokenCost * gradeMultiplier[grade]),
    generationNote: `完成评级: ${grade} (${gradeMultiplier[grade]}x)`,
  };
}

// ==================== 账单序列化 ====================

export function serializeScheduleAsBill(schedule: DaySchedule): string {
  const lines: string[] = [
    `╔══════════════════════════════════════════╗`,
    `║  📋 1小时日程 - ${schedule.date}  ${schedule.schedulingStyle === 'J' ? '[J型·结构化]' : '[P型·弹性]'}`,
    `╠══════════════════════════════════════════╣`,
  ];

  for (const block of schedule.blocks) {
    const ownerDef = AGENT_DEFINITIONS[block.ownerAgent];
    const escrowTag = block.escrowState === 'FROZEN' ? '🔒' : block.escrowState === 'RELEASED' ? '✅' : '⏳';
    lines.push(
      `║ ${block.timeStart}-${block.timeEnd} │ ${ownerDef?.icon || '?'} ${block.taskName.padEnd(16)} │ ${block.tokenCost}tk ${escrowTag}`,
    );
  }

  lines.push(`╠══════════════════════════════════════════╣`);
  lines.push(`║ 预算: ${schedule.stats.totalTokensUsed}/${schedule.stats.totalTokensBudget} tk (${(schedule.stats.tokenUtilization * 100).toFixed(0)}%)`);
  lines.push(`║ 任务: ${schedule.stats.taskCount} 项 | Deadline: ${schedule.stats.deadlineTaskCount} 项`);
  if (schedule.stats.tokenDeficit > 0) {
    lines.push(`║ ⚠️ 透支: ${schedule.stats.tokenDeficit} tk`);
  }
  lines.push(`╚══════════════════════════════════════════╝`);

  return lines.join('\n');
}

// ==================== 触发器 ====================

export function generateScheduleTrigger(
  schedule: DaySchedule,
  profile: UserProfile,
): string {
  const bill = serializeScheduleAsBill(schedule);
  const mood = MOOD_STRATEGIES[profile.moodState];

  return `用户请求生成1小时日程。以下是AI自动排程结果（初稿），请议会4位代理审议并博弈。

--- 用户画像 ---
MBTI: ${profile.mbtiType || '未知'}
职业: ${profile.profession || '未知'} (${profile.professionCategory})
心情: ${mood.label}
能量: ${profile.energyLevel}/100
刚性系数: ${profile.rigidityCoefficient}

--- 自动排程账单（1小时）---
${bill}

请各代理根据自己的立场对此日程提出意见或修改建议。
记住：说话要像人一样口语化，不要用markdown格式，每条消息控制在50字以内。`;
}

// ==================== 统计计算 ====================

function calculateStats(blocks: ScheduleBlock[], totalBudget: number): ScheduleStats {
  const totalTokensUsed = blocks.reduce((s, b) => s + b.tokenCost, 0);
  const deadlineTokens = blocks.filter(b => b.isDeadline).reduce((s, b) => s + b.tokenCost, 0);

  const categoryBreakdown: Record<DigitalTaskCategory, number> = {
    SLEEP_AI: 0, WORK_AI: 0, ENTERTAIN_AI: 0, SOCIAL_AI: 0,
    SAVINGS_AI: 0, GAMING_AI: 0, HEALTH_AI: 0, LEARNING_AI: 0, SYSTEM: 0,
  };
  const modelTierBreakdown: Record<ModelTier, number> = { 'gpt-4o': 0, 'gpt-4o-mini': 0, 'rule-based': 0 };

  for (const b of blocks) {
    categoryBreakdown[b.category] = (categoryBreakdown[b.category] || 0) + b.tokenCost;
    modelTierBreakdown[b.modelTier] = (modelTierBreakdown[b.modelTier] || 0) + 1;
  }

  const deficit = Math.max(0, totalTokensUsed - totalBudget);

  return {
    totalTokensUsed,
    totalTokensBudget: totalBudget,
    tokenUtilization: totalBudget > 0 ? totalTokensUsed / totalBudget : 0,
    deadlineTokensReserved: deadlineTokens,
    taskCount: blocks.length,
    deadlineTaskCount: blocks.filter(b => b.isDeadline).length,
    categoryBreakdown,
    modelTierBreakdown,
    tokenDeficit: deficit,
    overBudgetPercent: totalBudget > 0 ? (deficit / totalBudget) * 100 : 0,
  };
}

// ==================== 工具函数 ====================

function formatTimeFromBase(baseHour: number, minuteOffset: number): string {
  const totalMinutes = baseHour * 60 + minuteOffset;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${Math.round(m).toString().padStart(2, '0')}`;
}

// ==================== Phase 0: Escrow 预扣除 ====================

/**
 * 设计文档 §3.1: 预扣除 (Escrow)
 * 扫描所有 is_deadline 任务 → 计算 Level C 最低成本 → 从总池冻结
 * 剩余 = 流动资金 (4 Agent 争夺的部分)
 */
function phase0EscrowDeduction(
  blocks: ScheduleBlock[],
  totalBudget: number,
): { liquidBudget: number; frozenForDeadlines: number } {
  // 计算 Deadline 任务的 Level C (最低交付) 成本
  const deadlineFrozen = blocks
    .filter(b => b.isDeadline)
    .reduce((sum, b) => sum + Math.round(b.tokenCost * LEVEL_COST_MULTIPLIERS.C), 0);

  const liquidBudget = Math.max(0, totalBudget - deadlineFrozen);

  // 标记 Deadline 任务的 Escrow 为已冻结
  for (const block of blocks) {
    if (block.isDeadline) {
      block.escrowState = 'FROZEN';
    }
  }

  return { liquidBudget, frozenForDeadlines: deadlineFrozen };
}

// ==================== RNG 运气系统 ====================

/**
 * 设计文档 §6.1: 结果评级算法
 * Score = Token投入 × GradeMultiplier × (1 + Luck)
 * Luck ∈ [-0.5, 0.5]
 *
 * 4种结果:
 * - 大成功 (CRITICAL_SUCCESS): score > invested × 1.5
 * - 成功 (SUCCESS): score > invested × 0.5
 * - 勉强通过 (BARELY_PASSED): score > 0
 * - 大失败 (CRITICAL_FAIL): score ≤ 0 或 Token 不足 Level C
 */
export function rollTaskResult(tokenInvested: number, grade: TaskGrade): RNGResult {
  const luck = -0.5 + Math.random(); // luck ∈ [-0.5, 0.5]
  const gradeMultiplier = LEVEL_COST_MULTIPLIERS[grade];
  const score = Math.round(tokenInvested * gradeMultiplier * (1 + luck));

  let type: RNGResultType;
  let statChanges: Partial<import('./types').ResourceInventory> = {};

  if (score > tokenInvested * RNG_THRESHOLDS.criticalSuccess) {
    type = 'CRITICAL_SUCCESS';
    statChanges = { SOC: 10, HP: 5 };
  } else if (score > tokenInvested * RNG_THRESHOLDS.success) {
    type = 'SUCCESS';
    statChanges = {};
  } else if (score > RNG_THRESHOLDS.barelyPassed) {
    type = 'BARELY_PASSED';
    statChanges = { HP: -5 };
  } else {
    type = 'CRITICAL_FAIL';
    statChanges = { HP: -20 };
  }

  const narratives = RNG_NARRATIVES[type];
  const narrative = narratives[Math.floor(Math.random() * narratives.length)];

  return { type, score, luck, statChanges, narrative };
}

/**
 * 带 RNG 的 Escrow 释放（替代简单的 grade multiplier）
 */
export function releaseEscrowWithRNG(
  block: ScheduleBlock,
  grade: TaskGrade,
): { block: ScheduleBlock; rngResult: RNGResult } {
  const rngResult = rollTaskResult(block.tokenCost, grade);

  const updatedBlock: ScheduleBlock = {
    ...block,
    escrowState: 'RELEASED',
    finalGrade: grade,
    tokenCost: Math.max(0, rngResult.score),
    generationNote: `${rngResult.narrative} [评级:${grade} 运气:${(rngResult.luck * 100).toFixed(0)}%]`,
  };

  return { block: updatedBlock, rngResult };
}

// ==================== 透支信用分系统 (设计文档 §3.1) ====================

export interface DeficitPenalty {
  isDeficit: boolean;
  deficitAmount: number;
  creditScorePenalty: number;
  message: string;
}

/**
 * 如果任务总需求 > 预算, 计算透支额和信用分惩罚
 * 信用分惩罚 = 透支比例 × DEFAULT_TOKEN_BUDGET.deficitPenalty (1.5x)
 */
function calculateDeficitPenalty(blocks: ScheduleBlock[], totalBudget: number): DeficitPenalty {
  const totalDemand = blocks.reduce((s, b) => s + b.tokenCost, 0);

  if (totalDemand <= totalBudget) {
    return { isDeficit: false, deficitAmount: 0, creditScorePenalty: 0, message: '' };
  }

  const deficitAmount = totalDemand - totalBudget;
  const deficitRatio = deficitAmount / totalBudget;
  // 信用分惩罚: 透支比例 × 1.5 倍率 × 100 基础分
  const creditScorePenalty = Math.round(deficitRatio * DEFAULT_TOKEN_BUDGET.deficitPenalty * 100);

  return {
    isDeficit: true,
    deficitAmount,
    creditScorePenalty,
    message: `⚠️ 透支 ${deficitAmount} token (${(deficitRatio * 100).toFixed(0)}%)，信用分 -${creditScorePenalty}`,
  };
}
