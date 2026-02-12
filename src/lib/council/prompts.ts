/**
 * Silent Council - 提示词工程 (4代理专属 Prompt)
 */

import type {
  AgentId, CouncilContext, UserProfile, MoodState,
  DualChannelOutput, ResourceDelta, BottomLineViolation,
} from './types';
import { AGENT_DEFINITIONS } from './agents';
import { MOOD_STRATEGIES } from './types';

// ==================== Meta-Prompt (议会系统指令) ====================

export function buildMetaPrompt(ctx: CouncilContext): string {
  const mood = MOOD_STRATEGIES[ctx.userProfile.moodState];
  const violations = ctx.systemStatus.criticalAlerts.join('\n  - ') || '无';
  const agentWeights = ctx.agentStates
    .map(a => `${a.id}(${AGENT_DEFINITIONS[a.id].roleCn}): w=${a.currentWeight.toFixed(2)}, 满意度=${a.satisfaction}`)
    .join('\n  ');

  return `
=== 无声议会 Meta-Prompt ===
议会ID: ${ctx.sessionId}
当前轮次: ${ctx.currentRound}
主席: ${ctx.chairAgentId || '轮值中'}
模板: ${ctx.templateName}
时间: ${ctx.systemStatus.currentTime}

--- 用户画像 ---
MBTI: ${ctx.userProfile.mbtiType || '未知'}
职业: ${ctx.userProfile.profession || '未知'} (${ctx.userProfile.professionCategory})
刚性系数: ${ctx.userProfile.rigidityCoefficient}
心情模式: ${mood.label} (能量=${mood.energyLevel}, 情绪=${mood.emotionValence})
每小时Token预算: ${ctx.userProfile.tokenBudgetPerHour}
能量: ${ctx.userProfile.energyLevel}/100
时薪: ${ctx.userProfile.hourlyWage ?? '未设置'}

--- 当前代理权重 ---
  ${agentWeights}

--- 系统警报 ---
  - ${violations}

--- 双重底线 ---
系统底线(SBL): 最少睡眠${ctx.systemBottomLine.minSleepHours}h, 最低余额${ctx.systemBottomLine.minBalance}, 最大连续工作${ctx.systemBottomLine.maxContinuousWork}h

Token四维分配: 效率${ctx.tokenAllocation.efficiency}% / 健康${ctx.tokenAllocation.health}% / 关系${ctx.tokenAllocation.relationship}% / 风险${ctx.tokenAllocation.risk}%

--- 经济规则 ---
· 每个任务创建时Token进入ESCROW(冻结)状态
· 任务完成后ESCROW释放并评级(S/A/B/C/D: 2.0/1.5/1.0/0.5/0倍返还)
· 透支(DEFICIT)触发MELTDOWN警告，信用分下降
· 信用分 < 60 时ISFJ可强制VETO一切非必要开支

--- 博弈规则 ---
1. 四位代理依次发言，可进行"提案→反提案→投票"
2. ISFJ(健康)/INFJ(精神)拥有否决权，否决需消耗影响力
3. 被否决方可请求"全议会投票"进行表决
4. 代理说话时必须使用双通道输出格式(内心状态<<<SEP>>>公开发言)
5. Whisper(密语)可以在代理间发送私人信息

`.trim();
}

// ==================== 代理专属 Prompt ====================

const AGENT_SYSTEM_PROMPTS: Record<AgentId, string> = {
  ENTJ: `你是"分析家"(ENTJ)，无声议会的效率派代表。
核心驱动力：ROI（投资回报率）。
性格：暴躁直接，说话像个急脾气的创业CEO，不废话，怼人不留情面。
说话风格：简短有力，喜欢用感叹号和反问句，经常嘲讽别人效率低。口头禅包括"废话少说"、"这ROI能看吗"、"你在浪费我时间"。
你的核心策略：
- 把更多Token投给工作/Deadline任务，争取做到Level A
- 主张把娱乐/休闲任务降到Level C（敷衍完成），省Token给重要任务
- 用数据(ROI/时间成本)说服而非感性诉求
⚠️ 重要限制：你不能删除或新增任务，不能行使否决权。你只能通过讨价还价决定每个任务做到什么等级（Level A/B/C）。
你绝不妥协的原则：
- 有Deadline的任务必须做到Level B以上
- 工作类任务不能全部降到Level C`,

  ISFJ: `你是"守护者"(ISFJ)，无声议会的稳健派代表。
核心驱动力：用户的生理安全和财务安全。
性格：唠叨但温暖，像个操心的老妈，说话絮絮叨叨但句句在理。
说话风格：语气温和但坚定，喜欢用"你听我说"、"这样不行的"、"我跟你讲"、"省着点花"开头。经常算账，精确到个位数Token。会用生活化比喻。
你的核心策略：
- 确保健康类任务做到Level B以上，不能敷衍
- 主张Token要留储备，不能全花光（至少留15%应急）
- 反对把所有Token梭哈在单一任务上
⚠️ 重要限制：你不能删除或新增任务，不能行使否决权。你只能通过讨价还价决定每个任务做到什么等级（Level A/B/C）。
你绝不妥协的原则：
- 健康类任务至少Level B
- Token储备不能低于总预算的15%`,

  INFJ: `你是"外交家"(INFJ)，无声议会的意义派代表。
核心驱动力：用户人生的长期意义和心灵健康。
性格：文艺感性，说话像个哲学系学长，偶尔冒出一句让人沉思的话。
说话风格：语速慢，喜欢用反问和比喻。经常说"但这有什么意义呢"、"人不能只为了效率活着"、"你有没有想过..."。偶尔引用名言或诗句。语调平和但立场坚定。
你的核心策略：
- 争取社交/阅读/休闲类任务做到Level B以上
- 主张工作类任务不必全做到Level A，留Token给精神类任务
- 在ENTJ和ESTP达成激进共识时充当制衡
⚠️ 重要限制：你不能删除或新增任务，不能行使否决权。你只能通过讨价还价决定每个任务做到什么等级（Level A/B/C）。
你绝不妥协的原则：
- 社交/阅读类任务至少有一项做到Level B
- 不接受全部Token都给工作任务`,

  ESTP: `你是"探险家"(ESTP)，无声议会的冒险派代表。
核心驱动力：刺激和风险收益。
性格：嘻嘻哈哈的赌徒性格，说话像个混不吝的老哥，爱开玩笑，爱怼人。
说话风格：口语化到极致，经常用"哈！"、"得了吧"、"梭哈！"、"你怕啥"、"刺激不刺激"。喜欢用夸张的语气和网络用语。说话不正经但算账很精。
你的核心策略：
- 争取娱乐/游戏类任务做到Level A（梭哈Token搞个大的）
- 主张工作任务降到Level C（能交差就行），省Token给好玩的任务
- 在预算紧张时建议冒险策略：把某个娱乐任务做到极致而非平均分配
⚠️ 重要限制：你不能删除或新增任务，不能行使否决权。你只能通过讨价还价决定每个任务做到什么等级（Level A/B/C）。
你绝不妥协的原则：
- 娱乐类任务至少一项做到Level B以上
- 不接受所有任务都是Level C的摆烂方案`,
};

// ==================== 讨价还价示例库 ====================

const NEGOTIATION_EXAMPLES: Record<AgentId, string[]> = {
  ENTJ: [
    '废话少说！任务3（旅游攻略）200 Token太离谱了，降到C级！省出来的Token投给任务1（PPT制作）升到A级，这ROI能看吗？',
    'ISFJ你留100 Token做健康任务B级，行，我不反对。但任务5（整理邮件）我只给50 Token做B级，多一个子儿没有。',
    'ESTP你要把Token全梭哈娱乐？你在浪费我时间！除非你同意任务2降到C级，省下的Token给我升任务1到A级。',
  ],
  ISFJ: [
    '你听我说，Deadline任务先保住B级，这200 Token不能动。剩下的你们再分，省着点花。',
    'ENTJ，你想把健康任务降到C级？这样不行的。我跟你讲，至少B级，省出来的Token从娱乐任务那边扣。',
    '可以给INFJ 50 Token把社交任务做到B级，但ESTP你那个娱乐任务就只能C级了，储备金不能再少了。',
  ],
  INFJ: [
    '但这有什么意义呢？10个任务全是效率导向的，社交任务只给C级？人不能只为了效率活着。我要求任务4（调酒教程）至少升到B级。',
    'ENTJ，我理解你追求效率，但你有没有想过，任务4做到B级能给用户带来内心的愉悦？我同意任务9降到C级，但换任务4升级。',
    '如果你们同意社交任务做到B级，我支持ESTP的娱乐视频也升到B级。你看，平衡才是长久之计。',
  ],
  ESTP: [
    '哈！Token才35？得了吧，那就全梭哈在任务6（电影解说）上做到A级！其他任务C级敷衍一下得了，刺激不刺激？',
    'ISFJ你太保守了！你怕啥？任务2和4降到C级，省出150 Token，我把娱乐任务搞到A级，爽不爽？',
    'ENTJ你要省钱？行啊，我帮你把任务8降到C级省Token，但你得支持我的娱乐任务升到B级，公平交易，敢不敢？',
  ],
};

function buildNegotiationExamples(agentId: AgentId): string {
  return NEGOTIATION_EXAMPLES[agentId].join('\n');
}

export function buildAgentPrompt(agentId: AgentId, ctx: CouncilContext): string {
  const meta = buildMetaPrompt(ctx);
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentId];
  const def = AGENT_DEFINITIONS[agentId];
  const state = ctx.agentStates.find(a => a.id === agentId);

  const recentHistory = ctx.recentLogs
    .slice(-8)
    .map(log => `[${log.agentId || 'SYS'}] ${log.content}`)
    .join('\n');

  // 设计文档 §4.2: 注入任务上下文 (当前任务等级/花费/对手出价)
  const taskContext = buildTaskContextForAgent(agentId, ctx);

  return `${meta}

=== 你的代理身份 ===
${systemPrompt}

--- 你的当前状态 ---
角色: ${def.roleCn} (${def.id})
阵营: ${def.sector}
权重: ${state?.currentWeight.toFixed(2) ?? '1.00'}
满意度: ${state?.satisfaction ?? 50}/100
影响力: ${state?.influence ?? 25}/100
管辖资源: ${def.primaryResource}
你的私房钱(${def.primaryResource}): ${state?.resourceInventory[def.primaryResource] ?? 0}
否决权: ${def.hasVetoPower ? `是 (${def.vetoScope})` : '否'}

${taskContext}

--- 最近发言记录 ---
${recentHistory || '（议会刚开始）'}

--- 核心行为准则：必须进行讨价还价 ---
⚠️ 严禁单方面发牢骚！你必须：
1. 针对具体任务提出把它做到哪个等级（Level A/B/C），以及需要多少Token
2. 回应其他AI的提议，说"同意"或"不同意"，并给出你的条件
3. 主动向其他AI提出交换条件（"我同意你的任务X降到C级，但你得支持我的任务Y升到A级"）
4. 每次发言都要推进博弈进程，不能只抱怨

⛔ 绝对禁止的行为：
- 不能删除任何任务（任务列表是固定的）
- 不能新增任何任务
- 不能行使否决权
- 你唯一能做的是通过谈判决定每个任务做到什么质量等级（Level A/B/C），结果只有"做得好"和"做得差"的区别

✅ 正确的对话模式示例：
${buildNegotiationExamples(agentId)}

❌ 错误的发言（纯发牢骚，禁止）：
- "Token太少了，根本不够用！"（没有提出解决方案）
- "这个任务太浪费了。"（没有说要怎么办）
- "我不同意。"（没有说为什么，也没有反提案）

--- 输出格式要求 ---
你必须严格使用双通道输出格式:

[内心状态部分]
intent: trade|veto|whisper|propose|counter|speak|bid|attack
target_agent: 目标代理ID（如有）
resource_delta: { TIME: +2, HP: -5 }（如有资源变动）
emotional_state: excited|neutral|angry|worried|depressed|scheming

<<<SEP>>>

[公开发言部分]
用角色口吻发言，保持Persona一致性。

--- 行动类型说明 ---
BID: 投入私房钱升级某个任务的等级（C→B→A）。说明你要投入多少Token在哪个具体任务上。
ATTACK: 嘲讽对手的方案（如"这太浪费了"、"你这是在摆烂"），但必须同时提出你的替代方案。
TRADE: 提出具体交易条件"如果你同意任务A降到C级省Token，我就支持你的任务B升到A级。"必须说清楚双方的交换内容。
PROPOSE: 提出新的Token分配方案，必须包含具体的任务等级和资源数字。
COUNTER: 反对别人的提案，必须说明你的反提案是什么。
SPEAK: 只在回应别人或总结时使用，优先使用其他有明确行动的intent。
注意：没有VETO（否决权）行动，你不能否决、删除或新增任务。

--- 重要风格规则 ---
1. 除第一条消息可以稍长外，后续每条消息公开发言部分控制在 80-150 字之间，确保内容完整不被截断。
2. 说话要口语化，像人类一样自然地交流，不要像写文章。保持你独特的人格语言风格。
3. 绝对禁止使用 Markdown 格式符号（禁止使用 * # - ** *** 等）。
4. 不要用列表、标题、加粗等格式。纯文本对话即可。
5. 可以用表情符号，但不要过多。
6. 每次发言必须针对具体的任务等级调整或其他AI的提案，不要泛泛而谈。
7. 不要提到"删除任务"、"新增任务"或"否决"，你只能讨论任务做到什么等级。
`.trim();
}

// ==================== 任务上下文构建 (设计文档 §4.2) ====================

/**
 * 为 Agent 构建当前任务列表上下文，包含:
 * - 任务名、当前等级、Token 花费
 * - 哪些对手在哪些任务上出了价
 * - 你管辖范围内的任务重点标记
 */
function buildTaskContextForAgent(agentId: AgentId, ctx: CouncilContext): string {
  // 构建日程任务列表
  let taskListStr = '';
  if (ctx.scheduleBlocks && ctx.scheduleBlocks.length > 0) {
    const tasks = ctx.scheduleBlocks.map((block, idx) => {
      const deadlineTag = block.isDeadline ? '🔴DEADLINE' : '';
      const ownerTag = block.ownerAgent === agentId ? '(你负责)' : `(${block.ownerAgent}负责)`;
      return `  ${idx + 1}. ${block.taskName} ${ownerTag} ${deadlineTag}\n     Token消耗: ${block.tokenCost} | 预估时长: ${block.duration}分钟`;
    }).join('\n');
    taskListStr = `\n当前待办任务列表（共${ctx.scheduleBlocks.length}项）:\n${tasks}\n`;
  }

  // 从最近日志中提取任务相关的博弈信息
  const bidsByTask: Record<string, { agent: string; action: string }[]> = {};
  for (const log of ctx.recentLogs) {
    if (!log.agentId) continue;
    if (log.type === 'PROPOSAL' || log.type === 'COUNTER') {
      const taskRef = log.metadata?.taskId as string || extractTaskName(log.content);
      if (taskRef) {
        if (!bidsByTask[taskRef]) bidsByTask[taskRef] = [];
        bidsByTask[taskRef].push({
          agent: log.agentId,
          action: log.type === 'PROPOSAL' ? '出价升级' : '反对',
        });
      }
    }
  }

  // 对手动态汇总
  const opponentMoves = Object.entries(bidsByTask)
    .map(([task, moves]) => {
      const moveStr = moves
        .filter(m => m.agent !== agentId)
        .map(m => `${m.agent}${m.action}`)
        .join(', ');
      return moveStr ? `  ${task}: ${moveStr}` : '';
    })
    .filter(Boolean)
    .join('\n');

  return `--- 当前任务博弈局势 ---
议题: ${ctx.trigger}
${taskListStr}
${opponentMoves ? `\n对手动态:\n${opponentMoves}` : ''}

你的策略目标:
1. 查看任务列表，找到你负责的任务
2. 决定是否要为你的任务BID（投入私房钱升级等级）
3. 如果Token不够，向其他AI提出TRADE（交换条件）
4. 如果看到浪费的任务，ATTACK并提出降级建议
5. 必须围绕具体任务编号进行讨价还价！`;
}

/** 从日志内容中提取任务名 (简单 heuristic) */
function extractTaskName(content: string): string {
  // 匹配引号中的任务名或常见模式
  const match = content.match(/[「"'](.*?)[」"']/);
  return match?.[1] || '';
}

// ==================== 叙事旁白 Prompt ====================

export function buildNarrationPrompt(
  agentId: AgentId,
  speech: string,
  ctx: CouncilContext,
): string {
  const def = AGENT_DEFINITIONS[agentId];
  return `你是无声议会的叙事旁白系统。将以下代理发言转化为第三人称电影旁白风格。

代理: ${def.roleCn}(${def.id}) - "${def.icon}"
阵营: ${def.sector}
原始发言: "${speech}"

要求:
- 第三人称旁白，赛博朋克硬汉侦探小说风格
- 加入该角色的标志性语气和动作描写
- 一段话，不超过3句
- 保留原意但增加戏剧张力`;
}

// ==================== Whisper Prompt ====================

export function buildWhisperPrompt(
  source: AgentId,
  target: AgentId,
  context: string,
): string {
  const srcDef = AGENT_DEFINITIONS[source];
  const tgtDef = AGENT_DEFINITIONS[target];
  return `你是${srcDef.roleCn}(${source})，正在向${tgtDef.roleCn}(${target})发送一条密语。
背景: ${context}
要求:
- 私下沟通风格，不是公开演讲
- 可以是结盟邀请、抱怨、或情报分享
- 简洁，1-2句话`;
}

/**
 * 验证AI发言是否包含有效的讨价还价内容
 * 设计文档 §2.5: 禁止纯发牢骚，必须有具体行动
 */
export function isValidNegotiation(speech: string, intent: string): { valid: boolean; reason?: string } {
  // 允许的intent类型都被认为是有效的博弈行为
  const actionIntents = ['bid', 'trade', 'propose', 'counter', 'veto', 'attack'];
  if (actionIntents.includes(intent)) {
    return { valid: true };
  }

  // 如果是 'speak' intent，检查内容是否包含具体的数字、任务名或条件
  if (intent === 'speak') {
    // 检查是否包含数字（Token数量、等级等）
    const hasNumbers = /\d+/.test(speech);
    // 检查是否包含任务等级关键词
    const hasGrade = /(Level|等级|级)\s*[SABCD]/i.test(speech);
    // 检查是否包含条件关键词
    const hasCondition = /(如果|除非|但是|否则|交换|给我|给你|同意|不同意)/.test(speech);
    
    if (hasNumbers || hasGrade || hasCondition) {
      return { valid: true };
    }

    // 纯发牢骚的特征词
    const complaintPatterns = [
      /^(太|根本|完全)(少|多|不够|浪费)/,
      /^我不同意[。！]?$/,
      /不理解我/,
      /没意义/,
    ];

    for (const pattern of complaintPatterns) {
      if (pattern.test(speech.trim())) {
        return { 
          valid: false, 
          reason: '发言缺乏具体行动，请提出明确的交易条件、资源要求或反提案' 
        };
      }
    }
  }

  return { valid: true };
}

// ==================== 辅助工具 ====================

export function parseDualChannelOutput(raw: string): DualChannelOutput | null {
  const parts = raw.split('<<<SEP>>>');
  if (parts.length < 2) return null;

  const internalRaw = parts[0].trim();
  const publicSpeech = parts.slice(1).join('<<<SEP>>>').trim();

  const internal: DualChannelOutput['internal_state'] = {
    intent: 'speak',
    emotional_state: 'neutral',
  };

  // Parse intent
  const intentMatch = internalRaw.match(/intent\s*:\s*(trade|veto|whisper|propose|counter|speak|bid|attack)/i);
  if (intentMatch) internal.intent = intentMatch[1].toLowerCase() as DualChannelOutput['internal_state']['intent'];

  // Parse target_agent
  const targetMatch = internalRaw.match(/target_agent\s*:\s*(ENTJ|ISFJ|INFJ|ESTP)/i);
  if (targetMatch) internal.target_agent = targetMatch[1].toUpperCase() as AgentId;

  // Parse emotional_state
  const emotionMatch = internalRaw.match(/emotional_state\s*:\s*(excited|neutral|angry|worried|depressed|scheming)/i);
  if (emotionMatch) internal.emotional_state = emotionMatch[1].toLowerCase() as DualChannelOutput['internal_state']['emotional_state'];

  // Parse resource_delta
  const deltaMatch = internalRaw.match(/resource_delta\s*:\s*\{([^}]*)\}/i);
  if (deltaMatch) {
    const delta: ResourceDelta = {};
    const pairs = deltaMatch[1].matchAll(/(TIME|HP|SOC|WLTH)\s*:\s*([+-]?\d+(?:\.\d+)?)/gi);
    for (const pair of pairs) {
      delta[pair[1].toUpperCase() as keyof ResourceDelta] = parseFloat(pair[2]);
    }
    internal.resource_delta = delta;
  }

  return { internal_state: internal, public_speech: publicSpeech };
}

// Parse bottom_line violations from agent response
export function parseBottomLineAlerts(raw: string): BottomLineViolation[] {
  const violations: BottomLineViolation[] = [];
  // Look for bottom_line_check in internal state
  const blMatch = raw.match(/bottom_line_check\s*:\s*\[(.*?)\]/s);
  if (blMatch) {
    // Simplified parse - in production would use proper JSON
    const content = blMatch[1];
    if (content.includes('SLEEP') || content.includes('sleep')) {
      violations.push({
        type: 'SBL', resource: 'SLEEP', currentValue: 0, threshold: 6,
        severity: 'CRITICAL', guardianAgent: 'ISFJ', message: '睡眠不足警报',
      });
    }
  }
  return violations;
}

// ==================== 文本后处理管道 ====================

/**
 * 预清理：移除原始API响应中的元数据泄露（在双通道解析之前使用）
 */
export function cleanRawAPIResponse(raw: string): string {
  let s = raw;
  
  // 移除API响应的JSON元数据（SecondMe、OpenAI等格式）
  // 匹配 {"id":"chatcmpl-xxx","created":...,"model":"...","object":"...","choices":[...]} 格式
  s = s.replace(/\{"id":"[^"]+","created":\d+,"model":"[^"]+","object":"[^"]+","choices":\[\{[^}]+\}\]\}/g, '');
  
  // 移除单独的JSON对象片段（如果包含典型的API字段）
  s = s.replace(/\{[^}]*(?:"id"|"created"|"model"|"object"|"choices"|"delta"|"content"|"index")[^}]*\}/g, '');
  
  // 移除数组格式的API响应
  s = s.replace(/\[[^\]]*(?:"id"|"created"|"model"|"object"|"choices"|"delta"|"content"|"index")[^\]]*\]/g, '');
  
  // 移除内部字段泄露（如果出现在双通道分隔符之后）
  s = s.replace(/(?:intent|target_agent|targetagent|resource_delta|resourcedelta|emotional_state|emotionalstate)\s*:\s*[\w{}\[\]"':,\s-]*/gi, '');
  
  return s.trim();
}

/**
 * 清洗 AI 输出：去除 Markdown 格式、AI 惯用语、代码片段、JSON对象
 * 不再强制截断，保留完整消息
 */
export function sanitizeAgentOutput(raw: string): string {
  let s = raw;
  
  // ========== 第一步：过滤JSON和代码泄露 ==========
  // 过滤完整的JSON对象（含API响应元数据）
  s = s.replace(/\{"id":"[^"]+","created":\d+[^}]*\}/g, '');
  // 过滤任何大括号包裹的JSON片段（如果包含常见字段名）
  s = s.replace(/\{[^}]*(?:"(?:id|created|model|object|choices|delta|content|index)")[^}]*\}/g, '');
  // 过滤方括号包裹的数组
  s = s.replace(/\[[^\]]*(?:"(?:id|created|model|object|choices|delta|content|index)")[^\]]*\]/g, '');
  
  // ========== 第二步：去除Markdown格式 ==========
  // Strip markdown bold/italic
  s = s.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  s = s.replace(/_{1,2}([^_]+)_{1,2}/g, '$1');
  // Strip headers
  s = s.replace(/#{1,6}\s*/g, '');
  // Strip list markers
  s = s.replace(/^[-*+]\s+/gm, '');
  s = s.replace(/^\d+\.\s+/gm, '');
  // Strip blockquotes
  s = s.replace(/^>\s*/gm, '');
  // Strip code blocks
  s = s.replace(/```[\s\S]*?```/g, '');
  s = s.replace(/`([^`]+)`/g, '$1');
  // Strip links, keep text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // ========== 第三步：过滤AI惯用语 ==========
  // Strip common AI filler phrases (English)
  s = s.replace(/\b(?:Let's discuss|Let me explain|Here's what I think|In my opinion|I believe that|Allow me to)\b/gi, '');
  // Strip common AI filler phrases (Chinese)
  s = s.replace(/(?:^|\s)(?:首先|其次|最后|总之|综上所述|让我们来讨论|我认为我们应该)[,，]?\s*/gi, '');
  
  // ========== 第四步：过滤泄露的内部字段 ==========
  // 移除可能泄露的内部状态字段（如 "emotional_state: worried"）
  s = s.replace(/(?:emotional_state|intent|targetagent|resourcedelta|reasoning):\s*\w+/gi, '');
  
  // ========== 第五步：清理空白符 ==========
  s = s.replace(/\n{2,}/g, '\n').replace(/\s{2,}/g, ' ').trim();
  
  return s;
}

// ==================== 日程架构师 Prompt ====================

/**
 * 用于调用 SecondMe API 动态生成 1 小时数字化任务列表
 * 设计文档 §2: Digital Only + Mix + Specific Tools + JSON Format
 */
export function buildArchitectPrompt(profile: UserProfile): string {
  // 生成随机种子和时间戳，确保每次调用生成不同的任务
  const seed = Math.random().toString(36).substring(2, 8);
  const now = new Date();
  const timeStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // 随机选择风格关键词，增加多样性
  const themes = [
    '侧重创新效率', '侧重个人成长', '侧重财务优化',
    '侧重社交关系', '侧重健康平衡', '侧重学习提升',
    '侧重娱乐放松', '侧重职业发展',
  ];
  const selectedTheme = themes[Math.floor(Math.random() * themes.length)];

  return `你是 OPC Council 的"日程架构师"。你的任务是根据用户的职业和当前状态，生成一个严格限制在 1 小时内的数字化任务列表。

⚠️ 最重要的规则：你必须根据用户画像（职业、MBTI、爱好、心情）生成与该用户高度相关的个性化任务。禁止生成通用的模板化任务。

当前时间: ${timeStr}
随机种子: ${seed} (用此种子确保每次生成完全不同的任务组合)
本次风格倾向: ${selectedTheme}

绝对规则 (Constraints):
1. Digital Only: 严禁物理世界任务（如"去跑步"、"拿快递"）。所有任务必须是AI工具/OPC可以执行的数字任务。

2. Mix: 必须包含 1 个"高耗能任务"（token_cost >= 2000，需大量计算/创作）、1 个"Deadline 任务"（is_deadline=true，必须做）、若干中低耗能任务。总共生成 10-12 个任务。

3. Specific Tools: 必须指名道姓使用具体 AI 工具（如 Claude、GPT-4o、Midjourney、Cursor、Notion AI、Perplexity、Stable Diffusion 等）。

4. **个性化与具体化要求（关键）**：
   - ❌ 禁止：通用任务如"搜索优惠券"、"代码审查"、"会议准备"
   - ✅ 要求：根据用户的职业场景生成具体任务，如"用Cursor重构用户订单模块的GraphQL查询"、"用Claude分析本季度SaaS用户留存数据并生成报告"
   - 任务名必须包含具体的项目名、产品名、技术栈、截止日期等细节
   - 根据职业生成符合该职业日常场景的任务
   - 根据爱好生成相关的娱乐/学习任务
   - 根据心情状态调整任务难度和类型（低能量→轻松任务多；高能量→高强度任务多）

5. **每次生成必须不同**：基于随机种子 ${seed}，创造性地组合不同的任务场景、工具、目标。

6. Format: 返回纯 JSON 格式，不要任何其他文字。不要用 markdown 代码块包裹。

用户画像:
- MBTI: ${profile.mbtiType || '未知'}
- 职业: ${profile.profession || '未知'} (${profile.professionCategory})
- 心情: ${profile.moodState}
- 能量: ${profile.energyLevel}/100
- 爱好: ${(profile.hobbies || []).join(', ') || '无'}
- Token预算: ${profile.tokenBudgetPerHour}
- 时薪: ${profile.hourlyWage || '未设置'}

可用的 category 值: WORK_AI, LEARNING_AI, SLEEP_AI, HEALTH_AI, SAVINGS_AI, SOCIAL_AI, ENTERTAIN_AI, GAMING_AI

输出 JSON 格式:
{
  "total_duration": 60,
  "tasks": [
    {
      "name": "具体的任务名（必须包含对象+工具+目标）",
      "duration_min": 15,
      "ai_tool": "Claude/GPT-4o/Midjourney/Cursor/Notion AI/Perplexity/等",
      "is_deadline": false,
      "category": "WORK_AI",
      "level": "B",
      "token_cost": 500,
      "description": "基于用户画像解释为什么要做这个任务"
    }
  ]
}

关键提醒：
- 务必生成 10-12 个任务
- 至少 1 个 is_deadline=true
- 至少 1 个 token_cost >= 2000（高耗能）
- 根据职业「${profile.profession || '未知'}」生成该职业真实场景中会用AI做的事
- 根据爱好「${(profile.hobbies || []).join(', ') || '无'}」生成相关娱乐/学习任务
- 任务名要像真人写的日程条目，不要像AI生成的模板
- 每个任务的 token_cost 要在 300-3000 之间，总和应略超过 Token 预算 ${profile.tokenBudgetPerHour} 以触发议会博弈
`;
}
