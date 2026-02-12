/**
 * Silent Council - 编排器 (Orchestrator)
 * SecondMe API 集成 · SSE 流式 · 双通道解析
 * §4 剧场引擎集成 · 三阶段 Tick 驱动
 */

import type {
  AgentId, AgentState, CouncilContext, CouncilLogEntry, CouncilVerdict,
  DualChannelOutput, UserProfile, TokenAllocation, ResultCard,
  LogType, ResourceDelta, RNGResult, TaskGrade,
  CollapseResult, TradeProposal, SettlementReport,
} from './types';
import { SYSTEM_BOTTOM_LINE, DEFAULT_TOKEN_ALLOCATION, DUAL_CHANNEL_SEPARATOR } from './types';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS, createAllAgentStates, applyResourceDelta, computeMBTIAllocation } from './agents';
import { buildAgentPrompt, buildNarrationPrompt, parseDualChannelOutput, sanitizeAgentOutput, cleanRawAPIResponse, isValidNegotiation } from './prompts';
import { CouncilSession, checkBottomLines, detectWhisperTriggers, forceConvergence, tallyVotes, calculateAgentVote, checkVetoPower, executeVeto, getDynamicSpeakingOrder, detectAutoTradeOpportunity } from './negotiation-engine';
import { rollTaskResult } from './schedule-engine';
import { collapseFromAgentStates, formatTradeLog } from './collapse-engine';
import { buildSettlementReport, settlementToResultCard, serializeSettlementReport } from './settlement-engine';
import {
  TheaterClock, DEFAULT_THEATER_CONFIG,
  PHASE1_LOADING_MESSAGES, PHASE3_COLLAPSE_MESSAGES,
  buildPhaseTransitionMessage, selectSpeakerForTick, getTickPacing,
  buildUrgencyMessage, renderProgressBar, renderPhaseIndicator,
} from './theater-engine';

// ==================== 议会计数器 ====================

let councilSessionCounter = 0;

// ==================== SecondMe API ====================

const SECONDME_API_BASE_URL = process.env.SECONDME_API_BASE_URL || 'https://app.mindos.com/gate/lab';

interface SecondMeResponse {
  content: string;
  role: string;
}

async function callSecondMeAPI(
  accessToken: string,
  message: string,
  systemPrompt?: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const url = `${SECONDME_API_BASE_URL}/api/secondme/chat/stream`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message,
      systemPrompt,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    throw new Error(`SecondMe API error: ${response.status} ${response.statusText}`);
  }

  // Handle SSE streaming
  if (onChunk && response.body) {
    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content || parsed.content || '';
          if (chunk) {
            fullContent += chunk;
            onChunk(chunk);
          }
        } catch {
          // Non-JSON SSE data, treat as raw text
          fullContent += data;
          onChunk(data);
        }
      }
    }
    return fullContent;
  }

  // Non-streaming
  const data = await response.json();
  return data.content || data.choices?.[0]?.message?.content || '';
}

// ==================== 议会编排 ====================

export interface OrchestratorConfig {
  maxRounds: number;
  templateId: string;
  userProfile: UserProfile;
  tokenAllocation: TokenAllocation;
  trigger: string;
  accessToken: string;
  scheduleBlocks?: any[]; // ScheduleBlock[] 日程任务列表
  onLog?: (entry: CouncilLogEntry) => void;
  onChunk?: (agentId: AgentId, chunk: string) => void;
  /** §4 剧场引擎: 启用 Tick 驱动的时间控制 */
  enableTheater?: boolean;
}

/** 根据 Token 四维分配计算代理权重 */
function tokenAllocationToWeights(alloc: TokenAllocation): Record<AgentId, number> {
  const total = alloc.efficiency + alloc.health + alloc.relationship + alloc.risk;
  if (total === 0) return { ENTJ: 1, ISFJ: 1, INFJ: 1, ESTP: 1 };
  return {
    ENTJ: (alloc.efficiency / total) * 4,
    ISFJ: (alloc.health / total) * 4,
    INFJ: (alloc.relationship / total) * 4,
    ESTP: (alloc.risk / total) * 4,
  };
}

export async function runCouncilSession(config: OrchestratorConfig): Promise<{
  verdict: CouncilVerdict;
  logs: CouncilLogEntry[];
  finalStates: AgentState[];
  resultCard: ResultCard;
  roundNumber: number;
}> {
  const startTime = Date.now();
  councilSessionCounter++;
  const sessionNumber = councilSessionCounter;

  // MBTI-based allocation fallback (设计文档 §1.2)
  const effectiveAllocation = config.tokenAllocation
    || (config.userProfile.mbtiType ? computeMBTIAllocation(config.userProfile.mbtiType) : DEFAULT_TOKEN_ALLOCATION);
  const weights = tokenAllocationToWeights(effectiveAllocation);

  // Initialize agent states with allocation weights
  const agentStates = createAllAgentStates().map(a => ({
    ...a,
    currentWeight: weights[a.id],
  }));

  const context: CouncilContext = {
    sessionId: `session_${Date.now()}`,
    templateId: config.templateId,
    templateName: 'Token分配博弈',
    currentRound: 1,
    chairAgentId: electChair(agentStates),
    agentStates,
    recentLogs: [],
    trigger: config.trigger,
    userProfile: config.userProfile,
    tokenAllocation: config.tokenAllocation,
    systemBottomLine: SYSTEM_BOTTOM_LINE,
    systemStatus: {
      criticalAlerts: [],
      overallHealth: 100,
      currentTime: new Date().toISOString(),
    },
    scheduleBlocks: config.scheduleBlocks, // 添加日程任务
  };

  const session = new CouncilSession(context);

  // ========================================================
  // §4 剧场引擎: 初始化 TheaterClock
  // ========================================================
  const theaterEnabled = config.enableTheater !== false; // 默认开启
  const clock = new TheaterClock(DEFAULT_THEATER_CONFIG, {
    onTick: (state) => {
      // 移除了每个tick的进度条广播，减少系统消息干扰
    },
    onPhaseChange: (phase, state) => {
      // 只在重要阶段转换时发送消息
      if (phase === 'NEGOTIATION') {
        const phaseLog = session.addLog({
          agentId: null,
          type: 'SYSTEM',
          content: `⚔️ 进入核心博弈阶段`,
          metadata: { phase },
        });
        config.onLog?.(phaseLog);
      }
      // COLLAPSE阶段的消息在后面单独处理
    },
  });

  // ========================================================
  // 第一阶段: 数据加载与预演 (设计文档 §4.1 Phase 1)
  // LOADING Phase (0-15s)
  // ========================================================

  // Phase 1 简化: 只发一条开场消息
  const openLog = session.addLog({
    agentId: null,
    type: 'SYSTEM',
    content: `📋 第${sessionNumber}次议会召开 | Token分配: 效率${effectiveAllocation.efficiency}%·健康${effectiveAllocation.health}%·关系${effectiveAllocation.relationship}%·风险${effectiveAllocation.risk}% | 议题: ${config.trigger}`,
  });
  config.onLog?.(openLog);

  // 底线检查
  const blCheck = checkBottomLines(context);
  if (!blCheck.passed) {
    for (const v of blCheck.violations) {
      const alertLog = session.addLog({
        agentId: v.guardianAgent,
        type: 'BOTTOM_LINE_ALERT',
        content: `[${v.type}] ${v.message}`,
        metadata: { violation: v },
      });
      config.onLog?.(alertLog);
    }
  }

  // 跳过初始立场，直接进入博弈阶段
  // Phase 1 完成 → 进入 NEGOTIATION
  if (theaterEnabled) {
    clock.advancePhase(); // LOADING → NEGOTIATION
  }

  // ========================================================
  // 第二阶段: 核心议会博弈 (设计文档 §4.1 Phase 2)
  // NEGOTIATION Phase: Tick 驱动, 争议度发言权
  // ========================================================

  // 历史状态跟踪：用于智能收敛判断
  let previousRoundStates: AgentState[] | undefined = undefined;

  while (session.status === 'ACTIVE' && context.currentRound <= config.maxRounds) {
    // §4.2: Tick 推进
    if (theaterEnabled) {
      clock.tick();
      
      // 博弈节奏控制
      const pacing = getTickPacing(clock.currentState.currentTick, clock.maxTickRounds);
      
      // 催促消息 (后期)
      if (pacing.urgency === 'high') {
        const dominant = electChair(context.agentStates);
        const urgencyMsg = buildUrgencyMessage(
          clock.currentState.currentTick,
          clock.maxTickRounds,
          dominant,
        );
        if (urgencyMsg) {
          const urgLog = session.addLog({
            agentId: null,
            type: 'SYSTEM',
            content: urgencyMsg,
          });
          config.onLog?.(urgLog);
        }
      }
    }

    // §4.2: 争议度驱动发言权
    let speaker: AgentId;
    if (theaterEnabled) {
      const selection = selectSpeakerForTick(
        clock.currentState.currentTick,
        context.agentStates,
        session.logs.slice(-20),
      );
      speaker = selection.speaker;
      clock.setActiveSpeakers([speaker]);

      // 移除了系统发言提示，直接让AI发言
    } else {
      // 非剧场模式: 使用旧的轮转
      const dynamicOrder = getDynamicSpeakingOrder(context.agentStates, session.logs, context.currentRound);
      const speakerIdx = (context.currentRound - 1) % dynamicOrder.length;
      speaker = dynamicOrder[speakerIdx];
    }

    const prompt = buildAgentPrompt(speaker, context);

    // Call SecondMe API
    let rawResponse = '';
    try {
      rawResponse = await callSecondMeAPI(
        config.accessToken,
        prompt,
        undefined,
        (chunk) => config.onChunk?.(speaker, chunk),
      );
    } catch (error) {
      const errorLog = session.addLog({
        agentId: speaker,
        type: 'SYSTEM',
        content: `代理 ${speaker} 通信失败: ${error instanceof Error ? error.message : '未知错误'}`,
      });
      config.onLog?.(errorLog);
      session.advanceRound();
      continue;
    }

    // 预清理：移除API元数据泄露（在解析双通道之前）
    const cleanedResponse = cleanRawAPIResponse(rawResponse);

    // Parse dual channel output
    const parsed = parseDualChannelOutput(cleanedResponse);
    if (parsed) {
      // 文本后处理管道 (设计文档 §4.2): 去除 Markdown、AI惯用语、截断 120 字
      parsed.public_speech = sanitizeAgentOutput(parsed.public_speech);
      await processAgentOutput(session, speaker, parsed, config);
    } else {
      // Fallback: treat entire response as public speech (with sanitization)
      const cleaned = sanitizeAgentOutput(rawResponse);
      const speechLog = session.addLog({
        agentId: speaker,
        type: 'SPEECH',
        content: cleaned,
      });
      config.onLog?.(speechLog);
    }

    // P2P 自动交易触发 (设计文档 §5.2) - 降低触发频率，避免干扰
    // 只在特定轮次检查（每5轮一次）
    if (context.currentRound % 5 === 0) {
      const tradeSuggestions = detectAutoTradeOpportunity(context.agentStates);
      // 最多只处理1个交易建议，避免消息过多
      if (tradeSuggestions.length > 0) {
        const trade = tradeSuggestions[0];
        applyTrade(session, trade.sourceAgent, trade.targetAgent, trade.demand);
        const tradeLog = session.addLog({
          agentId: trade.sourceAgent,
          type: 'SPEECH',
          content: `[交易] ${trade.rationale}`,
          metadata: { tradeType: 'auto', targetAgent: trade.targetAgent },
        });
        config.onLog?.(tradeLog);
      }
    }

    // Check whisper triggers - 降低触发频率
    if (context.currentRound % 6 === 0) {
      const whisperCheck = detectWhisperTriggers(context.agentStates, session.logs);
      if (whisperCheck.shouldWhisper && whisperCheck.suggestedPairs.length > 0) {
        // 只处理第一对密语，避免消息过多
        const [src, tgt] = whisperCheck.suggestedPairs[0];
        const whisperLog = session.addLog({
          agentId: src,
          type: 'WHISPER',
          content: `${AGENT_DEFINITIONS[src].icon} 向 ${AGENT_DEFINITIONS[tgt].icon} 发送了一条密语...`,
          metadata: { targetAgent: tgt },
        });
        config.onLog?.(whisperLog);
      }
    }

    // Force convergence check (智能收敛)
    const convergence = forceConvergence(
      context.agentStates, 
      context.currentRound, 
      config.maxRounds,
      10, // minRounds
      previousRoundStates
    );
    if (convergence.shouldForce) {
      session.conclude(convergence.convergenceAction);
      const convergenceLog = session.addLog({
        agentId: null,
        type: 'SYSTEM',
        content: convergence.convergenceAction,
      });
      config.onLog?.(convergenceLog);
      break;
    }

    // §4 剧场引擎: 节奏控制延迟
    if (theaterEnabled && clock.currentPhase === 'NEGOTIATION') {
      const pacing = getTickPacing(clock.currentState.currentTick, clock.maxTickRounds);
      await clock.wait(pacing.tickDelayMs);
    }

    // 保存当前轮状态作为下一轮的历史参照
    previousRoundStates = context.agentStates.map(a => ({ ...a }));

    session.advanceRound();
  }

  // ========================================================
  // 第三阶段: 执行与坍缩 (设计文档 §4.1 Phase 3)
  // COLLAPSE Phase: 锁定任务最终等级 → Token 结算 → RNG Roll → 结算卡片
  // ========================================================

  // Phase 2 完成 → 进入 COLLAPSE
  if (theaterEnabled) {
    clock.advancePhase(); // NEGOTIATION → COLLAPSE
  }

  // 合并的坍缩阶段提示（一条消息）
  const phase3Log = session.addLog({
    agentId: null,
    type: 'SYSTEM',
    content: '⚡ 博弈结束·进入坍缩阶段·锁定任务等级·执行 RNG 结算·计算属性变化·检测道具掉落·Token 结算处理中...',
  });
  config.onLog?.(phase3Log);

  // ── §5 The Collapse: 任务分级与坍缩 ──
  // 使用增强版坍缩引擎: Agent 状态 → 每任务等级 + P2P 交易
  const collapseResults: CollapseResult[] = collapseFromAgentStates(context);

  // 广播坍缩结果
  for (const cr of collapseResults) {
    const gradeIcon = { S: '🏆', A: '⭐', B: '✅', C: '⚠️', D: '💀' }[cr.finalGrade] || '❓';
    const collapseLog = session.addLog({
      agentId: cr.ownerAgent,
      type: 'SYSTEM',
      content: `${gradeIcon} ${cr.taskName} 等级锁定: ${cr.initialGrade} → ${cr.finalGrade} (投入 ${cr.tokenInvested} Token)`,
      metadata: { grade: cr.finalGrade, taskId: cr.taskId },
    });
    config.onLog?.(collapseLog);
  }

  // ── §6 The Roll: 结算系统 · 事件卡片 · RNG ──
  const realDurationSec = Math.round((Date.now() - startTime) / 1000);

  const settlementReport = buildSettlementReport({
    sessionId: context.sessionId,
    sessionNumber,
    collapseResults,
    trades: [],
    agentStates: context.agentStates,
    totalBudget: 1000,
    realDurationSec,
    logs: session.logs,
  });

  // 广播 RNG 事件卡片结果
  for (const card of settlementReport.eventCards) {
    const resultIcon = {
      CRITICAL_SUCCESS: '🎯 大成功',
      SUCCESS: '✓ 成功',
      BARELY_PASSED: '😅 勉强通过',
      CRITICAL_FAIL: '💥 大失败',
      SPECIAL_ITEM: '🎁 特殊道具',
      COMBO_BONUS: '🔥 连击',
      MELTDOWN_RECOVERY: '🛡️ 恢复',
    }[card.type] || '❓';

    // 使用具体的任务结果描述和属性影响（设计文档 §10）
    const resultDesc = card.resultDescription || card.narrative;
    const impactDesc = card.statImpact ? ` → ${card.statImpact}` : '';
    
    const rngLog = session.addLog({
      agentId: card.ownerAgent,
      type: 'SYSTEM',
      content: `${resultIcon} | ${card.taskName}: ${resultDesc}${impactDesc}`,
      metadata: { eventCard: card },
    });
    config.onLog?.(rngLog);

    // 应用属性变化到 Agent 资源
    const agentState = context.agentStates.find(a => a.id === card.ownerAgent);
    if (agentState) {
      const delta: ResourceDelta = {
        HP: card.statChanges.sanity,
        SOC: card.statChanges.social,
        WLTH: card.statChanges.wealth,
      };
      session.updateAgentState(card.ownerAgent, {
        resourceInventory: applyResourceDelta(agentState.resourceInventory, delta),
      });
    }

    // 广播特殊道具获取
    for (const item of card.specialItems) {
      const itemLog = session.addLog({
        agentId: card.ownerAgent,
        type: 'SYSTEM',
        content: `${item.icon} 获得道具「${item.name}」: ${item.description}`,
        metadata: { specialItem: item },
      });
      config.onLog?.(itemLog);
    }
  }

  // 广播结算总结
  const summaryLog = session.addLog({
    agentId: null,
    type: 'SYSTEM',
    content: serializeSettlementReport(settlementReport),
    metadata: { settlementReport },
  });
  config.onLog?.(summaryLog);

  // Phase 3 完成 → COMPLETE
  if (theaterEnabled) {
    clock.advancePhase(); // COLLAPSE → COMPLETE
  }

  // Build verdict
  const verdict = buildVerdict(session);

  // 转换为兼容旧接口的 ResultCard
  const resultCard = settlementToResultCard(settlementReport);

  return {
    verdict,
    logs: session.logs,
    finalStates: context.agentStates,
    resultCard,
    roundNumber: session.context.currentRound,
  };
}

// ==================== 坍缩逻辑已迁移到 collapse-engine.ts ====================
// ==================== 结算逻辑已迁移到 settlement-engine.ts ====================

// ==================== 代理输出处理 ====================

async function processAgentOutput(
  session: CouncilSession,
  speaker: AgentId,
  output: DualChannelOutput,
  config: OrchestratorConfig,
): Promise<void> {
  const ctx = session.context;

  // 验证是否为有效的讨价还价（设计文档 §2.5）
  const validation = isValidNegotiation(output.public_speech, output.internal_state.intent);
  if (!validation.valid) {
    // 发牢骚被拒绝，记录警告
    const warningLog = session.addLog({
      agentId: null,
      type: 'SYSTEM',
      content: `⚠️ ${AGENT_DEFINITIONS[speaker].icon} 的发言被系统拒绝: ${validation.reason}`,
    });
    config.onLog?.(warningLog);
    
    // 惩罚：降低该代理的满意度
    const currentState = ctx.agentStates.find(a => a.id === speaker);
    if (currentState) {
      session.updateAgentState(speaker, {
        satisfaction: Math.max(0, currentState.satisfaction - 10),
      });
    }
    return; // 不处理这条消息
  }

  // Process intent (避免重复添加日志)
  switch (output.internal_state.intent) {
    case 'propose': {
      // 添加提案日志
      const speechLog = session.addLog({
        agentId: speaker,
        type: 'PROPOSAL',
        content: output.public_speech,
        internalState: output.internal_state,
      });
      config.onLog?.(speechLog);

      // Generate narration for proposals
      const narration = await generateNarration(speaker, output.public_speech, ctx, config);
      if (narration) {
        const narLog = session.addLog({ agentId: speaker, type: 'NARRATION', content: narration });
        config.onLog?.(narLog);
      }
      break;
    }

    case 'veto': {
      // 否决权已禁用，转为普通反提案（讨价还价）
      const speechLog = session.addLog({
        agentId: speaker,
        type: 'COUNTER',
        content: output.public_speech,
        internalState: output.internal_state,
      });
      config.onLog?.(speechLog);
      break;
    }

    case 'trade': {
      if (output.internal_state.resource_delta && output.internal_state.target_agent) {
        applyTrade(session, speaker, output.internal_state.target_agent, output.internal_state.resource_delta);
        const tradeLog = session.addLog({
          agentId: speaker,
          type: 'SPEECH',
          content: output.public_speech,
          metadata: { actionType: 'trade', targetAgent: output.internal_state.target_agent },
        });
        config.onLog?.(tradeLog);
      }
      break;
    }

    case 'whisper': {
      if (output.internal_state.target_agent) {
        const wLog = session.addLog({
          agentId: speaker,
          type: 'WHISPER',
          content: `[密语→${output.internal_state.target_agent}] ${output.public_speech}`,
          metadata: { targetAgent: output.internal_state.target_agent },
        });
        config.onLog?.(wLog);
      }
      break;
    }

    case 'bid': {
      // BID: 投入私房钱升级任务等级 (设计文档 §4.2)
      const bidLog = session.addLog({
        agentId: speaker,
        type: 'PROPOSAL',
        content: `${AGENT_DEFINITIONS[speaker].icon} 出价升级: ${output.public_speech}`,
        metadata: { actionType: 'bid', resource_delta: output.internal_state.resource_delta },
      });
      config.onLog?.(bidLog);
      // Apply resource cost
      if (output.internal_state.resource_delta) {
        const inverseDelta: ResourceDelta = {};
        for (const [k, v] of Object.entries(output.internal_state.resource_delta)) {
          const numVal = typeof v === 'string' ? parseFloat(v as string) : (v as number);
          if (!isNaN(numVal)) inverseDelta[k as keyof ResourceDelta] = -Math.abs(numVal);
        }
        const state = ctx.agentStates.find(a => a.id === speaker);
        if (state) {
          session.updateAgentState(speaker, {
            resourceInventory: applyResourceDelta(state.resourceInventory, inverseDelta),
          });
        }
      }
      break;
    }

    case 'attack': {
      // ATTACK: 嘲讽对手方案 (设计文档 §4.2)
      const attackLog = session.addLog({
        agentId: speaker,
        type: 'COUNTER',
        content: `${AGENT_DEFINITIONS[speaker].icon} 嘲讽: ${output.public_speech}`,
        metadata: { actionType: 'attack', targetAgent: output.internal_state.target_agent },
      });
      config.onLog?.(attackLog);
      // 被攻击方满意度下降
      if (output.internal_state.target_agent) {
        const targetState = ctx.agentStates.find(a => a.id === output.internal_state.target_agent);
        if (targetState) {
          session.updateAgentState(output.internal_state.target_agent, {
            satisfaction: Math.max(0, targetState.satisfaction - 8),
          });
        }
      }
      break;
    }

    case 'speak':
    case 'counter':
    default: {
      // 默认情况：添加普通发言日志
      const speechLog = session.addLog({
        agentId: speaker,
        type: intentToLogType(output.internal_state.intent),
        content: output.public_speech,
        internalState: output.internal_state,
      });
      config.onLog?.(speechLog);
      break;
    }
  }

  // Update agent satisfaction based on emotional state
  const satChange = emotionToSatisfaction(output.internal_state.emotional_state);
  const currentState = ctx.agentStates.find(a => a.id === speaker);
  if (currentState) {
    session.updateAgentState(speaker, {
      satisfaction: Math.max(0, Math.min(100, currentState.satisfaction + satChange)),
      status: 'IDLE',
    });
  }
}

// ==================== 叙事旁白生成 ====================

async function generateNarration(
  agentId: AgentId,
  speech: string,
  ctx: CouncilContext,
  config: OrchestratorConfig,
): Promise<string | null> {
  try {
    const prompt = buildNarrationPrompt(agentId, speech, ctx);
    return await callSecondMeAPI(config.accessToken, prompt);
  } catch {
    return null;
  }
}

// ==================== 辅助函数 ====================

function electChair(agents: AgentState[]): AgentId {
  // Chair = highest weighted agent
  const sorted = [...agents].sort((a, b) => b.currentWeight - a.currentWeight);
  return sorted[0].id;
}

function intentToLogType(intent: DualChannelOutput['internal_state']['intent']): LogType {
  switch (intent) {
    case 'propose': return 'PROPOSAL';
    case 'counter': return 'COUNTER';
    case 'veto': return 'VETO';
    case 'whisper': return 'WHISPER';
    case 'trade': return 'SPEECH';
    case 'bid': return 'PROPOSAL';
    case 'attack': return 'COUNTER';
    case 'speak':
    default: return 'SPEECH';
  }
}

function emotionToSatisfaction(emotion: DualChannelOutput['internal_state']['emotional_state']): number {
  switch (emotion) {
    case 'excited': return 5;
    case 'scheming': return 2;
    case 'neutral': return 0;
    case 'worried': return -2;
    case 'angry': return -5;
    case 'depressed': return -8;
  }
}

function applyTrade(
  session: CouncilSession,
  source: AgentId,
  target: AgentId,
  delta: ResourceDelta,
): void {
  const srcState = session.context.agentStates.find(a => a.id === source);
  const tgtState = session.context.agentStates.find(a => a.id === target);
  if (!srcState || !tgtState) return;

  // Apply negative delta to source, positive to target
  const inverseDelta: ResourceDelta = {};
  for (const [k, v] of Object.entries(delta)) {
    const numVal = typeof v === 'string' ? parseFloat(v as string) : (v as number);
    if (!isNaN(numVal)) inverseDelta[k as keyof ResourceDelta] = -numVal;
  }

  session.updateAgentState(source, {
    resourceInventory: applyResourceDelta(srcState.resourceInventory, inverseDelta),
  });
  session.updateAgentState(target, {
    resourceInventory: applyResourceDelta(tgtState.resourceInventory, delta),
  });
}

function buildVerdict(session: CouncilSession): CouncilVerdict {
  const actions = session.logs
    .filter(l => l.type === 'PROPOSAL' || l.type === 'CONSENSUS')
    .map(l => ({
      type: l.type.toLowerCase(),
      description: l.content,
      assignedAgent: l.agentId || ('ENTJ' as AgentId),
      priority: 'MEDIUM' as const,
    }));

  const narrations = session.logs
    .filter(l => l.type === 'NARRATION')
    .map(l => l.content);

  return {
    actions,
    resourceChanges: {},
    summary: `议会经过 ${session.context.currentRound} 轮博弈后${session.status === 'CONCLUDED' ? '达成共识' : '强制收敛'}。`,
    narrativeSummary: narrations.join('\n\n') || '议会安静地结束了。',
  };
}

// ==================== 终极优化报告已迁移到 settlement-engine.ts ====================

// ==================== SSE 编码 ====================

export function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
