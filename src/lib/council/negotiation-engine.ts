/**
 * Silent Council - 博弈引擎 (4代理简化版)
 * 投票 · 否决 · Whisper · 底线检查 · 强制收敛
 */

import type {
  AgentId, AgentState, CouncilContext, CouncilLogEntry,
  BottomLineCheckResult, BottomLineViolation, ResourceDelta,
  WhisperMessage, WhisperParams, VoteParams, VetoParams,
  LogType, SessionStatus, DualChannelOutput,
  TokenAllocation, SystemBottomLine, ResourceInventory,
  ControversyScore,
} from './types';
import { DEFAULT_WHISPER_CONFIG, SYSTEM_BOTTOM_LINE, DEFAULT_TOKEN_ALLOCATION } from './types';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS, applyResourceDelta } from './agents';

// ==================== 投票系统 ====================

export interface VoteResult {
  proposalId: string;
  votes: Record<AgentId, { vote: 'APPROVE' | 'REJECT' | 'ABSTAIN' | 'VETO'; weight: number; reason?: string }>;
  result: 'APPROVED' | 'REJECTED' | 'VETOED' | 'DEADLOCKED';
  vetoAgent?: AgentId;
  approvalScore: number;
  totalWeight: number;
}

export function calculateAgentVote(
  agent: AgentState,
  proposalDelta: ResourceDelta,
  templateWeight: number,
): { vote: 'APPROVE' | 'REJECT' | 'ABSTAIN'; weight: number } {
  const primaryResource = AGENT_DEFINITIONS[agent.id].primaryResource;
  const delta = proposalDelta[primaryResource];
  const numericDelta = delta === undefined ? 0 : (typeof delta === 'string' ? parseFloat(delta) : delta);

  const effectiveWeight = agent.currentWeight * templateWeight;

  // Agent approves if proposal benefits their primary resource
  if (numericDelta > 0) return { vote: 'APPROVE', weight: effectiveWeight };
  if (numericDelta < -5) return { vote: 'REJECT', weight: effectiveWeight };

  // Satisfaction-based decision for neutral proposals
  if (agent.satisfaction > 60) return { vote: 'APPROVE', weight: effectiveWeight * 0.8 };
  if (agent.satisfaction < 30) return { vote: 'REJECT', weight: effectiveWeight * 0.6 };

  return { vote: 'ABSTAIN', weight: effectiveWeight * 0.3 };
}

export function tallyVotes(
  votes: Record<AgentId, { vote: 'APPROVE' | 'REJECT' | 'ABSTAIN' | 'VETO'; weight: number; reason?: string }>,
  proposalId: string,
): VoteResult {
  let approvalScore = 0;
  let totalWeight = 0;
  let vetoAgent: AgentId | undefined;

  for (const [agentId, v] of Object.entries(votes) as [AgentId, typeof votes[AgentId]][]) {
    totalWeight += v.weight;
    if (v.vote === 'VETO') {
      vetoAgent = agentId;
    } else if (v.vote === 'APPROVE') {
      approvalScore += v.weight;
    } else if (v.vote === 'REJECT') {
      approvalScore -= v.weight;
    }
  }

  let result: VoteResult['result'];
  if (vetoAgent) result = 'VETOED';
  else if (approvalScore > 0) result = 'APPROVED';
  else if (approvalScore < 0) result = 'REJECTED';
  else result = 'DEADLOCKED';

  return { proposalId, votes, result, vetoAgent, approvalScore, totalWeight };
}

// ==================== 否决权 ====================

export interface VetoCheck {
  canVeto: boolean;
  agent: AgentId;
  reason: string;
  influenceCost: number;
}

export function checkVetoPower(
  agentId: AgentId,
  context: CouncilContext,
  proposalDelta: ResourceDelta,
): VetoCheck {
  const def = AGENT_DEFINITIONS[agentId];
  const state = context.agentStates.find(a => a.id === agentId);

  if (!def.hasVetoPower || !state) {
    return { canVeto: false, agent: agentId, reason: '该代理没有否决权', influenceCost: 0 };
  }

  // Veto costs influence
  const influenceCost = 15;
  if (state.influence < influenceCost) {
    return { canVeto: false, agent: agentId, reason: `影响力不足 (${state.influence}/${influenceCost})`, influenceCost };
  }

  // ISFJ: health/sleep/finance veto
  if (agentId === 'ISFJ') {
    const hpDelta = proposalDelta.HP;
    const numHp = hpDelta === undefined ? 0 : (typeof hpDelta === 'string' ? parseFloat(hpDelta) : hpDelta);
    if (numHp < -10) {
      return { canVeto: true, agent: agentId, reason: '提案严重损害健康值', influenceCost };
    }
    // Check sleep in bottom line
    const blResult = checkBottomLines(context);
    if (blResult.violations.some(v => v.resource === 'SLEEP' && v.severity === 'CRITICAL')) {
      return { canVeto: true, agent: agentId, reason: '睡眠低于系统底线', influenceCost };
    }
  }

  // INFJ: meaning/overwork veto
  if (agentId === 'INFJ') {
    const timeDelta = proposalDelta.TIME;
    const numTime = timeDelta === undefined ? 0 : (typeof timeDelta === 'string' ? parseFloat(timeDelta) : timeDelta);
    if (numTime < -3) {
      return { canVeto: true, agent: agentId, reason: '提案导致过度劳动', influenceCost };
    }
    const blResult = checkBottomLines(context);
    if (blResult.violations.some(v => v.resource === 'SOCIAL' && v.severity === 'CRITICAL')) {
      return { canVeto: true, agent: agentId, reason: '社交/灵魂滋养严重不足', influenceCost };
    }
  }

  return { canVeto: false, agent: agentId, reason: '当前提案不触发否决条件', influenceCost };
}

export function executeVeto(
  agentId: AgentId,
  agentStates: AgentState[],
  influenceCost: number,
): AgentState[] {
  return agentStates.map(a => {
    if (a.id === agentId) {
      return { ...a, influence: Math.max(0, a.influence - influenceCost), status: 'VETOING' as const };
    }
    return a;
  });
}

// ==================== 双重底线检测 ====================

export function checkBottomLines(ctx: CouncilContext): BottomLineCheckResult {
  const violations: BottomLineViolation[] = [];
  const sbl = ctx.systemBottomLine;

  // Aggregate resource state from all agents
  const totalResources: ResourceInventory = { TIME: 0, HP: 0, SOC: 0, WLTH: 0 };
  for (const agent of ctx.agentStates) {
    totalResources.TIME += agent.resourceInventory.TIME;
    totalResources.HP += agent.resourceInventory.HP;
    totalResources.SOC += agent.resourceInventory.SOC;
    totalResources.WLTH += agent.resourceInventory.WLTH;
  }
  const avgHP = totalResources.HP / ctx.agentStates.length;
  const avgSOC = totalResources.SOC / ctx.agentStates.length;
  const avgTime = totalResources.TIME / ctx.agentStates.length;

  // SBL checks (hard limits)
  if (avgTime < sbl.minSleepHours) {
    violations.push({
      type: 'SBL', resource: 'SLEEP', currentValue: avgTime,
      threshold: sbl.minSleepHours, severity: 'CRITICAL',
      guardianAgent: 'ISFJ', message: `可用时间不足${sbl.minSleepHours}h（当前${avgTime.toFixed(1)}h），睡眠将受影响`,
    });
  }

  if (avgHP < 20) {
    violations.push({
      type: 'SBL', resource: 'HP', currentValue: avgHP,
      threshold: 20, severity: 'CRITICAL',
      guardianAgent: 'ISFJ', message: `HP值危险 (${avgHP.toFixed(0)}%)`,
    });
  }

  if (avgSOC < 15) {
    violations.push({
      type: 'SBL', resource: 'SOCIAL', currentValue: avgSOC,
      threshold: 15, severity: 'CRITICAL',
      guardianAgent: 'INFJ', message: `社交值严重不足 (${avgSOC.toFixed(0)})`,
    });
  }

  // 信用分 / Meltdown 检测 —— 基于 WLTH 代理的财务资源
  const wlthAgent = ctx.agentStates.find(a => a.id === 'ESTP');
  const wlthValue = wlthAgent?.resourceInventory.WLTH ?? 500;
  // 模拟信用分：WLTH 余额越低信用分越低 (简化映射)
  const impliedCreditScore = Math.min(200, Math.max(0, Math.round(wlthValue / 5)));

  if (wlthValue <= 0) {
    // MELTDOWN: Token 余额归零
    violations.push({
      type: 'SBL', resource: 'WLTH', currentValue: wlthValue,
      threshold: sbl.minBalance, severity: 'CRITICAL',
      guardianAgent: 'ISFJ', message: `⚠️ MELTDOWN: Token余额耗尽(${wlthValue})，ISFJ强制否决非必要开支`,
    });
  } else if (impliedCreditScore < 60) {
    // 信用分过低警告
    violations.push({
      type: 'UBL', resource: 'WLTH', currentValue: impliedCreditScore,
      threshold: 60, severity: 'WARNING',
      guardianAgent: 'ISFJ', message: `信用分过低(${impliedCreditScore})，ISFJ可否决高消耗提案`,
    });
  }

  return { passed: violations.length === 0, violations };
}

// ==================== Whisper 系统 ====================

export function detectWhisperTriggers(
  agentStates: AgentState[],
  recentLogs: CouncilLogEntry[],
): { shouldWhisper: boolean; suggestedPairs: [AgentId, AgentId][] } {
  const pairs: [AgentId, AgentId][] = [];

  // Count clashes between agents
  const clashCount: Record<string, number> = {};
  for (const log of recentLogs.slice(-20)) {
    if (log.type === 'COUNTER' || log.type === 'VETO') {
      const target = log.metadata?.targetAgent as AgentId | undefined;
      if (log.agentId && target) {
        const key = [log.agentId, target].sort().join('-');
        clashCount[key] = (clashCount[key] || 0) + 1;
      }
    }
  }

  for (const [key, count] of Object.entries(clashCount)) {
    if (count >= DEFAULT_WHISPER_CONFIG.conflictThreshold) {
      const [a, b] = key.split('-') as [AgentId, AgentId];
      pairs.push([a, b]);
    }
  }

  // Low satisfaction agents may whisper to allies
  for (const agent of agentStates) {
    if (agent.satisfaction < 25) {
      // Find an ally (same-ish sector alignment)
      const potentialAlly = agentStates.find(
        a => a.id !== agent.id && a.satisfaction > 50,
      );
      if (potentialAlly) {
        const pair: [AgentId, AgentId] = [agent.id, potentialAlly.id];
        if (!pairs.some(p => p[0] === pair[0] && p[1] === pair[1])) {
          pairs.push(pair);
        }
      }
    }
  }

  return { shouldWhisper: pairs.length > 0, suggestedPairs: pairs };
}

export function createWhisperMessage(
  params: WhisperParams,
  expiresInMs: number = DEFAULT_WHISPER_CONFIG.globalCooldownMs,
): WhisperMessage {
  return {
    id: `wh_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    sourceAgent: params.source_agent,
    targetAgent: params.target_agent,
    type: params.whisper_type,
    content: params.message,
    timestamp: new Date(),
    expiresAt: new Date(Date.now() + expiresInMs),
  };
}

// ==================== 强制收敛 ====================

/**
 * 智能收敛判断：
 * 1. 最小轮次保护（10轮）：确保充分博弈
 * 2. 满意度趋稳判断：方差 < 15 且最大差距 < 20
 * 3. 权重稳定判断：无代理权重在近3轮变化 > 0.15
 * 4. 最大轮次硬限制：避免无限循环
 */
export function forceConvergence(
  agentStates: AgentState[],
  round: number,
  maxRounds: number = 25,
  minRounds: number = 10,  // 最小轮次保护
  previousStates?: AgentState[], // 上一轮状态，用于判断变化趋势
): { shouldForce: boolean; convergenceAction: string } {
  
  // 1. 最小轮次保护
  if (round < minRounds) {
    return { shouldForce: false, convergenceAction: '' };
  }

  // 2. 智能提前收敛判断（满意度稳定 + 权重稳定）
  if (round < maxRounds) {
    const satisfactions = agentStates.map(a => a.satisfaction);
    const maxSat = Math.max(...satisfactions);
    const minSat = Math.min(...satisfactions);
    const avgSat = satisfactions.reduce((sum, s) => sum + s, 0) / satisfactions.length;
    const variance = satisfactions.reduce((sum, s) => sum + Math.pow(s - avgSat, 2), 0) / satisfactions.length;
    
    // 满意度方差小 (<15) 且极差小 (<20) → 趋于稳定
    const satisfactionStable = variance < 15 && (maxSat - minSat) < 20;
    
    // 检查权重变化（如果有历史数据）
    let weightStable = false;
    if (previousStates && previousStates.length === agentStates.length) {
      const maxWeightChange = Math.max(...agentStates.map((curr, i) => {
        const prev = previousStates.find(p => p.id === curr.id);
        return prev ? Math.abs(curr.currentWeight - prev.currentWeight) : 1;
      }));
      weightStable = maxWeightChange < 0.15; // 权重变化 < 15%
    }
    
    // 同时满足满意度稳定和权重稳定 → 提前收敛
    if (satisfactionStable && weightStable) {
      const sorted = [...agentStates].sort((a, b) => {
        const wDiff = b.currentWeight - a.currentWeight;
        if (wDiff !== 0) return wDiff;
        return b.satisfaction - a.satisfaction;
      });
      const dominant = sorted[0];
      return {
        shouldForce: true,
        convergenceAction: `议会在第 ${round} 轮达成均衡（满意度方差${variance.toFixed(1)}·权重稳定）。${AGENT_DEFINITIONS[dominant.id].roleCn}(${dominant.id}) 凭借权重${dominant.currentWeight.toFixed(2)}主导最终方案。`,
      };
    }
    
    return { shouldForce: false, convergenceAction: '' };
  }

  // 3. 达到最大轮次 → 强制收敛
  const sorted = [...agentStates].sort((a, b) => {
    const wDiff = b.currentWeight - a.currentWeight;
    if (wDiff !== 0) return wDiff;
    return b.satisfaction - a.satisfaction;
  });

  const dominant = sorted[0];
  return {
    shouldForce: true,
    convergenceAction: `议会已达最大轮次 ${round}，强制收敛。${AGENT_DEFINITIONS[dominant.id].roleCn}(${dominant.id}) 凭借最高权重(${dominant.currentWeight.toFixed(2)})获得最终裁决权。`,
  };
}

// ==================== 争议度计算 ====================

/**
 * 计算当前议会中各议题的争议度 (Controversy Score)
 * 争议度最高的任务 → 相关代理获得发言权优先
 */
export function calculateControversyScores(
  agentStates: AgentState[],
  logs: CouncilLogEntry[],
): ControversyScore[] {
  const taskMentions: Record<string, { forAgents: Set<AgentId>; againstAgents: Set<AgentId>; score: number }> = {};

  for (const log of logs) {
    if (!log.agentId) continue;
    const taskId = (log.metadata?.taskId as string) || 'general';

    if (log.type === 'PROPOSAL') {
      if (!taskMentions[taskId]) taskMentions[taskId] = { forAgents: new Set(), againstAgents: new Set(), score: 0 };
      taskMentions[taskId].forAgents.add(log.agentId);
      taskMentions[taskId].score += 1;
    }
    if (log.type === 'COUNTER' || log.type === 'VETO') {
      if (!taskMentions[taskId]) taskMentions[taskId] = { forAgents: new Set(), againstAgents: new Set(), score: 0 };
      taskMentions[taskId].againstAgents.add(log.agentId);
      taskMentions[taskId].score += 2; // 反对/否决增加更多争议
    }
  }

  // 代理满意度差异也增加争议度
  const maxSat = Math.max(...agentStates.map(a => a.satisfaction));
  const minSat = Math.min(...agentStates.map(a => a.satisfaction));
  const satDisparity = maxSat - minSat;

  return Object.entries(taskMentions).map(([taskId, data]) => ({
    taskId,
    score: data.score + (satDisparity > 30 ? 2 : 0),
    contestingAgents: [...new Set([...data.forAgents, ...data.againstAgents])],
  })).sort((a, b) => b.score - a.score);
}

/**
 * 动态发言顺序：争议度最高的议题相关代理先发言
 * 设计文档 §4.2: 发言权轮转算法
 */
export function getDynamicSpeakingOrder(
  agentStates: AgentState[],
  logs: CouncilLogEntry[],
  round: number,
): AgentId[] {
  // 首轮：按默认顺序
  if (round <= 1 || logs.length < 4) {
    return [...ALL_AGENT_IDS];
  }

  const controversies = calculateControversyScores(agentStates, logs);
  if (controversies.length === 0) return [...ALL_AGENT_IDS];

  // 参与高争议议题的代理优先发言
  const prioritized = new Set<AgentId>();
  for (const c of controversies) {
    for (const a of c.contestingAgents) {
      prioritized.add(a);
    }
  }

  // 剩余代理按权重降序
  const remaining = ALL_AGENT_IDS
    .filter(a => !prioritized.has(a))
    .sort((a, b) => {
      const stateA = agentStates.find(s => s.id === a);
      const stateB = agentStates.find(s => s.id === b);
      return (stateB?.currentWeight || 0) - (stateA?.currentWeight || 0);
    });

  return [...prioritized, ...remaining];
}

// ==================== P2P 自动交易触发 ====================

export interface AutoTradeSuggestion {
  sourceAgent: AgentId;
  targetAgent: AgentId;
  offer: ResourceDelta;
  demand: ResourceDelta;
  rationale: string;
}

/**
 * 检测自动交易机会
 * 设计文档 §5.2: Agent 资金不足 → 查询谁有余量 → 提出条件 → 广播日志
 */
export function detectAutoTradeOpportunity(
  agentStates: AgentState[],
): AutoTradeSuggestion[] {
  const suggestions: AutoTradeSuggestion[] = [];

  for (const agent of agentStates) {
    const def = AGENT_DEFINITIONS[agent.id];
    const primaryVal = agent.resourceInventory[def.primaryResource];

    // 代理在核心资源上贫乏 (< 30)
    if (primaryVal < 30) {
      // 找到在该资源上富裕的代理
      const richAgent = agentStates
        .filter(a => a.id !== agent.id)
        .sort((a, b) => {
          const aRes = a.resourceInventory[def.primaryResource];
          const bRes = b.resourceInventory[def.primaryResource];
          return bRes - aRes;
        })[0];

      if (richAgent && richAgent.resourceInventory[def.primaryResource] > 60) {
        const richDef = AGENT_DEFINITIONS[richAgent.id];

        suggestions.push({
          sourceAgent: agent.id,
          targetAgent: richAgent.id,
          offer: { [richDef.primaryResource]: 10 } as ResourceDelta,
          demand: { [def.primaryResource]: 15 } as ResourceDelta,
          rationale: `${def.roleCn}的${def.primaryResource}不足(${primaryVal})，向${richDef.roleCn}请求交易`,
        });
      }
    }
  }

  return suggestions;
}

// ==================== 会议管理 ====================

export class CouncilSession {
  public context: CouncilContext;
  public logs: CouncilLogEntry[] = [];
  public whispers: WhisperMessage[] = [];
  public status: SessionStatus = 'ACTIVE';
  public speakingOrder: AgentId[];

  constructor(
    context: CouncilContext,
    speakingOrder?: AgentId[],
  ) {
    this.context = context;
    this.speakingOrder = speakingOrder || [...ALL_AGENT_IDS];
  }

  addLog(entry: Omit<CouncilLogEntry, 'id' | 'timestamp'>): CouncilLogEntry {
    const log: CouncilLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
    };
    this.logs.push(log);
    this.context.recentLogs = this.logs.slice(-20);
    return log;
  }

  getCurrentSpeaker(): AgentId {
    const idx = (this.context.currentRound - 1) % this.speakingOrder.length;
    return this.speakingOrder[idx];
  }

  advanceRound(): void {
    this.context.currentRound += 1;
  }

  updateAgentState(agentId: AgentId, updates: Partial<AgentState>): void {
    this.context.agentStates = this.context.agentStates.map(a =>
      a.id === agentId ? { ...a, ...updates } : a,
    );
  }

  applyVote(voteResult: VoteResult): void {
    for (const [agentId, v] of Object.entries(voteResult.votes) as [AgentId, typeof voteResult.votes[AgentId]][]) {
      const state = this.context.agentStates.find(a => a.id === agentId);
      if (!state) continue;

      // Satisfaction changes based on outcome
      let satDelta = 0;
      if (voteResult.result === 'APPROVED' && v.vote === 'APPROVE') satDelta = 5;
      else if (voteResult.result === 'REJECTED' && v.vote === 'REJECT') satDelta = 5;
      else if (voteResult.result === 'VETOED' && v.vote === 'VETO') satDelta = 10;
      else satDelta = -3;

      this.updateAgentState(agentId, {
        satisfaction: Math.max(0, Math.min(100, state.satisfaction + satDelta)),
      });
    }
  }

  conclude(verdict: string): void {
    this.status = 'CONCLUDED';
    this.addLog({
      agentId: null,
      type: 'CONSENSUS',
      content: verdict,
    });
  }

  deadlock(): void {
    this.status = 'DEADLOCKED';
    this.addLog({
      agentId: null,
      type: 'SYSTEM',
      content: '议会陷入僵局。',
    });
  }
}
