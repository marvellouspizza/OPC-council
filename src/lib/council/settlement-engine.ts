/**
 * Silent Council - 结算引擎 (The Roll)
 * 设计文档 §6: 结算系统 · 事件卡片 · RNG
 *
 * 职责:
 * 1. 对每个坍缩后的任务执行 RNG Roll
 * 2. 生成事件卡片 (EventCard) — 包含奖惩、道具、叙事
 * 3. 计算属性变化 (Professional / Social / Sanity / Wealth)
 * 4. 构建完整的结算报告 (SettlementReport)
 * 5. 日循环闭环: 计算盈余结转
 */

import type {
  AgentId, AgentState, CouncilContext, CouncilLogEntry,
  TaskGrade, CollapseResult, TradeProposal,
  EventCard, EventCardType, SpecialItem,
  SettlementReport, RNGResult, RNGResultType,
  ResourceInventory,
} from './types';
import {
  LEVEL_COST_MULTIPLIERS, RNG_THRESHOLDS, RNG_NARRATIVES,
  SPECIAL_ITEMS,
} from './types';
import { AGENT_DEFINITIONS } from './agents';

// ==================== RNG 核心算法 (设计文档 §6.1) ====================

/**
 * 增强版 RNG Roll: Score = Token投入 × GradeMultiplier × (1 + Luck)
 *
 * 4种结果:
 * - CRITICAL_SUCCESS: score > 250 (阈值)
 * - SUCCESS: score > 及格线
 * - BARELY_PASSED: score > 0
 * - CRITICAL_FAIL: score ≤ 0 或 Token 不足 Level C
 */
export function rollEnhanced(
  tokenInvested: number,
  grade: TaskGrade,
  luckModifier: number = 0,
): RNGResult {
  // 基础运气值 [-0.5, 0.5]，可被 luckModifier 偏移
  const baseLuck = -0.5 + Math.random();
  const luck = Math.max(-0.5, Math.min(0.5, baseLuck + luckModifier));

  const gradeMultiplier = LEVEL_COST_MULTIPLIERS[grade];
  const score = Math.round(tokenInvested * gradeMultiplier * (1 + luck));

  let type: RNGResultType;
  const statChanges: Partial<ResourceInventory> = {};

  // 使用绝对阈值 (250) 和相对阈值结合
  const criticalThreshold = Math.max(250, tokenInvested * RNG_THRESHOLDS.criticalSuccess);

  if (score > criticalThreshold) {
    type = 'CRITICAL_SUCCESS';
    statChanges.SOC = 10;
    statChanges.HP = 5;
  } else if (score > tokenInvested * RNG_THRESHOLDS.success) {
    type = 'SUCCESS';
  } else if (score > RNG_THRESHOLDS.barelyPassed) {
    type = 'BARELY_PASSED';
    statChanges.HP = -5;
  } else {
    type = 'CRITICAL_FAIL';
    statChanges.HP = -20;
  }

  // Token 不足 Level C 直接大失败
  if (grade === 'D' || tokenInvested <= 0) {
    type = 'CRITICAL_FAIL';
    statChanges.HP = -20;
  }

  const narratives = RNG_NARRATIVES[type];
  const narrative = narratives[Math.floor(Math.random() * narratives.length)];

  return { type, score, luck, statChanges, narrative };
}

// ==================== 事件卡片生成 ====================

/** 事件卡片副标题模板 */
const CARD_SUBTITLES: Record<RNGResultType, string[]> = {
  CRITICAL_SUCCESS: [
    '✨ 天选之人',
    '🎯 完美发挥',
    '🏆 传说诞生',
    '💎 钻石收获',
  ],
  SUCCESS: [
    '✓ 稳定输出',
    '📋 按部就班',
    '👍 不负期望',
  ],
  BARELY_PASSED: [
    '😅 惊险过关',
    '🫣 差点翻车',
    '⚠️ 及格边缘',
  ],
  CRITICAL_FAIL: [
    '💀 全军覆没',
    '🔥 灾难现场',
    '💥 一地鸡毛',
    '😱 不忍直视',
  ],
};

/** 卡片稀有度映射 */
function determineCardRarity(
  rngType: RNGResultType,
  grade: TaskGrade,
): EventCard['cardRarity'] {
  if (rngType === 'CRITICAL_SUCCESS' && (grade === 'S' || grade === 'A')) return 'legendary';
  if (rngType === 'CRITICAL_SUCCESS') return 'epic';
  if (rngType === 'SUCCESS' && grade === 'S') return 'epic';
  if (rngType === 'SUCCESS') return 'rare';
  if (rngType === 'CRITICAL_FAIL') return 'rare'; // 大失败也是"稀有"经历
  return 'common';
}

/**
 * 根据 ownerAgent 推断默认的任务类别
 */
function inferCategoryFromAgent(agent: AgentId): string {
  switch (agent) {
    case 'ENTJ': return 'WORK_AI';
    case 'ISFJ': return 'HEALTH_AI';
    case 'INFJ': return 'SOCIAL_AI';
    case 'ESTP': return 'ENTERTAIN_AI';
    default: return 'WORK_AI';
  }
}

/**
 * 为单个坍缩结果生成事件卡片
 *
 * 属性变化规则:
 * - CRITICAL_SUCCESS: Social +10, Professional +5, Sanity +5
 * - SUCCESS: Professional +3
 * - BARELY_PASSED: Professional -5
 * - CRITICAL_FAIL: Sanity -20, 任务标记 CORRUPTED
 */
export function generateEventCard(
  collapse: CollapseResult,
  luckModifier: number = 0,
): EventCard {
  const rngResult = rollEnhanced(collapse.tokenInvested, collapse.finalGrade, luckModifier);

  // 属性变化计算
  const statChanges = calculateStatChanges(rngResult.type, collapse.finalGrade, collapse.ownerAgent);

  // 特殊道具判定
  const specialItems = rollSpecialItems(rngResult.type, collapse.finalGrade);

  // 副标题
  const subtitles = CARD_SUBTITLES[rngResult.type];
  const subtitle = subtitles[Math.floor(Math.random() * subtitles.length)];

  // 任务类别（用于生成结果描述）
  const category = collapse.category || inferCategoryFromAgent(collapse.ownerAgent);

  // 生成具体的结果描述和属性影响
  const { resultDescription, statImpact } = generateTaskResultDescription(
    collapse.taskName,
    category,
    rngResult.type,
    collapse.finalGrade,
  );

  return {
    id: `card_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type: specialItems.length > 0 ? 'SPECIAL_ITEM' : rngResult.type as EventCardType,
    taskId: collapse.taskId,
    taskName: collapse.taskName,
    ownerAgent: collapse.ownerAgent,
    category: collapse.category,
    grade: collapse.finalGrade,
    score: rngResult.score,
    luck: rngResult.luck,
    statChanges,
    specialItems,
    narrative: rngResult.narrative,
    resultDescription,
    statImpact,
    subtitle,
    cardRarity: determineCardRarity(rngResult.type, collapse.finalGrade),
  };
}

// ==================== 属性变化计算 ====================

// ==================== 任务结果描述生成器 (设计文档 §10) ====================

/** 任务类别对应的具体结果描述模板 */
const TASK_RESULT_TEMPLATES: Record<string, Record<RNGResultType, { result: string[]; impact: string[] }>> = {
  // 工作类任务
  WORK_AI: {
    CRITICAL_SUCCESS: {
      result: [
        '报告不仅完成了，还被老板在全员会议上表扬！',
        '代码质量极高，意外成为团队的代码模板！',
        'PPT效果惊艳，客户当场拍板签约！',
        '邮件处理得当，客户回复了额外合作意向！',
        '产出超出预期，项目提前完成！',
      ],
      impact: [
        '你的"职业声望"暴涨，同事投来羡慕的目光！',
        '老板的信任度 +15，升职加薪有望！',
        '你的"专业能力"被认可，获得项目主导权！',
        '团队影响力 +20，成为核心成员！',
      ],
    },
    SUCCESS: {
      result: [
        '任务顺利完成，质量符合预期。',
        '稳定输出，按时交付无差错。',
        '标准产出，客户表示满意。',
        '工作完成，流程规范。',
      ],
      impact: [
        '你的"专业度"稳步提升。',
        '工作经验 +3，持续积累中。',
        '职业轨迹正常运行。',
      ],
    },
    BARELY_PASSED: {
      result: [
        '虽然完成了，但被要求返工修改细节。',
        '代码跑通了，不过到处是Warning。',
        '勉强交差，但质量堪忧需要补救。',
        '最后一秒提交，同事帮忙善后。',
      ],
      impact: [
        '为了节省Token，逻辑不够清晰，你的"职业声望"略微下降。',
        '同事对你的靠谱程度产生怀疑，信任度 -5。',
        '老板皱了皱眉，期待值降低。',
      ],
    },
    CRITICAL_FAIL: {
      result: [
        'AI产生幻觉，输出一堆乱码和虚假数据！',
        '关键文件丢失，所有工作付之东流！',
        '系统崩溃，任务彻底失败！',
        '低级错误被客户发现，尴尬至极！',
      ],
      impact: [
        '你的"职业声望"暴跌，需要加倍努力挽回！',
        '老板的信任度 -20，考核堪忧！',
        '团队对你投来失望的目光，士气受损！',
      ],
    },
  },
  // 睡眠类任务
  SLEEP_AI: {
    CRITICAL_SUCCESS: {
      result: [
        '入睡引导效果极佳，一夜好眠精神焕发！',
        '睡眠质量分析精准，找到了失眠根源！',
        '休息安排完美，第二天精力充沛！',
      ],
      impact: [
        '精神值大幅恢复，HP +15！',
        '你的"健康指数"提升，状态极佳！',
        '第二天效率提升 30%！',
      ],
    },
    SUCCESS: {
      result: [
        '休息安排合理，睡眠质量正常。',
        '入睡引导起效，基本达到休息目的。',
        '睡眠数据已记录，建议可参考。',
      ],
      impact: [
        '精神值稳定恢复，状态正常。',
        'HP +5，维持健康运转。',
      ],
    },
    BARELY_PASSED: {
      result: [
        '入睡引导被打断，睡眠断断续续。',
        '休息时间不足，勉强撑过。',
        '睡眠质量欠佳，有些疲惫。',
      ],
      impact: [
        '精神值恢复不足，HP -3。',
        '第二天有些精神不济。',
      ],
    },
    CRITICAL_FAIL: {
      result: [
        '入睡失败，整晚辗转反侧！',
        '睡眠系统崩溃，彻夜难眠！',
        '休息计划完全失效，严重缺觉！',
      ],
      impact: [
        '精神值暴跌，HP -20！',
        '第二天状态极差，效率减半！',
        '健康告急，需要紧急休息！',
      ],
    },
  },
  // 娱乐类任务
  ENTERTAIN_AI: {
    CRITICAL_SUCCESS: {
      result: [
        '推荐的内容正中红心，获得极致娱乐体验！',
        '歌单完美匹配心情，灵感涌现！',
        '电影推荐神准，度过了美妙的时光！',
        '游戏攻略帮你达成隐藏成就！',
      ],
      impact: [
        '你的"生活幸福感"飙升！',
        '创意值 +15，灵感爆棚！',
        '压力完全释放，心情大好！',
      ],
    },
    SUCCESS: {
      result: [
        '娱乐时光愉快，内容符合预期。',
        '推荐质量不错，放松到位。',
        '消遣顺利，心情舒畅。',
      ],
      impact: [
        '压力缓解，状态好转。',
        '娱乐获得了应有的效果。',
      ],
    },
    BARELY_PASSED: {
      result: [
        '推荐的内容有点老套，勉强消磨时间。',
        '娱乐体验一般，没有太多惊喜。',
        '歌单凑合听，没有特别喜欢的。',
      ],
      impact: [
        '时间花了但收获一般。',
        '放松效果打折扣。',
      ],
    },
    CRITICAL_FAIL: {
      result: [
        '推荐全是雷区，浪费了宝贵时间！',
        '内容剧透被坑，心情跌入谷底！',
        'AI推荐完全不靠谱，大失所望！',
      ],
      impact: [
        '娱乐变成闷气，心情值 -15！',
        '对AI推荐失去信心！',
        '时间白白浪费，压力更大！',
      ],
    },
  },
  // 社交类任务
  SOCIAL_AI: {
    CRITICAL_SUCCESS: {
      result: [
        '祝福文案获得对方盛赞，关系更近一步！',
        '社交安排完美，收获了真挚的友谊！',
        '沟通策略奏效，成功化解矛盾！',
        '人脉拓展超预期，结识了重要人物！',
      ],
      impact: [
        '你的"社会影响力"暴涨！',
        '人际关系值 +20，社交达人！',
        '社交能力被认可，魅力值提升！',
      ],
    },
    SUCCESS: {
      result: [
        '社交任务完成，维持了正常关系。',
        '祝福送出，对方客气回复。',
        '沟通顺畅，达到基本目的。',
      ],
      impact: [
        '社交关系稳定运转。',
        '人际网络正常维护。',
      ],
    },
    BARELY_PASSED: {
      result: [
        '文案有点生硬，对方礼貌性回复。',
        '社交尝试效果一般，没有明显进展。',
        '沟通有些尴尬，勉强完成。',
      ],
      impact: [
        '社交投资回报不高。',
        '关系维护打了折扣。',
      ],
    },
    CRITICAL_FAIL: {
      result: [
        'AI文案出现大乌龙，发送了尴尬内容！',
        '社交场合说错话，气氛瞬间冷场！',
        '沟通完全失败，关系恶化！',
      ],
      impact: [
        '你的"社交声誉"受损！',
        '人际关系值 -15，需要修复！',
        '社交恐惧 +10，压力山大！',
      ],
    },
  },
  // 理财类任务
  SAVINGS_AI: {
    CRITICAL_SUCCESS: {
      result: [
        '理财分析精准，抓住了投资良机！',
        '预算规划完美，意外节省大笔开支！',
        '财务报表一目了然，老板大加赞赏！',
      ],
      impact: [
        '你的"财务智慧"得到验证！',
        '财富值大幅增长！',
        '财务自由更近一步！',
      ],
    },
    SUCCESS: {
      result: [
        '财务任务完成，收支平衡正常。',
        '理财建议可行，按计划执行。',
        '账目清晰，财务健康。',
      ],
      impact: [
        '财务状况稳定运转。',
        '理财技能持续积累。',
      ],
    },
    BARELY_PASSED: {
      result: [
        '财务分析有误差，需要人工复核。',
        '预算超支了一点，勉强控制住。',
        '理财建议太保守，收益偏低。',
      ],
      impact: [
        '财务效率不如预期。',
        '理财收益打了折扣。',
      ],
    },
    CRITICAL_FAIL: {
      result: [
        '财务数据出错，账目混乱！',
        '投资建议踩雷，损失惨重！',
        '预算完全失控，财务危机！',
      ],
      impact: [
        '财富值暴跌！',
        '财务信用受损！',
        '需要紧急止损！',
      ],
    },
  },
  // 健康类任务
  HEALTH_AI: {
    CRITICAL_SUCCESS: {
      result: [
        '健康建议效果显著，体能状态极佳！',
        '运动计划完美执行，突破个人记录！',
        '饮食建议科学有效，精力充沛！',
      ],
      impact: [
        '你的"健康值"大幅提升！',
        'HP +20，体能巅峰！',
        '生活质量显著改善！',
      ],
    },
    SUCCESS: {
      result: [
        '健康任务完成，身体状态正常。',
        '运动计划执行，保持良好习惯。',
        '健康数据正常，继续保持。',
      ],
      impact: [
        '健康状态稳定，HP 维持正常。',
      ],
    },
    BARELY_PASSED: {
      result: [
        '健康计划执行不到位，效果打折。',
        '运动量不足，勉强完成任务。',
        '饮食控制不够严格。',
      ],
      impact: [
        '健康投资回报一般。',
        '体能提升有限。',
      ],
    },
    CRITICAL_FAIL: {
      result: [
        '健康建议完全不适合，身体不适！',
        '运动过度，造成损伤！',
        '健康数据丢失，计划中断！',
      ],
      impact: [
        'HP -15，身体亮红灯！',
        '需要紧急休息调整！',
      ],
    },
  },
  // 游戏类任务
  GAMING_AI: {
    CRITICAL_SUCCESS: {
      result: [
        '游戏攻略神准，通关隐藏Boss！',
        '策略完美执行，排名飙升至前列！',
        '发现游戏彩蛋，获得稀有道具！',
      ],
      impact: [
        '游戏成就解锁，满足感爆棚！',
        '娱乐值 +15，心情大好！',
      ],
    },
    SUCCESS: {
      result: [
        '游戏体验顺畅，达成基本目标。',
        '攻略帮助有效，顺利推进。',
      ],
      impact: [
        '娱乐放松到位。',
      ],
    },
    BARELY_PASSED: {
      result: [
        '攻略有点过时，走了些弯路。',
        '游戏卡关，勉强推进。',
      ],
      impact: [
        '娱乐效果一般。',
      ],
    },
    CRITICAL_FAIL: {
      result: [
        '攻略完全错误，存档损坏！',
        '游戏Bug导致进度丢失！',
      ],
      impact: [
        '游戏体验极差，心情糟糕！',
        '时间白白浪费！',
      ],
    },
  },
  // 学习类任务
  LEARNING_AI: {
    CRITICAL_SUCCESS: {
      result: [
        '学习效率惊人，知识吸收完美！',
        '学习计划超额完成，融会贯通！',
        '学习成果被认可，获得额外机会！',
      ],
      impact: [
        '你的"知识储备"大幅提升！',
        '学习能力 +15，成长飞速！',
      ],
    },
    SUCCESS: {
      result: [
        '学习任务完成，知识有所增长。',
        '学习计划正常执行，稳步进步。',
      ],
      impact: [
        '知识积累持续进行。',
      ],
    },
    BARELY_PASSED: {
      result: [
        '学习有些分心，效果打折扣。',
        '知识点记忆不牢，需要复习。',
      ],
      impact: [
        '学习效率偏低。',
      ],
    },
    CRITICAL_FAIL: {
      result: [
        '学习资料错误百出，误导学习方向！',
        '学习计划完全失效，浪费大量时间！',
      ],
      impact: [
        '学习信心受挫！',
        '知识体系混乱！',
      ],
    },
  },
};

/** 通用（兜底）结果描述模板 */
const GENERIC_RESULT_TEMPLATES: Record<RNGResultType, { result: string[]; impact: string[] }> = {
  CRITICAL_SUCCESS: {
    result: [
      '任务完美完成，超出所有预期！',
      '表现出色，成果令人惊艳！',
      '完美发挥，获得意想不到的收获！',
    ],
    impact: [
      '相关属性大幅提升！',
      '你的声望和能力得到认可！',
    ],
  },
  SUCCESS: {
    result: [
      '任务顺利完成，达到预期。',
      '稳定输出，按计划执行。',
    ],
    impact: [
      '属性稳步增长。',
    ],
  },
  BARELY_PASSED: {
    result: [
      '勉强完成，质量一般。',
      '差点翻车，最后关头救回。',
    ],
    impact: [
      '为了节省Token牺牲了质量，表现略有下滑。',
    ],
  },
  CRITICAL_FAIL: {
    result: [
      '任务彻底失败！',
      'AI崩溃，一切化为泡影！',
    ],
    impact: [
      '相关属性严重下降！',
      '需要付出额外努力挽回！',
    ],
  },
};

/**
 * 为任务生成具体的结果描述和属性影响
 * 根据任务类别、名称和RNG结果生成个性化描述
 */
export function generateTaskResultDescription(
  taskName: string,
  category: string,
  rngType: RNGResultType,
  grade: TaskGrade,
): { resultDescription: string; statImpact: string } {
  // 获取类别对应的模板，如果没有则使用通用模板
  const templates = TASK_RESULT_TEMPLATES[category] || GENERIC_RESULT_TEMPLATES;
  const typeTemplates = templates[rngType] || GENERIC_RESULT_TEMPLATES[rngType];

  // 随机选择描述
  const resultDescriptions = typeTemplates.result;
  const statImpacts = typeTemplates.impact;

  const resultDescription = resultDescriptions[Math.floor(Math.random() * resultDescriptions.length)];
  const statImpact = statImpacts[Math.floor(Math.random() * statImpacts.length)];

  // 针对等级进行微调
  let gradePrefix = '';
  if (grade === 'S' && rngType === 'CRITICAL_SUCCESS') {
    gradePrefix = '🏆 传奇级完成！';
  } else if (grade === 'D' && rngType === 'CRITICAL_FAIL') {
    gradePrefix = '💀 灾难级失败...';
  }

  return {
    resultDescription: gradePrefix ? `${gradePrefix} ${resultDescription}` : resultDescription,
    statImpact,
  };
}

// ==================== 属性变化计算 ====================

/**
 * 根据 RNG 结果和任务等级计算属性变化
 *
 * 设计文档 §6.1:
 * - 大成功: Social +10, 获特殊道具
 * - 成功: 标准经验值 (Professional +3)
 * - 勉强通过: Professional -5
 * - 大失败: Sanity -20, 任务 CORRUPTED
 */
function calculateStatChanges(
  type: RNGResultType,
  grade: TaskGrade,
  agent: AgentId,
): EventCard['statChanges'] {
  const changes = { professional: 0, social: 0, sanity: 0, wealth: 0 };

  // 基础变化
  switch (type) {
    case 'CRITICAL_SUCCESS':
      changes.social = 10;
      changes.professional = 5;
      changes.sanity = 5;
      changes.wealth = 20;
      break;
    case 'SUCCESS':
      changes.professional = 3;
      changes.wealth = 5;
      break;
    case 'BARELY_PASSED':
      changes.professional = -5;
      changes.sanity = -3;
      break;
    case 'CRITICAL_FAIL':
      changes.sanity = -20;
      changes.professional = -10;
      changes.wealth = -10;
      break;
  }

  // 等级加成/惩罚
  const gradeMultipliers: Record<TaskGrade, number> = { S: 2.0, A: 1.5, B: 1.0, C: 0.5, D: 0.1 };
  const multiplier = gradeMultipliers[grade];

  changes.professional = Math.round(changes.professional * multiplier);
  changes.social = Math.round(changes.social * multiplier);
  changes.wealth = Math.round(changes.wealth * multiplier);

  // Agent 特色加成
  switch (agent) {
    case 'ENTJ':
      changes.professional = Math.round(changes.professional * 1.3);
      break;
    case 'ISFJ':
      changes.sanity = Math.round(changes.sanity * 1.2);
      changes.wealth = Math.round(changes.wealth * 1.3);
      break;
    case 'INFJ':
      changes.social = Math.round(changes.social * 1.5);
      break;
    case 'ESTP':
      // 风险代理: 大成功赚更多，大失败亏更多
      if (type === 'CRITICAL_SUCCESS') {
        changes.wealth = Math.round(changes.wealth * 1.5);
      } else if (type === 'CRITICAL_FAIL') {
        changes.wealth = Math.round(changes.wealth * 1.5);
      }
      break;
  }

  return changes;
}

// ==================== 特殊道具抽取 ====================

/**
 * 大成功时有概率获得特殊道具
 * - S级大成功: 100% 获得道具
 * - A级大成功: 60%
 * - B级大成功: 30%
 * - 其他: 0%
 */
function rollSpecialItems(type: RNGResultType, grade: TaskGrade): SpecialItem[] {
  if (type !== 'CRITICAL_SUCCESS') return [];

  const dropChance: Record<TaskGrade, number> = { S: 1.0, A: 0.6, B: 0.3, C: 0.1, D: 0 };
  const chance = dropChance[grade];

  if (Math.random() > chance) return [];

  // 随机选一个道具
  const item = SPECIAL_ITEMS[Math.floor(Math.random() * SPECIAL_ITEMS.length)];

  // S级大成功有小概率掉两个
  if (grade === 'S' && Math.random() < 0.3) {
    const secondItem = SPECIAL_ITEMS.filter(i => i.id !== item.id)[
      Math.floor(Math.random() * (SPECIAL_ITEMS.length - 1))
    ];
    return [item, secondItem];
  }

  return [item];
}

// ==================== 连击奖励 (Combo Bonus) ====================

/**
 * 如果多个任务连续成功/大成功,给予额外 combo 奖励
 */
function calculateComboBonus(cards: EventCard[]): {
  comboCount: number;
  bonusStats: EventCard['statChanges'];
  bonusItem?: SpecialItem;
} {
  const successStreak = cards.filter(
    c => c.type === 'CRITICAL_SUCCESS' || c.type === 'SUCCESS',
  ).length;

  const bonusStats = { professional: 0, social: 0, sanity: 0, wealth: 0 };

  if (successStreak < 2) return { comboCount: 0, bonusStats };

  // 每额外一个成功 +5 各属性
  const comboMultiplier = Math.min(3, successStreak - 1);
  bonusStats.professional = 5 * comboMultiplier;
  bonusStats.social = 3 * comboMultiplier;
  bonusStats.sanity = 2 * comboMultiplier;
  bonusStats.wealth = 10 * comboMultiplier;

  // 3+ combo 额外掉道具
  let bonusItem: SpecialItem | undefined;
  if (successStreak >= 3) {
    bonusItem = SPECIAL_ITEMS.find(i => i.id === 'INSPIRE') || SPECIAL_ITEMS[0];
  }

  return { comboCount: successStreak, bonusStats, bonusItem };
}

// ==================== 结算报告构建 (设计文档 §7) ====================

export interface SettlementInput {
  sessionId: string;
  sessionNumber: number;
  collapseResults: CollapseResult[];
  trades: TradeProposal[];
  agentStates: AgentState[];
  totalBudget: number;
  realDurationSec: number;
  logs: CouncilLogEntry[];
  luckModifier?: number;
}

/**
 * 构建完整结算报告
 *
 * 流程:
 * 1. 为每个坍缩结果 roll RNG, 生成事件卡片
 * 2. 计算 combo 连击奖励
 * 3. 汇总属性变化
 * 4. 计算 Token 结算 (盈余结转 ×0.5)
 * 5. 提取高光时刻
 * 6. 生成虚拟交付物
 * 7. 拼装叙事总结
 */
export function buildSettlementReport(input: SettlementInput): SettlementReport {
  const {
    sessionId, sessionNumber, collapseResults, trades,
    agentStates, totalBudget, realDurationSec, logs, luckModifier,
  } = input;

  // 1. RNG Roll — 为每个任务生成事件卡片
  const eventCards: EventCard[] = collapseResults.map(cr =>
    generateEventCard(cr, luckModifier),
  );

  // 2. Combo 连击检测
  const combo = calculateComboBonus(eventCards);

  // 3. 汇总属性变化
  const statDelta = { professional: 0, social: 0, sanity: 0, wealth: 0 };
  for (const card of eventCards) {
    statDelta.professional += card.statChanges.professional;
    statDelta.social += card.statChanges.social;
    statDelta.sanity += card.statChanges.sanity;
    statDelta.wealth += card.statChanges.wealth;
  }
  // 加上 combo 奖励
  statDelta.professional += combo.bonusStats.professional;
  statDelta.social += combo.bonusStats.social;
  statDelta.sanity += combo.bonusStats.sanity;
  statDelta.wealth += combo.bonusStats.wealth;

  // 4. Token 结算
  const totalSpent = collapseResults.reduce((sum, cr) => sum + cr.tokenInvested, 0);
  const remaining = Math.max(0, totalBudget - totalSpent);
  // 设计文档 §8.1: 盈余结转 = 盈余 × 0.5
  const carryOver = Math.round(remaining * 0.5);
  const meltdownOccurred = totalSpent > totalBudget * 1.2; // 超支 20% 以上 = 熔断

  // 5. 收集所有特殊道具
  const itemsEarned: SpecialItem[] = eventCards.flatMap(c => c.specialItems);
  if (combo.bonusItem) itemsEarned.push(combo.bonusItem);

  // 6. 高光时刻
  const highlights: SettlementReport['highlights'] = [];

  for (const card of eventCards) {
    if (card.type === 'CRITICAL_SUCCESS') {
      highlights.push({
        type: 'critical_success',
        icon: '🎯',
        description: `${AGENT_DEFINITIONS[card.ownerAgent].icon} ${card.taskName}: ${card.narrative}`,
      });
    }
    if (card.type === 'CRITICAL_FAIL') {
      highlights.push({
        type: 'critical_fail',
        icon: '💥',
        description: `${AGENT_DEFINITIONS[card.ownerAgent].icon} ${card.taskName}: ${card.narrative}`,
      });
    }
    for (const item of card.specialItems) {
      highlights.push({
        type: 'item',
        icon: item.icon,
        description: `获得道具「${item.name}」: ${item.description}`,
      });
    }
  }

  for (const trade of trades) {
    highlights.push({
      type: 'trade',
      icon: '🤝',
      description: trade.rationale,
    });
  }

  if (combo.comboCount >= 2) {
    highlights.push({
      type: 'combo',
      icon: '🔥',
      description: `${combo.comboCount}连击！额外获得 Professional+${combo.bonusStats.professional} Social+${combo.bonusStats.social}`,
    });
  }

  // 7. 虚拟交付物
  const deliverables = collapseResults
    .filter(cr => cr.finalGrade !== 'D')
    .map(cr => ({
      filename: generateDeliverableFilename(cr),
      level: cr.finalGrade,
      description: `${cr.taskName} (${cr.finalGrade}级, ${cr.tokenInvested} tokens)`,
    }));

  // 8. 总评分
  const overallGrade = calculateOverallGrade(eventCards, statDelta, meltdownOccurred);

  // 9. 叙事总结
  const narrativeSummary = buildNarrativeSummary(
    sessionNumber, eventCards, trades, combo, overallGrade, statDelta, realDurationSec,
  );

  return {
    sessionId,
    sessionNumber,
    overallGrade,
    collapseResults,
    eventCards,
    trades,
    tokenSettlement: {
      totalBudget,
      totalSpent,
      totalRemaining: remaining,
      surplus: remaining,
      carryOver,
      meltdownOccurred,
    },
    statDelta,
    itemsEarned,
    highlights: highlights.slice(0, 12),
    narrativeSummary,
    deliverables,
    realDurationSec,
    simulatedDurationMin: 60,
  };
}

// ==================== 总评分算法 ====================

function calculateOverallGrade(
  cards: EventCard[],
  statDelta: SettlementReport['statDelta'],
  meltdown: boolean,
): TaskGrade {
  if (meltdown) return 'D';

  // 基于事件卡片结果的综合分
  let score = 0;
  for (const card of cards) {
    switch (card.type as RNGResultType) {
      case 'CRITICAL_SUCCESS': score += 30; break;
      case 'SUCCESS': score += 15; break;
      case 'BARELY_PASSED': score += 5; break;
      case 'CRITICAL_FAIL': score -= 20; break;
    }
    // 等级加成
    const gradeBonus: Record<TaskGrade, number> = { S: 10, A: 7, B: 4, C: 1, D: -5 };
    score += gradeBonus[card.grade] || 0;
  }

  // 属性净变化加成
  const totalStatChange = statDelta.professional + statDelta.social + statDelta.sanity + statDelta.wealth;
  score += Math.round(totalStatChange / 10);

  // 每个任务的平均分
  const avgScore = cards.length > 0 ? score / cards.length : 0;

  if (avgScore >= 30) return 'S';
  if (avgScore >= 18) return 'A';
  if (avgScore >= 8) return 'B';
  if (avgScore >= 0) return 'C';
  return 'D';
}

// ==================== 虚拟交付物文件名生成 ====================

const DELIVERABLE_EXTENSIONS: Record<string, string[]> = {
  ENTJ: ['.pdf', '.ts', '.xlsx', '.md'],     // 工作/学习
  ISFJ: ['.json', '.csv', '.txt', '.pdf'],     // 健康/理财
  INFJ: ['.md', '.txt', '.pdf', '.html'],      // 社交/阅读
  ESTP: ['.mp4', '.png', '.gif', '.json'],     // 娱乐/游戏
};

function generateDeliverableFilename(cr: CollapseResult): string {
  const extensions = DELIVERABLE_EXTENSIONS[cr.ownerAgent] || ['.txt'];
  const ext = extensions[Math.floor(Math.random() * extensions.length)];
  const sanitizedName = cr.taskName
    .replace(/[^\w\u4e00-\u9fa5]/g, '_')
    .substring(0, 20);
  const date = new Date().toISOString().split('T')[0];
  const gradeTag = cr.finalGrade === 'S' ? '_PERFECT' : cr.finalGrade === 'A' ? '_EXCELLENT' : '';

  return `${sanitizedName}${gradeTag}_${date}${ext}`;
}

// ==================== 叙事总结构建 ====================

function buildNarrativeSummary(
  sessionNumber: number,
  cards: EventCard[],
  trades: TradeProposal[],
  combo: { comboCount: number; bonusStats: EventCard['statChanges'] },
  overallGrade: TaskGrade,
  statDelta: SettlementReport['statDelta'],
  realDurationSec: number,
): string {
  const parts: string[] = [];

  // Header
  parts.push(`📜 第 ${sessionNumber} 次议会决议`);
  parts.push(`耗时 ${realDurationSec} 秒 (现实) / 1 小时 (模拟)`);
  parts.push(`总评: ${overallGrade} 级`);
  parts.push('');

  // 事件摘要
  const critSuccesses = cards.filter(c => c.type === 'CRITICAL_SUCCESS');
  const critFails = cards.filter(c => c.type === 'CRITICAL_FAIL');

  if (critSuccesses.length > 0) {
    parts.push(`🎯 大成功 ×${critSuccesses.length}:`);
    for (const c of critSuccesses) {
      parts.push(`  ${AGENT_DEFINITIONS[c.ownerAgent].icon} ${c.taskName} → ${c.narrative}`);
    }
  }
  if (critFails.length > 0) {
    parts.push(`💥 大失败 ×${critFails.length}:`);
    for (const c of critFails) {
      parts.push(`  ${AGENT_DEFINITIONS[c.ownerAgent].icon} ${c.taskName} → ${c.narrative}`);
    }
  }

  // 交易
  if (trades.length > 0) {
    parts.push(`🤝 交易 ×${trades.length}:`);
    for (const t of trades) {
      parts.push(`  ${t.rationale}`);
    }
  }

  // Combo
  if (combo.comboCount >= 2) {
    parts.push(`🔥 ${combo.comboCount}连击！属性额外增益。`);
  }

  // 道具
  const items = cards.flatMap(c => c.specialItems);
  if (items.length > 0) {
    parts.push('');
    parts.push('🎁 获得道具:');
    for (const item of items) {
      parts.push(`  ${item.icon} ${item.name}: ${item.description}`);
    }
  }

  return parts.join('\n');
}

// ==================== 日循环结算 (设计文档 §8) ====================

/**
 * 每日重置计算
 * Token = 1000 + (昨日盈余 × 0.5)
 */
export function calculateDailyReset(
  baseBudget: number,
  previousSurplus: number,
): { newBudget: number; carryOverBonus: number } {
  const carryOverBonus = Math.round(previousSurplus * 0.5);
  return {
    newBudget: baseBudget + carryOverBonus,
    carryOverBonus,
  };
}

/**
 * Agent 成长权重调整 (设计文档 §8.2)
 * 频繁支持某 Agent → 该 Agent 初始权重增加
 * 逆向调节: 权重过高 → 触发强制修正
 */
export function adjustAgentGrowth(
  currentWeights: Record<AgentId, number>,
  supportHistory: Record<AgentId, number>, // 累计支持次数
  maxWeightRatio: number = 0.45, // 单 Agent 最大权重占比
): { adjustedWeights: Record<AgentId, number>; correctionTriggered: boolean; correctionMessage?: string } {
  const total = Object.values(supportHistory).reduce((s, v) => s + v, 0) || 1;
  const adjustedWeights = { ...currentWeights };
  let correctionTriggered = false;
  let correctionMessage: string | undefined;

  // 根据支持频率微调权重 (每次支持 +0.01)
  for (const agentId of Object.keys(supportHistory) as AgentId[]) {
    const supportRatio = supportHistory[agentId] / total;
    adjustedWeights[agentId] += supportRatio * 0.05;
  }

  // 归一化
  const weightTotal = Object.values(adjustedWeights).reduce((s, v) => s + v, 0);
  for (const agentId of Object.keys(adjustedWeights) as AgentId[]) {
    adjustedWeights[agentId] = adjustedWeights[agentId] / weightTotal * 4; // 总和 = 4
  }

  // 逆向调节: 检测权重过高
  for (const agentId of Object.keys(adjustedWeights) as AgentId[]) {
    const ratio = adjustedWeights[agentId] / 4;
    if (ratio > maxWeightRatio) {
      // 强制压回
      adjustedWeights[agentId] = maxWeightRatio * 4;
      correctionTriggered = true;
      const def = AGENT_DEFINITIONS[agentId];
      correctionMessage = `⚠️ ${def.roleCn}(${agentId})权重过高(${(ratio * 100).toFixed(0)}%)，系统触发强制修正事件。`;

      // 释放的权重平均分给其他 Agent
      const excess = ratio - maxWeightRatio;
      const othersCount = Object.keys(adjustedWeights).length - 1;
      for (const otherId of Object.keys(adjustedWeights) as AgentId[]) {
        if (otherId !== agentId) {
          adjustedWeights[otherId] += (excess * 4) / othersCount;
        }
      }
    }
  }

  return { adjustedWeights, correctionTriggered, correctionMessage };
}

// ==================== 结算报告序列化 (可读文本) ====================

/**
 * 将结算报告渲染为终端风格的可读文本
 */
export function serializeSettlementReport(report: SettlementReport): string {
  const lines: string[] = [];

  lines.push('╔══════════════════════════════════════════════════════╗');
  lines.push(`║  📜 第 ${report.sessionNumber} 次议会决议  [总评: ${report.overallGrade}]`);
  lines.push('╠══════════════════════════════════════════════════════╣');
  lines.push(`║ ⏱  耗时: ${report.realDurationSec}s (现实) / ${report.simulatedDurationMin}min (模拟)`);
  lines.push(`║ 🪙 Token: ${report.tokenSettlement.totalSpent}/${report.tokenSettlement.totalBudget} | 盈余: ${report.tokenSettlement.surplus} → 明日结转: +${report.tokenSettlement.carryOver}`);

  if (report.tokenSettlement.meltdownOccurred) {
    lines.push('║ 🔥 MELTDOWN: Token 严重超支！');
  }

  lines.push('╠══════════════════════════════════════════════════════╣');
  lines.push('║  📋 任务结果');
  lines.push('╠──────────────────────────────────────────────────────╣');

  for (const card of report.eventCards) {
    const gradeIcon = { S: '🏆', A: '⭐', B: '✅', C: '⚠️', D: '💀' }[card.grade] || '❓';
    const resultIcon = {
      CRITICAL_SUCCESS: '🎯',
      SUCCESS: '✓',
      BARELY_PASSED: '😅',
      CRITICAL_FAIL: '💥',
      SPECIAL_ITEM: '🎁',
      COMBO_BONUS: '🔥',
      MELTDOWN_RECOVERY: '🛡️',
    }[card.type] || '❓';
    
    // 显示具体任务结果描述（设计文档 §10）
    const resultDesc = card.resultDescription || card.subtitle;
    lines.push(`║ ${gradeIcon} ${card.taskName.padEnd(18)} ${resultIcon}`);
    lines.push(`║   ${resultDesc}`);
    if (card.statImpact) {
      lines.push(`║   → ${card.statImpact}`);
    }
    if (card.specialItems.length > 0) {
      for (const item of card.specialItems) {
        lines.push(`║   ${item.icon} 获得「${item.name}」`);
      }
    }
  }

  if (report.highlights.length > 0) {
    lines.push('╠══════════════════════════════════════════════════════╣');
    lines.push('║  ⚡ 高光时刻');
    lines.push('╠──────────────────────────────────────────────────────╣');
    for (const h of report.highlights.slice(0, 5)) {
      lines.push(`║ ${h.icon} ${h.description.substring(0, 50)}`);
    }
  }

  if (report.deliverables.length > 0) {
    lines.push('╠══════════════════════════════════════════════════════╣');
    lines.push('║  📦 交付文件');
    lines.push('╠──────────────────────────────────────────────────────╣');
    for (const d of report.deliverables) {
      const levelTag = `[${d.level}]`;
      lines.push(`║ ${levelTag} ${d.filename}`);
    }
  }

  lines.push('╚══════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

// ==================== 结算报告转 ResultCard (兼容旧接口) ====================

import type { ResultCard } from './types';

/**
 * 将 SettlementReport 转为 ResultCard 以兼容现有 orchestrator 接口
 */
export function settlementToResultCard(report: SettlementReport): ResultCard {
  return {
    sessionId: report.sessionId,
    sessionNumber: report.sessionNumber,
    grade: report.overallGrade,
    netValue: report.statDelta.professional + report.statDelta.social,
    tokenSpent: report.tokenSettlement.totalSpent,
    tokenRemaining: report.tokenSettlement.totalRemaining,
    tokenSurplus: report.tokenSettlement.surplus,
    meltdownOccurred: report.tokenSettlement.meltdownOccurred,
    tasks: report.eventCards.map(c => ({
      title: c.taskName,
      grade: c.grade,
      tokenCost: c.score,
      rngResult: {
        type: c.type as RNGResultType,
        score: c.score,
        luck: c.luck,
        statChanges: {
          HP: c.statChanges.sanity,
          SOC: c.statChanges.social,
        },
        narrative: c.narrative,
      },
      // 新增：具体的任务结果描述和属性影响
      resultDescription: c.resultDescription || c.narrative,
      statImpact: c.statImpact || '',
    })),
    highlights: report.highlights.map(h => ({
      type: h.type === 'critical_success' ? 'critical_success'
        : h.type === 'critical_fail' ? 'critical_fail'
        : 'trade',
      description: `${h.icon} ${h.description}`,
    })),
    deliverables: report.deliverables,
    narrativeSummary: report.narrativeSummary,
    realDurationSec: report.realDurationSec,
    simulatedDurationMin: report.simulatedDurationMin,
  };
}
