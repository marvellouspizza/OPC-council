/**
 * Silent Council - 前端状态管理 (Zustand Store) v3
 * 4阵营代理 · Token经济 · Whisper
 */

import { create } from 'zustand';

// ==================== 类型定义 ====================

/** 用户画像（前端状态） */
interface UserProfileState {
  mbtiType?: string;
  profession?: string;
  professionCategory: 'high' | 'mid' | 'low';
  rigidityCoefficient: number;
  moodState: 'sprint' | 'flow' | 'survival' | 'anxiety';
  energyLevel: number;
  hobbies: string[];
  moodScore: number;
  tokenBudgetPerHour: number;
  hourlyWage?: number;
}

/** Token 四维分配 */
interface TokenAllocationState {
  efficiency: number;   // ENTJ
  health: number;       // ISFJ
  relationship: number; // INFJ
  risk: number;         // ESTP
}

/** §7 终极优化报告 - ResultCard 类型 */
interface ResultCard {
  sessionId: string;
  sessionNumber: number;
  grade: string;
  netValue: number;
  tokenSpent: number;
  tokenRemaining: number;
  tokenSurplus: number;
  meltdownOccurred: boolean;
  tasks: Array<{
    title: string;
    grade: string;
    tokenCost: number;
    rngResult: {
      type: string;
      score: number;
      luck: number;
      statChanges: Record<string, number>;
      narrative: string;
    };
  }>;
  highlights: Array<{
    type: string;
    description: string;
  }>;
  deliverables: Array<{
    filename: string;
    level: string;
    description: string;
  }>;
  narrativeSummary: string;
  realDurationSec: number;
  simulatedDurationMin: number;
}

/** 历史议会会话 */
interface HistoricalSession {
  id: string;
  status: string;
  trigger: string | null;
  createdAt: string;
  completedAt: string | null;
  resultCard: ResultCard | null;
  logs: CouncilLog[];
}

/** 代理节点（4大阵营） */
interface AgentNode {
  id: string;
  role: string;
  roleCn: string;
  sector: string;
  titleCn: string;
  icon: string;
  color: string;
  status: 'IDLE' | 'ACTIVE' | 'SPEAKING' | 'TRADING' | 'VETOING' | 'SANCTIONED' | 'WHISPERING';
  weight: number;
  hasVetoPower: boolean;
  satisfaction: number;
  influence: number;
  isSanctioned: boolean;
  // ForceGraph 属性
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface AgentLink {
  source: string;
  target: string;
  value: number;
  type: 'trade' | 'veto' | 'support' | 'whisper' | 'alliance';
  active: boolean;
}

/** 议会日志（v2：双通道） */
interface CouncilLog {
  id: string;
  agentId: string | null;
  type: string;
  content: string;
  internalState?: {
    intent: string;
    target_agent?: string;
    resource_delta?: Record<string, number | string>;
    emotional_state: string;
  };
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/** Whisper 私聊消息 */
interface WhisperMessage {
  id: string;
  sourceAgent: string;
  targetAgent: string;
  type: 'alliance' | 'complaint' | 'gossip';
  content: string;
  timestamp: string;
  expiresAt: string;
}

interface GraphData {
  nodes: AgentNode[];
  links: AgentLink[];
}

// ==================== Store 定义 ====================

interface CouncilStore {
  // 状态
  isRunning: boolean;
  templateId: string;
  logs: CouncilLog[];
  abortController: AbortController | null;

  // §7 终极优化报告
  resultCard: ResultCard | null;

  // 历史记录
  historicalSessions: HistoricalSession[];
  activeSessionId: string | null;

  // 日程管理
  currentSchedule: any | null; // DaySchedule type from schedule-engine

  // 用户画像
  userProfile: UserProfileState;
  tokenAllocation: TokenAllocationState;
  accessToken: string | null;

  // §8: Agent 权重成长系统
  agentWeightHistory: Record<string, number[]>; // 每个 Agent 的历史权重变化
  dailyTokenSurplus: number; // 昨日盈余
  consecutiveDays: number; // 连续使用天数

  // v2: Whisper
  whisperMessages: WhisperMessage[];

  // v2: 底线告警
  activeAlerts: string[];

  // 操作
  setTemplate: (templateId: string) => void;
  startCouncil: (trigger: string) => Promise<void>;
  stopCouncil: () => void;
  cancelCouncil: () => Promise<void>; // 新增：终止议会
  addLog: (log: CouncilLog) => void;
  updateAgentStatus: (agentId: string, status: AgentNode['status']) => void;
  resetSession: () => void;

  // 历史记录管理
  fetchHistory: () => Promise<void>;
  fetchActiveSession: () => Promise<void>;
  loadHistoricalSession: (sessionId: string) => void;

  // 用户画像操作
  setUserProfile: (profile: Partial<UserProfileState>) => void;
  setTokenAllocation: (alloc: Partial<TokenAllocationState>) => void;
  setAccessToken: (token: string | null) => void;
  fetchAccessToken: () => Promise<void>;

  // 随机画像生成
  randomizeProfile: () => void;

  // 日程管理操作
  setSchedule: (schedule: any | null) => void;
  fetchSchedule: () => Promise<void>;

  // §8: Agent 成长系统
  recordAgentSupport: (agentId: string, tokenAmount: number) => void;
  applyDailySurplus: (surplus: number) => void;
  getDailyTokenBudget: () => number;
  checkAndTriggerBalancing: () => { needsBalancing: boolean; dominantAgent?: string };

  // v2: Whisper
  addWhisperMessage: (msg: WhisperMessage) => void;
  clearExpiredWhispers: () => void;

  // §7: 设置结算报告
  setResultCard: (card: ResultCard | null) => void;
}

/** 板块位置布局 - 四个象限 */
const SECTOR_POSITIONS: Record<string, { cx: number; cy: number }> = {
  analysts: { cx: -150, cy: -150 },
  diplomats: { cx: 150, cy: -150 },
  guardians: { cx: -150, cy: 150 },
  explorers: { cx: 150, cy: 150 },
};

/** 4大代理定义 */
const DEFAULT_AGENTS: Record<string, { role: string; roleCn: string; sector: string; titleCn: string; icon: string; color: string; hasVetoPower: boolean }> = {
  ENTJ: { role: 'Commander', roleCn: '效率之神', sector: 'analysts', titleCn: '指挥官', icon: '⚡', color: '#3B82F6', hasVetoPower: false },
  ISFJ: { role: 'Protector', roleCn: '健康官', sector: 'guardians', titleCn: '守护者', icon: '🛡️', color: '#10B981', hasVetoPower: true },
  INFJ: { role: 'Advocate', roleCn: '精神导师', sector: 'diplomats', titleCn: '倡导者', icon: '🔮', color: '#A855F7', hasVetoPower: true },
  ESTP: { role: 'Entrepreneur', roleCn: '赌徒', sector: 'explorers', titleCn: '企业家', icon: '🎲', color: '#F59E0B', hasVetoPower: false },
};

function createDefaultNodes(): AgentNode[] {
  return Object.entries(DEFAULT_AGENTS).map(([id, info], index) => {
    const pos = SECTOR_POSITIONS[info.sector];
    return {
      id,
      ...info,
      status: 'IDLE' as const,
      weight: 1.0,
      satisfaction: 50,
      influence: 50,
      isSanctioned: false,
      x: pos.cx + (index % 2) * 40 - 20,
      y: pos.cy,
    };
  });
}

/** 默认用户画像 */
const DEFAULT_USER_PROFILE: UserProfileState = {
  professionCategory: 'mid',
  rigidityCoefficient: 0.5,
  moodState: 'flow',
  energyLevel: 80,
  hobbies: [],
  moodScore: 5,
  tokenBudgetPerHour: 10000,
};

/** 默认 Token 分配 */
const DEFAULT_TOKEN_ALLOCATION: TokenAllocationState = {
  efficiency: 30, health: 25, relationship: 20, risk: 25,
};

export const useCouncilStore = create<CouncilStore>((set, get) => ({
  // 初始状态
  isRunning: false,
  templateId: 'balanced-life',
  logs: [],
  abortController: null,
  resultCard: null, // §7
  historicalSessions: [],
  activeSessionId: null,
  currentSchedule: null, // 日程管理

  // 用户状态
  userProfile: { ...DEFAULT_USER_PROFILE },
  tokenAllocation: { ...DEFAULT_TOKEN_ALLOCATION },
  accessToken: null,
  agentWeightHistory: { ENTJ: [], ISFJ: [], INFJ: [], ESTP: [] },
  dailyTokenSurplus: 0,
  consecutiveDays: 0,
  whisperMessages: [],
  activeAlerts: [],

  // 设置模板
  setTemplate: (templateId) => set({ templateId }),

  // 启动议会（传递用户画像和 Token 分配）
  startCouncil: async (trigger: string) => {
    const { templateId, abortController, userProfile, tokenAllocation, currentSchedule } = get();
    
    // 如果已有正在运行的会话，先中止
    if (abortController) {
      abortController.abort();
    }

    const newController = new AbortController();
    set({
      isRunning: true,
      logs: [],
      whisperMessages: [],
      activeAlerts: [],
      resultCard: null, // §7: 重置旧报告
      abortController: newController,
    });

    try {
      const response = await fetch('/api/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger,
          templateId,
          userProfile,
          tokenAllocation,
          scheduleBlocks: currentSchedule?.blocks || [], // 传递日程任务
        }),
        signal: newController.signal,
      });

      if (!response.ok) throw new Error('议会启动失败');

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        let currentEventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));

              // §7: 捕获结算报告 (resultcard event)
              if (currentEventType === 'resultcard') {
                get().setResultCard(data);
                continue;
              }

              // Skip verdict events (different structure than log entries)
              if (currentEventType === 'verdict') {
                // Could store verdict in state if needed
                continue;
              }

              get().addLog(data);

              // 更新代理状态
              if (data.agentId) {
                const statusMap: Record<string, AgentNode['status']> = {
                  PROPOSAL: 'SPEAKING',
                  SPEECH: 'ACTIVE',
                  VETO: 'VETOING',
                  COUNTER: 'TRADING',
                  CONSENSUS: 'ACTIVE',
                  WHISPER: 'WHISPERING',
                  BOTTOM_LINE_ALERT: 'VETOING',
                };
                get().updateAgentStatus(data.agentId, statusMap[data.type] || 'ACTIVE');

                // 1.5秒后重置为IDLE
                setTimeout(() => {
                  get().updateAgentStatus(data.agentId, 'IDLE');
                }, 1500);
              }

              // 底线告警
              if (data.type === 'BOTTOM_LINE_ALERT') {
                set((state) => ({
                  activeAlerts: [...state.activeAlerts, data.content],
                }));
              }

              // Whisper
              if (data.type === 'WHISPER') {
                  get().addWhisperMessage({
                    id: data.id,
                    sourceAgent: data.agentId || 'SYSTEM',
                    targetAgent: data.internalState?.target_agent || 'ALL',
                    type: 'gossip',
                    content: data.content,
                    timestamp: data.timestamp,
                    expiresAt: new Date(Date.now() + 15000).toISOString(),
                  });
                  break;
              }
            } catch {
              // 跳过无法解析的数据
            }
          }
        }
      }
    } catch (error) {
      // 如果是用户中止，不显示错误
      if ((error as Error).name !== 'AbortError') {
        console.error('议会错误:', error);
      }
    } finally {
      set({ isRunning: false, abortController: null });
    }
  },

  // 终止议会（保存为取消状态）
  cancelCouncil: async () => {
    const { abortController } = get();
    
    try {
      // 先中止前端流
      if (abortController) {
        abortController.abort();
      }
      
      // 调用后端API标记为取消
      const response = await fetch('/api/council/active', {
        method: 'DELETE',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('议会已终止:', data.message);
      }
      
      set({
        isRunning: false,
        abortController: null,
      });
    } catch (error) {
      console.error('终止议会失败:', error);
      // 即使API调用失败，也停止前端
      set({ isRunning: false, abortController: null });
    }
  },

  // 停止议会
  stopCouncil: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({ isRunning: false, abortController: null });
    }
  },

  // 添加日志
  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs, log],
    })),

  // 更新代理状态
  updateAgentStatus: (agentId, status) =>
    set(() => ({
      // Agent status tracked in logs, not in graph nodes anymore
    })),

  // 重置会话
  resetSession: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    
    set({
      isRunning: false,
      logs: [],
      abortController: null,
      whisperMessages: [],
      activeAlerts: [],
    });
  },

  // 设置用户画像
  setUserProfile: (profile) =>
    set((state) => ({
      userProfile: { ...state.userProfile, ...profile },
    })),

  // 设置 Token 四维分配
  setTokenAllocation: (alloc) =>
    set((state) => {
      const merged = { ...state.tokenAllocation, ...alloc };
      // 强制系统底线
      const FLOOR = { efficiency: 5, health: 10, relationship: 5, risk: 5 };
      merged.efficiency = Math.max(FLOOR.efficiency, merged.efficiency);
      merged.health = Math.max(FLOOR.health, merged.health);
      merged.relationship = Math.max(FLOOR.relationship, merged.relationship);
      merged.risk = Math.max(FLOOR.risk, merged.risk);
      return { tokenAllocation: merged };
    }),

  // 设置 accessToken (§2 AI 日程生成)
  setAccessToken: (token) => set({ accessToken: token }),

  // 获取 accessToken
  fetchAccessToken: async () => {
    try {
      const res = await fetch('/api/user/session');
      if (res.ok) {
        const data = await res.json();
        if (data.code === 0 && data.data?.accessToken) {
          set({ accessToken: data.data.accessToken });
        }
      }
    } catch (err) {
      console.error('获取 accessToken 失败:', err);
    }
  },

  // v2: 随机画像生成（一键生成 MBTI + 职业 + 爱好 + 约束）
  randomizeProfile: () => {
    const mbtiTypes = [
      'INTJ', 'INTP', 'ENTJ', 'ENTP',
      'INFJ', 'INFP', 'ENFJ', 'ENFP',
      'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
      'ISTP', 'ISFP', 'ESTP', 'ESFP',
    ];
    const professions = [
      '产品经理', '全栈工程师', '设计师', '数据分析师', '金融分析师',
      '自由职业者', '创业者', '教师', '律师', '医生', '作家', '游戏策划',
      '运营经理', '市场营销', 'AI研究员', '投资人',
    ];
    const hobbyPool = [
      '游戏', '阅读', '健身', '音乐', '烹饪', '摄影', '旅行',
      '编程', '绘画', '瑜伽', '电影', '棋类', '露营', '钓鱼',
      '跑步', '写作', '手工', '追剧', '学语言', '投资理财',
    ];
    const moods: Array<'sprint' | 'flow' | 'survival' | 'anxiety'> = ['sprint', 'flow', 'survival', 'anxiety'];
    const categories: Array<'high' | 'mid' | 'low'> = ['high', 'mid', 'low'];

    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    const pickN = <T,>(arr: T[], n: number) => {
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n);
    };

    const category = pick(categories);
    const rc = category === 'high' ? 0.7 + Math.random() * 0.3
      : category === 'low' ? Math.random() * 0.3
      : 0.3 + Math.random() * 0.4;

    set({
      userProfile: {
        mbtiType: pick(mbtiTypes),
        profession: pick(professions),
        professionCategory: category,
        rigidityCoefficient: Math.round(rc * 100) / 100,
        moodState: pick(moods),
        energyLevel: Math.floor(Math.random() * 80) + 20,
        hobbies: pickN(hobbyPool, 2 + Math.floor(Math.random() * 4)),
        moodScore: Math.floor(Math.random() * 10) + 1,
        tokenBudgetPerHour: pick([5000, 8000, 10000, 15000, 20000]),
        hourlyWage: pick([0, 50, 100, 200, 500]),
      },
    });
  },

  // 获取历史记录
  fetchHistory: async () => {
    try {
      const res = await fetch('/api/council/history');
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          set({ historicalSessions: data.sessions });
        }
      }
    } catch (err) {
      console.error('获取历史记录失败:', err);
    }
  },

  // 获取活跃会话（页面加载时调用）
  fetchActiveSession: async () => {
    try {
      const res = await fetch('/api/council/active');
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          // 恢复活跃会话状态
          set({
            activeSessionId: data.session.id,
            logs: data.session.logs.map((log: any) => ({
              ...log,
              timestamp: log.timestamp,
            })),
            resultCard: data.session.resultCard,
          });
        }
      }
    } catch (err) {
      console.error('获取活跃会话失败:', err);
    }
  },

  // 加载历史会话（查看历史）
  loadHistoricalSession: (sessionId: string) => {
    const { historicalSessions } = get();
    const session = historicalSessions.find(s => s.id === sessionId);
    if (session) {
      set({
        logs: session.logs,
        resultCard: session.resultCard,
        activeSessionId: sessionId,
      });
    }
  },

  // v2: 添加 Whisper 消息
  addWhisperMessage: (msg) =>
    set((state) => ({
      whisperMessages: [...state.whisperMessages, msg],
    })),

  // v2: 清除过期的 Whisper
  clearExpiredWhispers: () =>
    set((state) => ({
      whisperMessages: state.whisperMessages.filter(
        (m) => new Date(m.expiresAt) > new Date()
      ),
    })),

  // §7: 设置结算报告
  setResultCard: (card) => set({ resultCard: card }),

  // 日程管理
  setSchedule: (schedule) => set({ currentSchedule: schedule }),

  fetchSchedule: async () => {
    try {
      const res = await fetch('/api/schedule');
      if (res.ok) {
        const data = await res.json();
        if (data.schedule) {
          set({ currentSchedule: data.schedule });
        }
      }
    } catch (err) {
      console.error('获取日程失败:', err);
    }
  },

  // §8: 记录 Agent 支持（用于成长系统）
  recordAgentSupport: (agentId, tokenAmount) =>
    set((state) => {
      const history = { ...state.agentWeightHistory };
      if (!history[agentId]) history[agentId] = [];
      history[agentId].push(tokenAmount);
      // 只保留最近 30 次记录
      if (history[agentId].length > 30) {
        history[agentId] = history[agentId].slice(-30);
      }
      return { agentWeightHistory: history };
    }),

  // §8: 应用昨日盈余（日循环）
  applyDailySurplus: (surplus) =>
    set((state) => ({
      dailyTokenSurplus: surplus,
      consecutiveDays: state.consecutiveDays + 1,
    })),

  // §8: 获取今日 Token 预算（含盈余结转）
  getDailyTokenBudget: () => {
    const { dailyTokenSurplus } = get();
    const baseBudget = 1000;
    // 盈余结转 50%
    return Math.floor(baseBudget + dailyTokenSurplus * 0.5);
  },

  // §8: 检查是否需要强制平衡（逆向调节）
  checkAndTriggerBalancing: () => {
    const { agentWeightHistory } = get();
    const THRESHOLD = 0.6; // 某 Agent 权重 > 60% 触发

    // 计算近期每个 Agent 的支配度
    const totals = { ENTJ: 0, ISFJ: 0, INFJ: 0, ESTP: 0 };
    let overallTotal = 0;

    Object.entries(agentWeightHistory).forEach(([agentId, history]) => {
      const sum = history.reduce((acc, val) => acc + val, 0);
      totals[agentId as keyof typeof totals] = sum;
      overallTotal += sum;
    });

    if (overallTotal === 0) {
      return { needsBalancing: false };
    }

    // 找出支配 Agent
    for (const [agentId, total] of Object.entries(totals)) {
      const ratio = total / overallTotal;
      if (ratio > THRESHOLD) {
        return {
          needsBalancing: true,
          dominantAgent: agentId,
        };
      }
    }

    return { needsBalancing: false };
  },
}));
