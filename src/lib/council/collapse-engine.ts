/**
 * Silent Council - 坍缩引擎 (The Collapse)
 * 设计文档 §5: 任务分级与坍缩逻辑
 *
 * 职责:
 * 1. 根据博弈结果 (Agent 权重/满意度/Token投入) 计算每个任务的最终等级
 * 2. P2P 交易协议: Agent 资金不足时触发跨代理谈判
 * 3. 三级交付标准 (C/B/A/S) 的确定与锁定
 */

import type {
  AgentId, AgentState, CouncilContext, ScheduleBlock,
  TaskGrade, TaskLevelCosts, CollapseResult, TradeProposal,
  UserProfile, TokenAllocation, ResourceDelta,
} from './types';
import { LEVEL_COST_MULTIPLIERS, getTaskLevelCosts } from './types';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS } from './agents';

// ==================== 坍缩核心 ====================

/**
 * 坍缩主函数: 将博弈结果转化为每个任务的具体交付等级
 *
 * 流程:
 * 1. 计算各 Agent 可用 Token (权重 × 满意度 × 基础预算)
 * 2. 扫描每个任务，按 Token 投入 vs 等级成本 确定初始等级
 * 3. 检测资金不足的 Agent → 触发 P2P 交易
 * 4. 锁定最终等级
 */
export function collapseAllTasks(
  ctx: CouncilContext,
  blocks: ScheduleBlock[],
  totalBudget: number,
): { results: CollapseResult[]; trades: TradeProposal[] } {
  // Step 1: 计算每位 Agent 的可用 Token 预算
  const agentBudgets = calculateAgentBudgets(ctx.agentStates, totalBudget);

  // Step 2: 为每个任务生成等级成本元数据
  const taskMeta = blocks.map(block => ({
    block,
    levelCosts: getTaskLevelCosts(block.tokenCost),
    ownerAgent: block.ownerAgent,
  }));

  // Step 3: 按 Agent 分组，计算每个 Agent 管辖任务的初始等级分配
  const agentTasks: Record<AgentId, typeof taskMeta> = {
    ENTJ: [], ISFJ: [], INFJ: [], ESTP: [],
  };
  for (const tm of taskMeta) {
    agentTasks[tm.ownerAgent].push(tm);
  }

  // Step 4: 每个 Agent 根据预算分配任务等级
  const initialGrades = new Map<string, { grade: TaskGrade; tokenSpent: number }>();
  const agentRemaining: Record<AgentId, number> = { ENTJ: 0, ISFJ: 0, INFJ: 0, ESTP: 0 };

  for (const agentId of ALL_AGENT_IDS) {
    const budget = agentBudgets[agentId];
    const tasks = agentTasks[agentId];
    const allocation = allocateGradesForAgent(tasks, budget);

    agentRemaining[agentId] = allocation.remaining;
    for (const [taskId, result] of allocation.grades) {
      initialGrades.set(taskId, result);
    }
  }

  // Step 5: P2P 交易 - 检测不满足的 Agent 并尝试交易
  const trades: TradeProposal[] = [];
  const adjustedGrades = new Map(initialGrades);

  for (const agentId of ALL_AGENT_IDS) {
    const state = ctx.agentStates.find(a => a.id === agentId);
    if (!state) continue;

    const tasks = agentTasks[agentId];
    // 检查是否有任务可以升级但 Token 不足
    for (const tm of tasks) {
      const current = adjustedGrades.get(tm.block.id);
      if (!current) continue;

      // 如果低于B级且Agent满意度高(想升级)
      const wantsUpgrade = state.satisfaction > 60 && gradeRank(current.grade) < gradeRank('B');
      if (!wantsUpgrade) continue;

      const upgradeCost = tm.levelCosts.B.cost - current.tokenSpent;
      if (upgradeCost <= 0) continue;

      // 寻找有闲置 Token 的交易伙伴
      const trade = attemptP2PTrade(
        agentId, tm.block.id, tm.block.taskName,
        current.grade, 'B', upgradeCost,
        agentRemaining, agentTasks, adjustedGrades,
        ctx.userProfile,
      );

      if (trade) {
        trades.push(trade);
        // 应用交易结果
        adjustedGrades.set(trade.demand.taskId, {
          grade: trade.demand.upgradeTo,
          tokenSpent: current.tokenSpent + trade.demand.tokenNeeded,
        });
        adjustedGrades.set(trade.offer.taskId, {
          grade: trade.offer.downgradeTo,
          tokenSpent: Math.round(
            (adjustedGrades.get(trade.offer.taskId)?.tokenSpent || 0) - trade.offer.tokenFreed,
          ),
        });
        agentRemaining[trade.sourceAgent] += trade.offer.tokenFreed;
        agentRemaining[trade.sourceAgent] -= trade.demand.tokenNeeded;
      }
    }
  }

  // Step 6: 构建最终坍缩结果
  const results: CollapseResult[] = taskMeta.map(tm => {
    const gradeInfo = adjustedGrades.get(tm.block.id) || { grade: 'C' as TaskGrade, tokenSpent: 0 };
    const trade = trades.find(t => t.demand.taskId === tm.block.id || t.offer.taskId === tm.block.id);

    return {
      taskId: tm.block.id,
      taskName: tm.block.taskName,
      ownerAgent: tm.ownerAgent,
      category: tm.block.category, // 任务类别（用于生成结果描述）
      initialGrade: initialGrades.get(tm.block.id)?.grade || 'C',
      finalGrade: gradeInfo.grade,
      tokenInvested: gradeInfo.tokenSpent,
      levelCosts: tm.levelCosts,
      tradedWith: trade ? (trade.sourceAgent === tm.ownerAgent ? trade.targetAgent : trade.sourceAgent) : undefined,
      isDeadline: tm.block.isDeadline,
    };
  });

  return { results, trades };
}

// ==================== Agent 预算计算 ====================

/**
 * 根据 Agent 权重和满意度计算可用 Token
 * 公式: budget = totalBudget × (weight / totalWeight) × satisfactionMultiplier
 */
function calculateAgentBudgets(
  agents: AgentState[],
  totalBudget: number,
): Record<AgentId, number> {
  const totalWeight = agents.reduce((sum, a) => sum + a.currentWeight, 0) || 1;

  const budgets: Record<AgentId, number> = { ENTJ: 0, ISFJ: 0, INFJ: 0, ESTP: 0 };

  for (const agent of agents) {
    // 满意度影响预算效率: 满意度越高越能"花好钱"
    const satMultiplier = 0.5 + (agent.satisfaction / 100) * 0.5; // 0.5 ~ 1.0
    const weightRatio = agent.currentWeight / totalWeight;
    budgets[agent.id] = Math.round(totalBudget * weightRatio * satMultiplier);
  }

  return budgets;
}

// ==================== 单 Agent 等级分配 ====================

interface GradeAllocationResult {
  grades: Map<string, { grade: TaskGrade; tokenSpent: number }>;
  remaining: number;
}

/**
 * 为单个 Agent 管辖的任务列表分配等级
 * 策略: Deadline 任务优先保障 → 高成本大任务次之 → 小任务补足
 */
function allocateGradesForAgent(
  tasks: { block: ScheduleBlock; levelCosts: TaskLevelCosts; ownerAgent: AgentId }[],
  budget: number,
): GradeAllocationResult {
  const grades = new Map<string, { grade: TaskGrade; tokenSpent: number }>();
  let remaining = budget;

  // 按优先级排序: Deadline > 高成本 > 普通
  const sorted = [...tasks].sort((a, b) => {
    if (a.block.isDeadline && !b.block.isDeadline) return -1;
    if (!a.block.isDeadline && b.block.isDeadline) return 1;
    return b.block.tokenCost - a.block.tokenCost;
  });

  for (const tm of sorted) {
    const costs = tm.levelCosts;

    // 尝试从高到低分配等级
    if (remaining >= costs.S.cost) {
      grades.set(tm.block.id, { grade: 'S', tokenSpent: costs.S.cost });
      remaining -= costs.S.cost;
    } else if (remaining >= costs.A.cost) {
      grades.set(tm.block.id, { grade: 'A', tokenSpent: costs.A.cost });
      remaining -= costs.A.cost;
    } else if (remaining >= costs.B.cost) {
      grades.set(tm.block.id, { grade: 'B', tokenSpent: costs.B.cost });
      remaining -= costs.B.cost;
    } else if (remaining >= costs.C.cost) {
      grades.set(tm.block.id, { grade: 'C', tokenSpent: costs.C.cost });
      remaining -= costs.C.cost;
    } else {
      // Token 完全不够, D 级 (失败)
      grades.set(tm.block.id, { grade: 'D', tokenSpent: 0 });
    }
  }

  return { grades, remaining };
}

// ==================== P2P 交易协议 (设计文档 §5.2) ====================

/**
 * 尝试 P2P 交易:
 * 1. 触发: Agent 想升级任务但缺 Token
 * 2. 寻找: 查询谁有闲置 Token → 富裕的 Agent
 * 3. 条件: 富裕方要求将自己的某个任务降级释放 Token
 * 4. 判定: 降级风险 < 升级收益 (由 UserProfile 决定权重)
 */
function attemptP2PTrade(
  requestingAgent: AgentId,
  targetTaskId: string,
  targetTaskName: string,
  currentGrade: TaskGrade,
  desiredGrade: TaskGrade,
  neededTokens: number,
  agentRemaining: Record<AgentId, number>,
  agentTasks: Record<AgentId, { block: ScheduleBlock; levelCosts: TaskLevelCosts; ownerAgent: AgentId }[]>,
  currentGrades: Map<string, { grade: TaskGrade; tokenSpent: number }>,
  userProfile: UserProfile,
): TradeProposal | null {
  // 寻找有余量的 Agent
  const candidates = ALL_AGENT_IDS
    .filter(a => a !== requestingAgent && agentRemaining[a] > 0)
    .sort((a, b) => agentRemaining[b] - agentRemaining[a]);

  for (const partnerAgent of candidates) {
    // 在 partner 的任务中找一个可以降级释放 Token 的
    const partnerTasks = agentTasks[partnerAgent];

    for (const pt of partnerTasks) {
      if (pt.block.isDeadline) continue; // 不能降级 Deadline 任务

      const ptGrade = currentGrades.get(pt.block.id);
      if (!ptGrade || gradeRank(ptGrade.grade) <= gradeRank('C')) continue; // 已经是最低了

      const downgradeTarget = lowerGrade(ptGrade.grade);
      if (downgradeTarget === 'D') continue; // D 级无成本定义，跳过
      const tokenFreed = ptGrade.tokenSpent - pt.levelCosts[downgradeTarget].cost;

      if (tokenFreed < neededTokens * 0.5) continue; // 释放的 token 太少

      // 风险/收益评估 (User Persona 权重)
      const riskScore = calculateTradeRisk(partnerAgent, pt.block, ptGrade.grade, downgradeTarget, userProfile);
      const benefitScore = calculateTradeBenefit(requestingAgent, targetTaskName, currentGrade, desiredGrade, userProfile);

      // 交易成立条件: 收益 > 风险
      if (benefitScore > riskScore) {
        return {
          id: `trade_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          sourceAgent: requestingAgent,
          targetAgent: partnerAgent,
          offer: {
            taskId: pt.block.id,
            downgradeFrom: ptGrade.grade,
            downgradeTo: downgradeTarget,
            tokenFreed,
          },
          demand: {
            taskId: targetTaskId,
            upgradeFrom: currentGrade,
            upgradeTo: desiredGrade,
            tokenNeeded: neededTokens,
          },
          riskScore,
          benefitScore,
          accepted: true,
          rationale: `${AGENT_DEFINITIONS[requestingAgent].roleCn}与${AGENT_DEFINITIONS[partnerAgent].roleCn}达成协议：牺牲「${pt.block.taskName}」质量(${ptGrade.grade}→${downgradeTarget})换取「${targetTaskName}」升级(${currentGrade}→${desiredGrade})`,
          timestamp: new Date(),
        };
      }
    }
  }

  return null;
}

/**
 * 计算交易风险分:
 * - Deadline 任务降级风险极高
 * - 与用户 MBTI/职业相关度高的任务降级风险更高
 */
function calculateTradeRisk(
  agent: AgentId,
  block: ScheduleBlock,
  fromGrade: TaskGrade,
  toGrade: TaskGrade,
  profile: UserProfile,
): number {
  let risk = 0;

  // 基础风险: 降级幅度
  risk += (gradeRank(fromGrade) - gradeRank(toGrade)) * 20;

  // Deadline 不可交易 (已在上层过滤)
  if (block.isDeadline) risk += 100;

  // Agent 亲和度 (MBTI 相关)
  const agentAffinity = getAgentAffinity(agent, profile);
  risk += agentAffinity * 15; // 亲和度越高，降级该 Agent 任务风险越大

  // 高价值任务降级风险更大
  risk += Math.min(30, block.tokenCost / 50);

  return risk;
}

/**
 * 计算交易收益分:
 * - 升级目标任务的价值
 * - 与用户画像的匹配度
 */
function calculateTradeBenefit(
  agent: AgentId,
  taskName: string,
  fromGrade: TaskGrade,
  toGrade: TaskGrade,
  profile: UserProfile,
): number {
  let benefit = 0;

  // 基础收益: 升级幅度
  benefit += (gradeRank(toGrade) - gradeRank(fromGrade)) * 25;

  // Agent 亲和度
  const agentAffinity = getAgentAffinity(agent, profile);
  benefit += agentAffinity * 20;

  // 工作任务的升级对高刚性用户更有价值
  if (agent === 'ENTJ' && profile.rigidityCoefficient > 0.6) {
    benefit += 20;
  }

  // 娱乐任务的升级对低刚性用户更有价值
  if (agent === 'ESTP' && profile.rigidityCoefficient < 0.4) {
    benefit += 15;
  }

  return benefit;
}

/**
 * 根据 MBTI 计算用户对某 Agent 的亲和度 (0.0 ~ 1.0)
 */
function getAgentAffinity(agent: AgentId, profile: UserProfile): number {
  const mbti = profile.mbtiType || '';

  switch (agent) {
    case 'ENTJ':
      return (mbti.includes('J') ? 0.4 : 0) + (mbti.includes('T') ? 0.3 : 0) + 0.3;
    case 'ISFJ':
      return (mbti.includes('S') ? 0.4 : 0) + (mbti.includes('I') ? 0.3 : 0) + 0.3;
    case 'INFJ':
      return (mbti.includes('F') ? 0.4 : 0) + (mbti.includes('E') ? 0.3 : 0) + 0.3;
    case 'ESTP':
      return (mbti.includes('P') ? 0.5 : 0) + 0.3;
    default:
      return 0.5;
  }
}

// ==================== 工具函数 ====================

/** 等级数值排名 */
function gradeRank(grade: TaskGrade): number {
  const ranks: Record<TaskGrade, number> = { S: 4, A: 3, B: 2, C: 1, D: 0 };
  return ranks[grade] ?? 0;
}

/** 降一个等级 */
function lowerGrade(grade: TaskGrade): TaskGrade {
  const lower: Record<TaskGrade, TaskGrade> = { S: 'A', A: 'B', B: 'C', C: 'D', D: 'D' };
  return lower[grade];
}

/** 升一个等级 */
export function raiseGrade(grade: TaskGrade): TaskGrade {
  const upper: Record<TaskGrade, TaskGrade> = { D: 'C', C: 'B', B: 'A', A: 'S', S: 'S' };
  return upper[grade];
}

/**
 * 批量坍缩: 从 CouncilContext 中提取 Agent 状态,
 * 为不在 blocks 里的"虚拟任务"做简化坍缩 (仅基于 Agent 状态)
 */
export function collapseFromAgentStates(ctx: CouncilContext): CollapseResult[] {
  return ctx.agentStates.map(agent => {
    const weight = agent.currentWeight;
    const sat = agent.satisfaction;
    const composite = (weight / 4 * 50) + (sat / 100 * 50);

    let grade: TaskGrade;
    if (composite >= 80) grade = 'S';
    else if (composite >= 60) grade = 'A';
    else if (composite >= 40) grade = 'B';
    else if (composite >= 20) grade = 'C';
    else grade = 'D';

    const tokenInvested = Math.round(agent.currentWeight * 25);
    const baseCost = tokenInvested * 2;

    return {
      taskId: `agent_task_${agent.id}`,
      taskName: `${AGENT_DEFINITIONS[agent.id].roleCn}管辖任务`,
      ownerAgent: agent.id,
      initialGrade: grade,
      finalGrade: grade,
      tokenInvested,
      levelCosts: getTaskLevelCosts(baseCost),
      isDeadline: false,
    };
  });
}

/**
 * 生成交易日志文本
 */
export function formatTradeLog(trade: TradeProposal): string {
  return `[系统] ${trade.rationale}`;
}

/**
 * 验证坍缩结果的完整性
 */
export function validateCollapseResults(results: CollapseResult[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const r of results) {
    if (gradeRank(r.finalGrade) < 0) {
      errors.push(`任务 ${r.taskName} 的等级无效: ${r.finalGrade}`);
    }
    if (r.isDeadline && r.finalGrade === 'D') {
      errors.push(`Deadline 任务 ${r.taskName} 不应为 D 级`);
    }
    if (r.tokenInvested < 0) {
      errors.push(`任务 ${r.taskName} 的 Token 投入为负数`);
    }
  }

  return { valid: errors.length === 0, errors };
}
