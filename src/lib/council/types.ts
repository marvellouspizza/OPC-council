/**
 * Silent Council - 核心类型定义 v3
 * 4阵营代理 · Token经济(Escrow/Meltdown/TaskGrade) · 保留完整用户画像
 */

// ==================== 资源货币系统 ====================

export type ResourceCode = 'TIME' | 'HP' | 'SOC' | 'WLTH';

export interface ResourceInventory {
  TIME: number;
  HP: number;
  SOC: number;
  WLTH: number;
}

export type ResourceDelta = { [K in ResourceCode]?: number | string };

// ==================== 4大阵营代理 ====================

/** 议会4大代理 */
export type AgentId = 'ENTJ' | 'ISFJ' | 'INFJ' | 'ESTP';

export type AgentSector = 'analysts' | 'guardians' | 'diplomats' | 'explorers';

export type AgentStatus =
  | 'IDLE' | 'ACTIVE' | 'SPEAKING' | 'TRADING'
  | 'VETOING' | 'SANCTIONED' | 'WHISPERING';

export interface AgentDefinition {
  id: AgentId;
  role: string;
  roleCn: string;
  sector: AgentSector;
  title: string;
  titleCn: string;
  primaryResource: ResourceCode;
  hasVetoPower: boolean;
  vetoScope?: string;
  color: string;
  icon: string;
  description: string;
  guardsBottomLine?: {
    resource: ResourceCode | 'SLEEP' | 'SOCIAL' | 'WORK_HOURS';
    sblAction: 'VETO';
    ublAction: 'WARN';
  };
}

export interface AgentState {
  id: AgentId;
  currentWeight: number;
  resourceInventory: ResourceInventory;
  status: AgentStatus;
  lastAction?: string;
  satisfaction: number;
  influence: number;
  isSanctioned: boolean;
}

// ==================== 用户画像 (完整保留，影响日程生成) ====================

export type MBTIType =
  | 'INTJ' | 'INTP' | 'ENTJ' | 'ENTP'
  | 'INFJ' | 'INFP' | 'ENFJ' | 'ENFP'
  | 'ISTJ' | 'ISFJ' | 'ESTJ' | 'ESFJ'
  | 'ISTP' | 'ISFP' | 'ESTP' | 'ESFP';

export type RigidityCategory = 'high' | 'mid' | 'low';
export type MoodState = 'sprint' | 'flow' | 'survival' | 'anxiety';

export interface UserProfile {
  mbtiType?: string;
  profession?: string;
  professionCategory: RigidityCategory;
  rigidityCoefficient: number;
  moodState: MoodState;
  energyLevel: number;
  hobbies: string[];
  moodScore: number;
  tokenBudgetPerHour: number;
  hourlyWage?: number;
}

export interface MoodStrategy {
  label: string;
  energyLevel: 'high' | 'mid' | 'low';
  emotionValence: 'positive' | 'negative';
  maxTaskCount: number;
  resourceAdjustment: string;
}

export const MOOD_STRATEGIES: Record<MoodState, MoodStrategy> = {
  sprint: { label: '冲刺模式', energyLevel: 'high', emotionValence: 'positive', maxTaskCount: 5, resourceAdjustment: '允许突破软底线，透支次日精力' },
  flow:   { label: '心流模式', energyLevel: 'mid',  emotionValence: 'positive', maxTaskCount: 3, resourceAdjustment: '锁定大块连续时间，屏蔽琐碎任务' },
  survival: { label: '生存模式', energyLevel: 'low', emotionValence: 'negative', maxTaskCount: 1, resourceAdjustment: '触发休眠协议，拒绝新增高耗能任务' },
  anxiety:  { label: '焦虑模式', energyLevel: 'high', emotionValence: 'negative', maxTaskCount: 5, resourceAdjustment: '拆解任务为微小颗粒，增加完成感反馈' },
};

// ==================== 经济系统 ====================

export type EscrowState = 'PENDING' | 'FROZEN' | 'RELEASED' | 'BURNED';
export type TaskGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type MeltdownState = 'NORMAL' | 'DEFICIT_WARNING' | 'MELTDOWN';

export interface TokenAccount {
  tokenBalance: number;
  dailyBudgetCap: number;
  creditScore: number;
  hourlyWage: number;
  meltdownState: MeltdownState;
}

export const DEFAULT_TOKEN_ACCOUNT: TokenAccount = {
  tokenBalance: 500, dailyBudgetCap: 500,
  creditScore: 100, hourlyWage: 0, meltdownState: 'NORMAL',
};

/** 任务结果条目（包含具体结果描述和属性影响） */
export interface ResultTaskEntry {
  title: string;
  grade: TaskGrade;
  tokenCost: number;
  rngResult?: RNGResult;
  /** 针对具体任务的结果描述（如：演讲稿不仅完成了，还意外被疯传） */
  resultDescription: string;
  /** 属性影响描述（如：你的"社会影响力"暴涨） */
  statImpact: string;
}

export interface ResultCard {
  sessionId: string;
  sessionNumber: number;
  grade: TaskGrade;
  netValue: number;
  tokenSpent: number;
  tokenRemaining: number;
  tokenSurplus: number;
  meltdownOccurred: boolean;
  tasks: ResultTaskEntry[];
  highlights: { type: 'critical_success' | 'critical_fail' | 'trade'; description: string }[];
  deliverables: { filename: string; level: TaskGrade; description: string }[];
  narrativeSummary: string;
  realDurationSec: number;
  simulatedDurationMin: number;
}

// ==================== 双重底线协议 ====================

export interface SystemBottomLine {
  minSleepHours: number;
  minBalance: number;
  maxIsolationDays: number;
  maxContinuousWork: number;
}

export const SYSTEM_BOTTOM_LINE: SystemBottomLine = {
  minSleepHours: 6, minBalance: 0, maxIsolationDays: 3, maxContinuousWork: 4,
};

/** Token 四维分配（效率/健康/关系/风险），百分比之和 = 100 */
export interface TokenAllocation {
  efficiency: number;  // ENTJ 分析家 (工作/学习)
  health: number;      // ISFJ 守护者 (睡眠/健康/理财)
  relationship: number; // INFJ 外交家 (社交/阅读)
  risk: number;        // ESTP 探险家 (娱乐/游戏)
}

export const DEFAULT_TOKEN_ALLOCATION: TokenAllocation = {
  efficiency: 30, health: 25, relationship: 20, risk: 25,
};

/** 系统底线：Token 分配不可低于此比例 */
export const SYSTEM_TOKEN_FLOOR: TokenAllocation = {
  efficiency: 5, health: 10, relationship: 5, risk: 5,
};

export interface BottomLineCheckResult { passed: boolean; violations: BottomLineViolation[] }
export interface BottomLineViolation {
  type: 'SBL' | 'UBL';
  resource: ResourceCode | 'SLEEP' | 'SOCIAL' | 'WORK_HOURS';
  currentValue: number;
  threshold: number;
  severity: 'CRITICAL' | 'WARNING';
  guardianAgent: AgentId;
  message: string;
}

// ==================== A2A 协议 ====================

export type A2AMethod =
  | 'council.propose' | 'council.counter' | 'council.vote'
  | 'council.veto' | 'council.consensus' | 'council.speak'
  | 'council.elect_chair' | 'council.whisper';

export interface A2AMessage { jsonrpc: '2.0'; method: A2AMethod; id: string; params: A2AParams }

export interface ProposalParams { agent_id: AgentId; action_type: string; description: string; resource_delta: ResourceDelta; rationale: string }
export interface CounterParams { agent_id: AgentId; target_proposal_id: string; status: 'CONDITIONAL_ACCEPT' | 'REJECT' | 'MODIFY'; condition?: { requirement: string; action: string; value: string }; message: string }
export interface ConsensusParams { final_action: string; resource_settlement: Record<string, string>; log_summary: string }
export interface VoteParams { agent_id: AgentId; proposal_id: string; vote: 'APPROVE' | 'REJECT' | 'ABSTAIN' | 'VETO'; weight: number; reason?: string }
export interface VetoParams { agent_id: AgentId; target_proposal_id: string; reason: string; override_condition?: string; penalty_target?: AgentId }
export interface WhisperParams { source_agent: AgentId; target_agent: AgentId | 'ALL'; whisper_type: 'alliance' | 'complaint' | 'gossip'; message: string }

export type A2AParams = ProposalParams | CounterParams | ConsensusParams | VoteParams | VetoParams | WhisperParams | Record<string, unknown>;

// ==================== 双通道输出 ====================

export interface DualChannelOutput {
  internal_state: {
    intent: 'trade' | 'veto' | 'whisper' | 'propose' | 'counter' | 'speak' | 'bid' | 'attack';
    target_agent?: AgentId;
    resource_delta?: ResourceDelta;
    emotional_state: 'excited' | 'neutral' | 'angry' | 'worried' | 'depressed' | 'scheming';
    bottom_line_check?: BottomLineViolation[];
  };
  public_speech: string;
}

export const DUAL_CHANNEL_SEPARATOR = '<<<SEP>>>';

// ==================== 人生模板 ====================

export interface LifeTemplate {
  id: string; name: string; nameCn: string; description: string;
  weightMatrix: Record<AgentId, number>;
  exchangeRates: ExchangeRateRules;
}

export interface ExchangeRateRules {
  hpToTime: number; wlthToTime: number; socToTime: number; rules: string[];
}

// ==================== 议会会议 ====================

export type SessionStatus = 'ACTIVE' | 'CONCLUDED' | 'DEADLOCKED';
export type LogType = 'SYSTEM' | 'SPEECH' | 'PROPOSAL' | 'COUNTER' | 'VETO' | 'CONSENSUS' | 'NARRATION' | 'WHISPER' | 'BOTTOM_LINE_ALERT';

export interface CouncilLogEntry {
  id: string; agentId: AgentId | null; type: LogType;
  content: string; internalState?: DualChannelOutput['internal_state'];
  metadata?: Record<string, unknown>; timestamp: Date;
}

export interface CouncilContext {
  sessionId: string; templateId: string; templateName: string;
  currentRound: number; chairAgentId: AgentId | null;
  agentStates: AgentState[]; recentLogs: CouncilLogEntry[];
  trigger: string; userProfile: UserProfile;
  tokenAllocation: TokenAllocation; systemBottomLine: SystemBottomLine;
  systemStatus: { criticalAlerts: string[]; overallHealth: number; currentTime: string };
  scheduleBlocks?: ScheduleBlock[]; // 当前日程任务列表
}

export interface CouncilVerdict {
  actions: VerdictAction[];
  resourceChanges: Record<string, ResourceDelta>;
  summary: string;
  narrativeSummary: string;
}

export interface VerdictAction {
  type: string; description: string; scheduledTime?: string;
  assignedAgent: AgentId; priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ==================== Whisper 私聊 ====================

export interface WhisperMessage {
  id: string; sourceAgent: AgentId; targetAgent: AgentId | 'ALL';
  type: 'alliance' | 'complaint' | 'gossip';
  content: string; timestamp: Date; expiresAt: Date;
}

export const DEFAULT_WHISPER_CONFIG = { conflictThreshold: 3, globalCooldownMs: 3 * 60 * 1000 };

// ==================== 数字任务 ====================

export type ModelTier = 'gpt-4o' | 'gpt-4o-mini' | 'rule-based';
export const MODEL_TIERS: Record<ModelTier, { tier: ModelTier; label: string; costMultiplier: number; qualityScore: number }> = {
  'gpt-4o':      { tier: 'gpt-4o',      label: 'GPT-4o (旗舰)',    costMultiplier: 1.0,  qualityScore: 100 },
  'gpt-4o-mini': { tier: 'gpt-4o-mini', label: 'GPT-4o-mini (轻量)', costMultiplier: 0.1, qualityScore: 60 },
  'rule-based':  { tier: 'rule-based',  label: '规则引擎 (零消耗)',  costMultiplier: 0.01, qualityScore: 30 },
};

export type DigitalTaskCategory = 'SLEEP_AI' | 'WORK_AI' | 'ENTERTAIN_AI' | 'SOCIAL_AI' | 'SAVINGS_AI' | 'GAMING_AI' | 'HEALTH_AI' | 'LEARNING_AI' | 'SYSTEM';

export const CATEGORY_COLORS: Record<DigitalTaskCategory, string> = { SLEEP_AI: '#1E3A5F', WORK_AI: '#3B82F6', ENTERTAIN_AI: '#FBBF24', SOCIAL_AI: '#EC4899', SAVINGS_AI: '#10B981', GAMING_AI: '#8B5CF6', HEALTH_AI: '#14B8A6', LEARNING_AI: '#6366F1', SYSTEM: '#6B7280' };
export const CATEGORY_LABELS: Record<DigitalTaskCategory, string> = { SLEEP_AI: '睡眠AI', WORK_AI: '工作AI', ENTERTAIN_AI: '娱乐AI', SOCIAL_AI: '社交AI', SAVINGS_AI: '理财AI', GAMING_AI: '游戏AI', HEALTH_AI: '健康AI', LEARNING_AI: '学习AI', SYSTEM: '系统' };
export const CATEGORY_ICONS: Record<DigitalTaskCategory, string> = { SLEEP_AI: '🌙', WORK_AI: '📊', ENTERTAIN_AI: '🎵', SOCIAL_AI: '💬', SAVINGS_AI: '💰', GAMING_AI: '🎮', HEALTH_AI: '❤️', LEARNING_AI: '📚', SYSTEM: '⚙️' };

export interface TokenBudget { totalBudget: number; hourlyBudget: number; spent: number; reserved: number; available: number; deficitAllowed: boolean; deficitPenalty: number }
export const DEFAULT_TOKEN_BUDGET: TokenBudget = { totalBudget: 10000, hourlyBudget: 10000, spent: 0, reserved: 0, available: 10000, deficitAllowed: true, deficitPenalty: 1.5 };

export interface DigitalTaskEntry {
  id: string; name: string; category: DigitalTaskCategory; description: string;
  baseTokenCost: number; modelTier: ModelTier;
  downgradeOptions?: { tier: ModelTier; tokenCost: number; qualityLoss: string }[];
  executionDuration: string; isBackground: boolean;
  isDeadline: boolean; deadlineTime?: string;
  ownerAgent: AgentId; supportAgents?: AgentId[];
  apiEndpoint?: string; expectedOutput?: string;
  escrowState?: EscrowState; finalGrade?: TaskGrade;
  levels?: TaskLevelCosts;
  aiTool?: string;
}

export interface ScheduleBlock {
  id: string; timeStart: string; timeEnd: string; duration: number;
  category: DigitalTaskCategory; taskName: string; taskId: string;
  tokenCost: number; modelTier: ModelTier; originalTokenCost?: number;
  isDeadline: boolean; deadlineTime?: string; isLocked: boolean;
  executionStatus: 'pending' | 'running' | 'completed' | 'failed';
  ownerAgent: AgentId; generationNote?: string; userNote?: string;
  escrowState?: EscrowState; finalGrade?: TaskGrade;
}

export interface DaySchedule {
  scheduleId: string; userId: string; date: string; blocks: ScheduleBlock[];
  tokenBudget: TokenBudget;
  generationParams: { templateId: string; userProfile: UserProfile; moodState: MoodState; energyLevel: number };
  status: 'DRAFT' | 'EDITED' | 'CONFIRMED' | 'IN_COUNCIL';
  stats: ScheduleStats; schedulingStyle: 'J' | 'P';
  createdAt: string; updatedAt: string;
}

export interface ScheduleStats {
  totalTokensUsed: number; totalTokensBudget: number; tokenUtilization: number;
  deadlineTokensReserved: number; taskCount: number; deadlineTaskCount: number;
  categoryBreakdown: Record<DigitalTaskCategory, number>;
  modelTierBreakdown: Record<ModelTier, number>;
  tokenDeficit: number; overBudgetPercent: number;
}

export interface AGEParams {
  templateId?: string; userProfile: UserProfile; date: string;
  tokenBudget?: number; fixedTasks?: ScheduleBlock[];
  structurePreference?: number; allowDeficit?: boolean; hobbies?: string[];
  tokenAllocation?: TokenAllocation;
}

export interface TokenConflict {
  totalDemand: number; totalBudget: number; overagePercent: number;
  conflictingAgents: { agentId: AgentId; requestedTokens: number; taskIds: string[]; priority: number }[];
  deadlineLocked: number; negotiableTokens: number;
}

export interface AgentCard {
  name: string; description: string; version: string;
  capabilities: { negotiation: boolean; resource_trading: ResourceCode[]; veto_power: boolean; bottom_line_guardian?: string };
}

// ==================== 任务等级成本 ====================

export interface TaskLevelCosts {
  C: { cost: number; desc: string; outcome: string };
  B: { cost: number; desc: string; outcome: string };
  A: { cost: number; desc: string; outcome: string };
  S: { cost: number; desc: string; outcome: string };
}

/** 等级成本倍率: D=0, C=最低交付, B=合格, A=超预期, S=大成功 */
export const LEVEL_COST_MULTIPLIERS: Record<TaskGrade, number> = {
  D: 0, C: 0.2, B: 0.5, A: 1.0, S: 2.0,
};

/** 根据任务基础成本生成各等级成本 */
export function getTaskLevelCosts(baseTokenCost: number): TaskLevelCosts {
  return {
    C: { cost: Math.round(baseTokenCost * 0.2), desc: '纯复制粘贴/通用模板', outcome: '敷衍了事' },
    B: { cost: Math.round(baseTokenCost * 0.5), desc: '针对性修改/逻辑通顺', outcome: '合格交付' },
    A: { cost: Math.round(baseTokenCost * 1.0), desc: '深度研究/多模态生成/完美排版', outcome: '超预期' },
    S: { cost: Math.round(baseTokenCost * 2.0), desc: '极致完美/创新突破/被推荐', outcome: '大成功' },
  };
}

// ==================== RNG 运气系统 ====================

export type RNGResultType = 'CRITICAL_SUCCESS' | 'SUCCESS' | 'BARELY_PASSED' | 'CRITICAL_FAIL';

export interface RNGResult {
  type: RNGResultType;
  score: number;
  luck: number;
  statChanges: Partial<ResourceInventory>;
  narrative: string;
}

/** RNG 结果判定阈值 */
export const RNG_THRESHOLDS = {
  criticalSuccess: 1.5,  // score > invested * 1.5
  success: 0.5,          // score > invested * 0.5
  barelyPassed: 0,       // score > 0
};

/** RNG 随机事件文案 */
export const RNG_NARRATIVES: Record<RNGResultType, string[]> = {
  CRITICAL_SUCCESS: [
    'AI写的代码被GitHub推荐了！',
    '灵感爆发，产出质量远超计划！',
    '任务完成后获得意外的合作邀约！',
    '作品在社交媒体上意外走红！',
  ],
  SUCCESS: [
    '任务顺利完成，获得标准经验值。',
    '稳定发挥，一切按计划进行。',
    '不出意外地完成了，没有惊喜也没有意外。',
  ],
  BARELY_PASSED: [
    '虽然跑通了，但全是Warning。',
    '勉强交差，质量堪忧。',
    '最后一秒才搞定，差点翻车。',
  ],
  CRITICAL_FAIL: [
    'AI在生成过程中产生幻觉，输出了一堆乱码。',
    '任务彻底失败，Token化为乌有。',
    '关键数据丢失，一切需要从头再来。',
  ],
};

// ==================== P2P 交易协议 (设计文档 §5.2) ====================

export interface TradeProposal {
  id: string;
  sourceAgent: AgentId;
  targetAgent: AgentId;
  /** 来源方提供的资源/Token */
  offer: { taskId: string; downgradeFrom: TaskGrade; downgradeTo: TaskGrade; tokenFreed: number };
  /** 来源方需求的资源/Token */
  demand: { taskId: string; upgradeFrom: TaskGrade; upgradeTo: TaskGrade; tokenNeeded: number };
  /** 用户画像权重判定: offer 风险 vs demand 收益 */
  riskScore: number;
  benefitScore: number;
  accepted: boolean;
  rationale: string;
  timestamp: Date;
}

export type TradeVerdict = 'ACCEPTED' | 'REJECTED' | 'COUNTER_OFFERED';

// ==================== 坍缩结果 (设计文档 §5) ====================

export interface CollapseResult {
  taskId: string;
  taskName: string;
  ownerAgent: AgentId;
  /** 任务类别 (用于生成结果描述) */
  category?: DigitalTaskCategory;
  /** 博弈前的等级 */
  initialGrade: TaskGrade;
  /** 坍缩后的最终等级 */
  finalGrade: TaskGrade;
  /** 实际投入的 Token */
  tokenInvested: number;
  /** 等级成本详情 */
  levelCosts: TaskLevelCosts;
  /** 是否因交易改变了等级 */
  tradedWith?: AgentId;
  /** 是否为 Deadline 任务 */
  isDeadline: boolean;
}

// ==================== 结算事件卡片 (设计文档 §6) ====================

export type EventCardType =
  | 'CRITICAL_SUCCESS'
  | 'SUCCESS'
  | 'BARELY_PASSED'
  | 'CRITICAL_FAIL'
  | 'SPECIAL_ITEM'
  | 'COMBO_BONUS'
  | 'MELTDOWN_RECOVERY';

export interface EventCard {
  id: string;
  type: EventCardType;
  taskId: string;
  taskName: string;
  ownerAgent: AgentId;
  /** 任务类别 (用于生成结果描述) */
  category?: DigitalTaskCategory;
  grade: TaskGrade;
  /** RNG 分数 */
  score: number;
  luck: number;
  /** 属性变化 */
  statChanges: {
    professional: number;  // 职业属性
    social: number;        // 社交属性
    sanity: number;        // 精神值/HP
    wealth: number;        // 财富
  };
  /** 特殊道具奖励 */
  specialItems: SpecialItem[];
  /** 叙事文案 */
  narrative: string;
  /** 针对具体任务的结果描述（如：演讲稿不仅完成了，还意外被疯传） */
  resultDescription?: string;
  /** 属性影响描述（如：你的"社会影响力"暴涨） */
  statImpact?: string;
  /** 副标题 (短评) */
  subtitle: string;
  /** 卡面颜色等级 */
  cardRarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface SpecialItem {
  id: string;
  name: string;
  description: string;
  effect: string;
  icon: string;
  /** 持续回合数 (0 = 永久) */
  duration: number;
}

/** 预定义特殊道具池 */
export const SPECIAL_ITEMS: SpecialItem[] = [
  { id: 'TIME_SHARD', name: '时间碎片', description: '下次议会额外获得 50 Token', effect: 'TOKEN_BONUS_50', icon: '⏳', duration: 1 },
  { id: 'LUCK_CHARM', name: '幸运符', description: '下次 RNG 运气值 +0.2', effect: 'LUCK_BONUS_02', icon: '🍀', duration: 1 },
  { id: 'SHIELD', name: '护盾', description: '抵消下一次大失败', effect: 'BLOCK_CRIT_FAIL', icon: '🛡️', duration: 1 },
  { id: 'COFFEE', name: '浓缩咖啡', description: '精神值恢复 15 点', effect: 'SANITY_RESTORE_15', icon: '☕', duration: 0 },
  { id: 'INSPIRE', name: '灵感火花', description: '下次高耗能任务自动升一级', effect: 'AUTO_UPGRADE_NEXT', icon: '💡', duration: 1 },
  { id: 'SOCIAL_BOOST', name: '社交达人', description: '社交属性 +15', effect: 'SOCIAL_BOOST_15', icon: '🤝', duration: 0 },
];

// ==================== 结算报告 (设计文档 §7) ====================

export interface SettlementReport {
  sessionId: string;
  sessionNumber: number;
  /** 议会总评分 */
  overallGrade: TaskGrade;
  /** 各任务坍缩结果 */
  collapseResults: CollapseResult[];
  /** 事件卡片 (每个任务生成一张) */
  eventCards: EventCard[];
  /** 交易记录 */
  trades: TradeProposal[];
  /** Token 结算 */
  tokenSettlement: {
    totalBudget: number;
    totalSpent: number;
    totalRemaining: number;
    surplus: number;
    /** 盈余结转到明日 (×0.5) */
    carryOver: number;
    meltdownOccurred: boolean;
  };
  /** 属性变化汇总 */
  statDelta: {
    professional: number;
    social: number;
    sanity: number;
    wealth: number;
  };
  /** 获得的道具 */
  itemsEarned: SpecialItem[];
  /** 高光时刻 */
  highlights: { type: 'critical_success' | 'critical_fail' | 'trade' | 'combo' | 'item'; description: string; icon: string }[];
  /** 叙事总结 */
  narrativeSummary: string;
  /** 虚拟交付物列表 */
  deliverables: { filename: string; level: TaskGrade; description: string }[];
  /** 耗时 */
  realDurationSec: number;
  simulatedDurationMin: number;
}

// ==================== 争议度评分 ====================

export interface ControversyScore {
  taskId: string;
  score: number;
  contestingAgents: AgentId[];
}
