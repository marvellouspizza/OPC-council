/**
 * Silent Council - 4大阵营代理定义
 * ENTJ·分析家 | ISFJ·守护者 | INFJ·外交家 | ESTP·探险家
 */

import type {
  AgentId, AgentDefinition, AgentState, AgentSector,
  ResourceCode, ResourceInventory, ResourceDelta,
  TokenAllocation,
} from './types';

// ==================== 4大代理定义 ====================

export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  ENTJ: {
    id: 'ENTJ',
    role: 'efficiency_god',
    roleCn: '分析家',
    sector: 'analysts',
    title: 'Commander',
    titleCn: '指挥官',
    primaryResource: 'TIME',
    hasVetoPower: false,
    color: '#3B82F6',
    icon: '⚡',
    description: '核心驱动力是 ROI。鄙视低效任务，以 S 级标准完成目标，积极争夺 Token 预算。',
  },
  ISFJ: {
    id: 'ISFJ',
    role: 'health_guardian',
    roleCn: '守护者',
    sector: 'guardians',
    title: 'Protector',
    titleCn: '守护者',
    primaryResource: 'HP',
    hasVetoPower: true,
    vetoScope: '健康/睡眠/基础财务安全',
    color: '#10B981',
    icon: '🛡️',
    description: '用户生理机能守护者。利用预扣除机制锁定基础预算，防止激进策略导致系统过热。',
    guardsBottomLine: { resource: 'SLEEP', sblAction: 'VETO', ublAction: 'WARN' },
  },
  INFJ: {
    id: 'INFJ',
    role: 'spiritual_mentor',
    roleCn: '外交家',
    sector: 'diplomats',
    title: 'Advocate',
    titleCn: '倡导者',
    primaryResource: 'SOC',
    hasVetoPower: true,
    vetoScope: '长期价值/过度劳动/意义缺失',
    color: '#A855F7',
    icon: '🔮',
    description: '议会的灵魂审视者。否决虽然赚钱但极其枯燥、缺乏长期价值的任务。',
    guardsBottomLine: { resource: 'SOCIAL', sblAction: 'VETO', ublAction: 'WARN' },
  },
  ESTP: {
    id: 'ESTP',
    role: 'gambler',
    roleCn: '探险家',
    sector: 'explorers',
    title: 'Entrepreneur',
    titleCn: '企业家',
    primaryResource: 'WLTH',
    hasVetoPower: false,
    color: '#F59E0B',
    icon: '🎲',
    description: '混乱中立的风险者。Token 不足时通过概率判定博取高收益。',
  },
};

export const ALL_AGENT_IDS: AgentId[] = ['ENTJ', 'ISFJ', 'INFJ', 'ESTP'];

export const SECTORS: Record<AgentSector, { label: string; agents: AgentId[] }> = {
  analysts:   { label: '分析家阵营', agents: ['ENTJ'] },
  guardians:  { label: '守护者阵营', agents: ['ISFJ'] },
  diplomats:  { label: '外交家阵营', agents: ['INFJ'] },
  explorers:  { label: '探索者阵营', agents: ['ESTP'] },
};

// ==================== 资源定义 ====================

export const RESOURCE_DEFINITIONS: Record<ResourceCode, {
  name: string; nameCn: string; unit: string; icon: string; maxDaily: number;
}> = {
  TIME: { name: 'Time', nameCn: '时间', unit: 'h', icon: '⏰', maxDaily: 16 },
  HP:   { name: 'Health', nameCn: '生命值', unit: '%', icon: '❤️', maxDaily: 100 },
  SOC:  { name: 'Social', nameCn: '社交值', unit: 'pt', icon: '🤝', maxDaily: 100 },
  WLTH: { name: 'Wealth', nameCn: '财富', unit: '¥', icon: '💰', maxDaily: 999999 },
};

export const DEFAULT_RESOURCE_INVENTORY: ResourceInventory = {
  TIME: 16, HP: 100, SOC: 50, WLTH: 500,
};

// ==================== 代理状态工厂 ====================

export function createDefaultAgentState(id: AgentId): AgentState {
  return {
    id,
    currentWeight: 1.0,
    resourceInventory: { ...DEFAULT_RESOURCE_INVENTORY },
    status: 'IDLE',
    satisfaction: 50,
    influence: 25,
    isSanctioned: false,
  };
}

export function createAllAgentStates(): AgentState[] {
  return ALL_AGENT_IDS.map(createDefaultAgentState);
}

// ==================== 资源操作 ====================

export function applyResourceDelta(
  inventory: ResourceInventory,
  delta: ResourceDelta,
): ResourceInventory {
  const result = { ...inventory };
  for (const [key, val] of Object.entries(delta)) {
    const code = key as ResourceCode;
    if (code in result && val !== undefined) {
      const numericVal = typeof val === 'string' ? parseFloat(val) : val;
      if (!isNaN(numericVal)) result[code] = Math.max(0, result[code] + numericVal);
    }
  }
  return result;
}

export function calculateResourceImpact(delta: ResourceDelta): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(delta)) {
    const code = key as ResourceCode;
    const def = RESOURCE_DEFINITIONS[code];
    if (!def || val === undefined) continue;
    const numericVal = typeof val === 'string' ? parseFloat(val) : val;
    if (!isNaN(numericVal) && numericVal !== 0) {
      const sign = numericVal > 0 ? '+' : '';
      parts.push(`${def.icon} ${sign}${numericVal}${def.unit}`);
    }
  }
  return parts.join(' | ') || '无资源变动';
}

// ==================== MBTI → Token 分配算法 ====================

/**
 * 根据 MBTI 类型计算代理初始 Token 分配
 * 基于设计文档的四维度亲和系数：
 * - J/T → ENTJ(效率) | S/I → ISFJ(健康) | F/E → INFJ(关系) | P/N → ESTP(风险)
 * 包含 ±10% 每日随机波动模拟"今日状态"
 */
export function computeMBTIAllocation(mbti?: string): TokenAllocation {
  // 基础分配：各 200 (总 800)
  const raw = { ENTJ: 200, ISFJ: 200, INFJ: 200, ESTP: 200 };

  if (mbti && mbti.length === 4) {
    // E/I 维度
    if (mbti.includes('I')) raw.ISFJ += 50;   // 内向 → 需要独处恢复精力
    if (mbti.includes('E')) raw.INFJ += 50;   // 外向 → 重视社交/外部反馈

    // S/N 维度
    if (mbti.includes('S')) raw.ISFJ += 50;   // 实感 → 偏好稳定
    if (mbti.includes('N')) raw.ESTP += 25;   // 直觉 → 接受不确定性

    // T/F 维度
    if (mbti.includes('T')) { raw.ENTJ += 50; raw.INFJ -= 50; }   // 思考 → 效率优先，忽视副作用
    if (mbti.includes('F')) raw.INFJ += 100;  // 情感 → 关注任务的情感价值

    // J/P 维度
    if (mbti.includes('J')) { raw.ENTJ += 100; raw.ESTP -= 50; }  // 判断 → 预算倾向按时完成
    if (mbti.includes('P')) { raw.ESTP += 100; raw.ENTJ -= 50; }  // 感知 → 高风险高回报
  }

  // ±10% 每日随机波动模拟"今日状态"
  for (const key of ALL_AGENT_IDS) {
    raw[key] = Math.round(raw[key] * (0.9 + Math.random() * 0.2));
    raw[key] = Math.max(raw[key], 50); // 防止为负
  }

  // 归一化为百分比 (总和 = 100)
  const total = raw.ENTJ + raw.ISFJ + raw.INFJ + raw.ESTP;
  return {
    efficiency: Math.round((raw.ENTJ / total) * 100),
    health: Math.round((raw.ISFJ / total) * 100),
    relationship: Math.round((raw.INFJ / total) * 100),
    risk: Math.round((raw.ESTP / total) * 100),
  };
}
