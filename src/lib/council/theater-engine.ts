/**
 * Silent Council - 剧场引擎 (Theater Engine)
 * 设计文档 §4: 议会博弈引擎 · 3-5 分钟微型剧场
 *
 * 职责:
 * 1. 三阶段计时控制 (Phase 1: 0~30s, Phase 2: 30s~4m30s, Phase 3: 最后 30s)
 * 2. Tick 驱动的 Game Loop (每 2 秒推进一次)
 * 3. 争议度驱动的发言权分配
 * 4. 阶段转换的 SSE 事件广播
 * 5. 终端风格的加载动画文案
 */

import type { AgentId, AgentState, CouncilLogEntry } from './types';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS } from './agents';

// ==================== 阶段定义 ====================

export type TheaterPhase = 'LOADING' | 'NEGOTIATION' | 'COLLAPSE' | 'COMPLETE';

export interface TheaterConfig {
  /** 第一阶段: 数据加载与预演 (毫秒) */
  phase1DurationMs: number;
  /** 第二阶段: 核心博弈 (毫秒) */
  phase2DurationMs: number;
  /** 第三阶段: 执行与坍缩 (毫秒) */
  phase3DurationMs: number;
  /** 每个 Tick 的间隔 (毫秒) */
  tickIntervalMs: number;
  /** 最大博弈轮数 */
  maxRounds: number;
}

export const DEFAULT_THEATER_CONFIG: TheaterConfig = {
  phase1DurationMs: 15_000,   // 15s (缩短了，实际等待 API 时间会补充)
  phase2DurationMs: 240_000,  // 4 分钟
  phase3DurationMs: 15_000,   // 15s
  tickIntervalMs: 2_000,      // 每 2 秒推进一次
  maxRounds: 60,              // 最多 60 轮 (4min / 2s = 120 ticks, 取半)
};

// ==================== 剧场状态 ====================

export interface TheaterState {
  phase: TheaterPhase;
  phaseStartTime: number;
  sessionStartTime: number;
  currentTick: number;
  totalTicks: number;
  /** 当前阶段的进度百分比 (0~100) */
  progress: number;
  /** 哪些 Agent 在当前 Tick 获得了发言权 */
  activeSpeakers: AgentId[];
  /** 是否已被外部中止 */
  aborted: boolean;
}

export function createTheaterState(): TheaterState {
  return {
    phase: 'LOADING',
    phaseStartTime: Date.now(),
    sessionStartTime: Date.now(),
    currentTick: 0,
    totalTicks: 0,
    progress: 0,
    activeSpeakers: [],
    aborted: false,
  };
}

// ==================== Tick 管理器 ====================

export class TheaterClock {
  private config: TheaterConfig;
  private state: TheaterState;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private onTick?: (state: TheaterState) => void;
  private onPhaseChange?: (phase: TheaterPhase, state: TheaterState) => void;

  constructor(
    config: Partial<TheaterConfig> = {},
    callbacks?: {
      onTick?: (state: TheaterState) => void;
      onPhaseChange?: (phase: TheaterPhase, state: TheaterState) => void;
    },
  ) {
    this.config = { ...DEFAULT_THEATER_CONFIG, ...config };
    this.state = createTheaterState();
    this.onTick = callbacks?.onTick;
    this.onPhaseChange = callbacks?.onPhaseChange;
  }

  get currentPhase(): TheaterPhase {
    return this.state.phase;
  }

  get currentState(): TheaterState {
    return { ...this.state };
  }

  /** 获取当前阶段的已用时间 (ms) */
  get phaseElapsedMs(): number {
    return Date.now() - this.state.phaseStartTime;
  }

  /** 获取总已用时间 (ms) */
  get totalElapsedMs(): number {
    return Date.now() - this.state.sessionStartTime;
  }

  /** 计算当前阶段剩余时间 (ms) */
  get phaseRemainingMs(): number {
    const phaseDuration = this.getPhaseDuration(this.state.phase);
    return Math.max(0, phaseDuration - this.phaseElapsedMs);
  }

  /** 博弈阶段中到当前 Tick 为止可发言的最大轮数 */
  get maxTickRounds(): number {
    return Math.floor(this.config.phase2DurationMs / this.config.tickIntervalMs);
  }

  /** 是否还有剩余博弈时间 */
  get hasRemainingNegotiationTime(): boolean {
    if (this.state.phase !== 'NEGOTIATION') return false;
    return this.phaseElapsedMs < this.config.phase2DurationMs;
  }

  /** 推进到下一个阶段 */
  advancePhase(): TheaterPhase {
    const nextPhase = this.getNextPhase(this.state.phase);
    this.state.phase = nextPhase;
    this.state.phaseStartTime = Date.now();
    this.state.progress = 0;
    this.onPhaseChange?.(nextPhase, this.currentState);
    return nextPhase;
  }

  /** 手动推进一个 Tick (用于和 API 调用同步) */
  tick(): TheaterState {
    this.state.currentTick++;
    this.state.totalTicks++;

    // 更新进度
    const phaseDuration = this.getPhaseDuration(this.state.phase);
    this.state.progress = Math.min(100, Math.round((this.phaseElapsedMs / phaseDuration) * 100));

    this.onTick?.(this.currentState);
    return this.currentState;
  }

  /** 设置当前 Tick 的发言者 */
  setActiveSpeakers(speakers: AgentId[]): void {
    this.state.activeSpeakers = speakers;
  }

  /** 中止 */
  abort(): void {
    this.state.aborted = true;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** 等待指定毫秒 */
  async wait(ms: number): Promise<void> {
    if (this.state.aborted) return;
    return new Promise(resolve => {
      this.tickTimer = setTimeout(resolve, ms);
    });
  }

  private getPhaseDuration(phase: TheaterPhase): number {
    switch (phase) {
      case 'LOADING': return this.config.phase1DurationMs;
      case 'NEGOTIATION': return this.config.phase2DurationMs;
      case 'COLLAPSE': return this.config.phase3DurationMs;
      case 'COMPLETE': return 0;
    }
  }

  private getNextPhase(current: TheaterPhase): TheaterPhase {
    switch (current) {
      case 'LOADING': return 'NEGOTIATION';
      case 'NEGOTIATION': return 'COLLAPSE';
      case 'COLLAPSE': return 'COMPLETE';
      case 'COMPLETE': return 'COMPLETE';
    }
  }
}

// ==================== 终端风格加载动画文案 ====================

/** Phase 1: 数据加载动画文案序列 (已简化) */
export const PHASE1_LOADING_MESSAGES: string[] = [
  // 删除废话，直接在orchestrator中发送简洁消息
];

/** Phase 3: 坍缩阶段动画文案序列 */
export const PHASE3_COLLAPSE_MESSAGES: string[] = [
  '⚡ 锁定任务等级中...',
  '🎲 执行 RNG 结算...',
  '📊 计算属性变化...',
  '🎁 检测道具掉落...',
  '💰 Token 结算处理中...',
  '📜 生成议会决议报告...',
  '🔥 COLLAPSE COMPLETE.',
];

/** 生成阶段转换的系统公告 */
export function buildPhaseTransitionMessage(
  phase: TheaterPhase,
  sessionNumber: number,
  tickCount?: number,
): string {
  switch (phase) {
    case 'LOADING':
      return `🔗 第${sessionNumber}次议会 · 预演系统启动`;
    case 'NEGOTIATION':
      return `⚔️ 进入核心博弈阶段 · Game Loop 已激活 · 每 2 秒推进一轮`;
    case 'COLLAPSE':
      return `⚡ 博弈结束 (${tickCount || 0} 轮) · 进入坍缩阶段 · 锁定任务等级...`;
    case 'COMPLETE':
      return `📜 第${sessionNumber}次议会闭幕 · 结算报告生成完毕`;
    default:
      return '';
  }
}

// ==================== 争议度驱动的发言分配 ====================

/**
 * 设计文档 §4.2: 发言权轮转算法
 * 强制4个代理轮流发言，保证公平性和多样性
 */
export function selectSpeakerForTick(
  tick: number,
  agentStates: AgentState[],
  recentLogs: CouncilLogEntry[],
): { speaker: AgentId; reason: string } {
  // 固定4个代理轮转顺序
  const allIds: AgentId[] = ['ENTJ', 'ISFJ', 'INFJ', 'ESTP'];
  
  // 基于tick的轮转，确保每个代理都有机会发言
  const baseIdx = tick % allIds.length;
  let speaker = allIds[baseIdx];
  
  // 检查最近2条发言，如果正好是这个代理，跳到下一个
  const recentSpeakers = recentLogs
    .slice(-2)
    .map(log => log.agentId)
    .filter((id): id is AgentId => id !== null && id !== undefined);
  
  if (recentSpeakers.includes(speaker)) {
    // 跳到下一个代理
    speaker = allIds[(baseIdx + 1) % allIds.length];
  }
  
  // 每隔几轮，允许冲突代理插队
  if (tick % 7 === 0) {
    const recentConflicts = recentLogs.slice(-6);
    const conflictAgents = new Set<AgentId>();
    for (const log of recentConflicts) {
      if ((log.type === 'COUNTER' || log.type === 'VETO') && log.agentId) {
        conflictAgents.add(log.agentId as AgentId);
      }
    }
    
    if (conflictAgents.size > 0 && !recentSpeakers.includes(speaker)) {
      const conflictSpeaker = [...conflictAgents].find(a => !recentSpeakers.includes(a));
      if (conflictSpeaker) {
        return { speaker: conflictSpeaker, reason: '争议热点' };
      }
    }
  }
  
  return {
    speaker,
    reason: '轮值发言',
  };
}

// ==================== 博弈节奏控制 ====================

/**
 * 根据当前博弈进度动态调整节奏:
 * - 前 1/3: 慢节奏, 允许深度讨论和叙事旁白
 * - 中 1/3: 标准节奏, BID 和 TRADE 频率增加
 * - 后 1/3: 快节奏, 强制收敛, 少用叙事旁白
 */
export function getTickPacing(
  tick: number,
  maxTicks: number,
): {
  allowNarration: boolean;
  forceAction: boolean;
  tickDelayMs: number;
  urgency: 'low' | 'medium' | 'high';
} {
  const progress = tick / maxTicks;

  if (progress < 0.33) {
    return {
      allowNarration: true,
      forceAction: false,
      tickDelayMs: 2500,
      urgency: 'low',
    };
  } else if (progress < 0.66) {
    return {
      allowNarration: tick % 3 === 0, // 每 3 轮一次旁白
      forceAction: false,
      tickDelayMs: 2000,
      urgency: 'medium',
    };
  } else {
    return {
      allowNarration: false,
      forceAction: true,
      tickDelayMs: 1500,
      urgency: 'high',
    };
  }
}

/**
 * 生成"催促"消息 — 博弈后期强制推进
 */
export function buildUrgencyMessage(
  tick: number,
  maxTicks: number,
  dominantAgent: AgentId,
): string {
  const remaining = maxTicks - tick;

  if (remaining <= 3) {
    return `⏰ 最后 ${remaining} 轮！${AGENT_DEFINITIONS[dominantAgent].roleCn} 将获得最终裁决权。`;
  }
  if (remaining <= 8) {
    return `⏰ 仅剩 ${remaining} 轮博弈时间。未达成共识将强制收敛。`;
  }
  return '';
}

// ==================== 进度条渲染 ====================

/**
 * 生成终端风格的进度条字符串
 */
export function renderProgressBar(progress: number, width: number = 30): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${progress}%`;
}

/**
 * 生成阶段状态指示器
 */
export function renderPhaseIndicator(phase: TheaterPhase): string {
  const indicators: Record<TheaterPhase, string> = {
    LOADING: '🔵 PHASE 1: DATA LOADING',
    NEGOTIATION: '🟡 PHASE 2: NEGOTIATION',
    COLLAPSE: '🔴 PHASE 3: COLLAPSE',
    COMPLETE: '🟢 SESSION COMPLETE',
  };
  return indicators[phase];
}
