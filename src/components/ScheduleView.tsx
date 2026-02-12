/**
 * Silent Council - OPC 数字日程视图 (Token 驱动)
 * 可视化 AI 数字任务日程：Token预算条、模型等级、Deadline标记、降级操作
 */

'use client';


import React, { useState, useCallback, useEffect } from 'react';
import { useCouncilStore } from '@/store/council';

// ==================== 类型 ====================

interface ScheduleBlock {
  id: string;
  timeStart: string;
  timeEnd: string;
  duration: number;
  category: string;
  taskName: string;
  taskId: string;
  tokenCost: number;
  modelTier: string;
  originalTokenCost?: number;
  isDeadline: boolean;
  deadlineTime?: string;
  isLocked: boolean;
  executionStatus: string;
  apiLog?: string;
  ownerAgent: string;
  generationNote?: string;
  userNote?: string;
}

interface TokenBudget {
  totalBudget: number;
  hourlyBudget: number;
  spent: number;
  reserved: number;
  available: number;
  deficitAllowed: boolean;
  deficitPenalty: number;
}

interface ScheduleStats {
  totalTokensUsed: number;
  totalTokensBudget: number;
  tokenUtilization: number;
  deadlineTokensReserved: number;
  taskCount: number;
  deadlineTaskCount: number;
  categoryBreakdown: Record<string, number>;
  modelTierBreakdown: Record<string, number>;
  tokenDeficit: number;
  overBudgetPercent: number;
}

interface DaySchedule {
  scheduleId: string;
  date: string;
  blocks: ScheduleBlock[];
  tokenBudget: TokenBudget;
  status: 'DRAFT' | 'EDITED' | 'CONFIRMED' | 'IN_COUNCIL';
  stats: ScheduleStats;
  schedulingStyle: 'J' | 'P';
  generationParams?: {
    templateId?: string;
    moodState: string;
    energyLevel: number;
  };
}

// ==================== 常量 ====================

const CATEGORY_COLORS: Record<string, string> = {
  SLEEP_AI: '#1E3A5F',
  WORK_AI: '#3B82F6',
  ENTERTAIN_AI: '#FBBF24',
  SOCIAL_AI: '#EC4899',
  SAVINGS_AI: '#10B981',
  GAMING_AI: '#8B5CF6',
  HEALTH_AI: '#14B8A6',
  LEARNING_AI: '#6366F1',
  SYSTEM: '#6B7280',
};

const CATEGORY_ICONS: Record<string, string> = {
  SLEEP_AI: '🌙',
  WORK_AI: '📊',
  ENTERTAIN_AI: '🎵',
  SOCIAL_AI: '💬',
  SAVINGS_AI: '💰',
  GAMING_AI: '🎮',
  HEALTH_AI: '❤️',
  LEARNING_AI: '📚',
  SYSTEM: '⚙️',
};

const CATEGORY_LABELS: Record<string, string> = {
  SLEEP_AI: '睡眠AI',
  WORK_AI: '工作AI',
  ENTERTAIN_AI: '娱乐AI',
  SOCIAL_AI: '社交AI',
  SAVINGS_AI: '理财AI',
  GAMING_AI: '游戏AI',
  HEALTH_AI: '健康AI',
  LEARNING_AI: '学习AI',
  SYSTEM: '系统',
};

const MODEL_TIER_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  'gpt-4o': { label: 'GPT-4o', color: '#22C55E', icon: '🟢' },
  'gpt-4o-mini': { label: '4o-mini', color: '#F59E0B', icon: '🟡' },
  'rule-based': { label: '规则', color: '#6B7280', icon: '⚪' },
};

// ==================== 主组件 ====================

export default function ScheduleView() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);

  const { 
    userProfile, 
    tokenAllocation, 
    currentSchedule,
    setSchedule,
    fetchSchedule,
  } = useCouncilStore();

  // 组件挂载时加载已有的日程
  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // 生成日程（始终通过 AI 动态生成，accessToken 由服务端 session 获取）
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfile,
          tokenAllocation,
          date: new Date().toISOString().split('T')[0],
          hobbies: userProfile.hobbies,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSchedule(data.schedule);
        console.log('✨ AI 动态生成日程成功');
      } else {
        setGenerateError(data.error || '日程生成失败');
      }
    } catch (err) {
      console.error('生成日程失败:', err);
      setGenerateError('网络错误，请重试');
    } finally {
      setIsGenerating(false);
    }
  }, [tokenAllocation, userProfile, setSchedule]);

  // 锁定/解锁
  const handleToggleLock = useCallback(async (blockId: string) => {
    const res = await fetch('/api/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lock', blockId }),
    });
    const data = await res.json();
    if (data.success) setSchedule(data.schedule);
  }, [setSchedule]);

  // 删除任务
  const handleDeleteBlock = useCallback(async (blockId: string) => {
    const res = await fetch('/api/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', blockId }),
    });
    const data = await res.json();
    if (data.success) setSchedule(data.schedule);
    else if (data.error) alert(data.error);
  }, [setSchedule]);

  // 模型降级
  const handleDowngrade = useCallback(async (blockId: string, targetTier: string) => {
    const res = await fetch('/api/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'downgrade', blockId, targetTier }),
    });
    const data = await res.json();
    if (data.success) setSchedule(data.schedule);
  }, [setSchedule]);

  // 更新任务名称
  const handleUpdateTaskName = useCallback(async (blockId: string, newTaskName: string) => {
    const res = await fetch('/api/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'edit', blockId, updates: { taskName: newTaskName } }),
    });
    const data = await res.json();
    if (data.success) setSchedule(data.schedule);
  }, [setSchedule]);

  // 确认并召开议会
  // (moved to CouncilDashboard)

  // ==================== 空状态 ====================
  if (!currentSchedule) {
    return (
      <div className="space-y-8">
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-12 text-center space-y-8">
          <div className="space-y-5">
            <div className="text-8xl">🪙</div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-purple-400 bg-clip-text text-transparent">
              OPC 数字任务调度引擎
            </h2>
            <p className="text-base text-gray-400 max-w-2xl mx-auto">
              Token 驱动的 AI 数字孪生调度。每个 AI 任务消耗 Token，由 4 位阵营代理在议会中博弈决定分配方案。
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <Tag icon="🎭" label={userProfile.mbtiType || '未设MBTI'} />
            <Tag icon="📋" label={`1小时日程`} />
            <Tag icon="🪙" label={`预算: ${(userProfile.tokenBudgetPerHour || 10000).toLocaleString()} tokens/h`} />
            <Tag icon="📐" label={`Rc=${userProfile.rigidityCoefficient.toFixed(2)}`} />
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-12 py-4 text-lg bg-gradient-to-r from-amber-600 to-purple-600 text-white font-semibold rounded-xl hover:from-amber-700 hover:to-purple-700 transition-all disabled:opacity-50 shadow-lg shadow-amber-600/20"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <Spinner /> AI 正在根据画像生成任务...
              </span>
            ) : (
              '🤖 AI 生成个性化任务日程'
            )}
          </button>

          {generateError && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-4 py-2">
              ⚠️ {generateError}
            </p>
          )}
        </div>
      </div>
    );
  }

  const schedule = currentSchedule; // 兼容后续代码

  // ==================== 日程视图 ====================
  return (
    <div className="space-y-4">
      {/* Token 预算概览 */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">🪙 {schedule.date}</h2>
            <StatusBadge status={schedule.status} />
            <span className="text-xs bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full text-gray-300">
              {schedule.schedulingStyle === 'J' ? '📐 J型·预计算' : '🎲 P型·按需'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSchedule(null); // 清除旧日程，显示生成中状态
                handleGenerate();
              }}
              disabled={isGenerating || schedule.status === 'IN_COUNCIL'}
              className="text-xs px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <span className="flex items-center gap-1.5">
                  <Spinner /> 重新生成中...
                </span>
              ) : (
                '🔄 重新生成'
              )}
            </button>
          </div>
        </div>

        {/* Token 预算进度条 */}
        <TokenBudgetBar budget={schedule.tokenBudget} stats={schedule.stats} />

        {/* 统计行 */}
        <TokenStatsRow stats={schedule.stats} />
      </div>

      {/* 任务列表 */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">🤖 AI 任务列表</h3>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span>🔒 锁定</span>
            <span>🔽 降级</span>
            <span>🗑️ 删除</span>
          </div>
        </div>

        <div className="divide-y divide-gray-800/50">
          {schedule.blocks.map((block: ScheduleBlock) => (
            <TaskBlockRow
              key={block.id}
              block={block}
              isExpanded={expandedBlock === block.id}
              onToggleExpand={() => setExpandedBlock(expandedBlock === block.id ? null : block.id)}
              onToggleLock={() => handleToggleLock(block.id)}
              onDelete={() => handleDeleteBlock(block.id)}
              onDowngrade={(tier) => handleDowngrade(block.id, tier)}
              onUpdateTaskName={(newName) => handleUpdateTaskName(block.id, newName)}
              readOnly={schedule.status === 'IN_COUNCIL'}
            />
          ))}
        </div>
      </div>

      {/* 模型等级分布 - 已隐藏 */}
      {/* <ModelTierBreakdown stats={schedule.stats} /> */}

      {/* 议会审议中提示 */}
      {schedule.status === 'IN_COUNCIL' && (
        <div className="bg-purple-900/20 border border-purple-800/30 rounded-xl p-4 text-center space-y-2">
          <p className="text-sm text-purple-300 font-medium">🏛️ Token 分配方案已提交议会博弈</p>
          <p className="text-xs text-gray-400">
            4 位阵营代理正在就 Token 预算分配方案进行协商。超预算部分将通过降级或裁减解决。
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== Token 预算条 ====================

function TokenBudgetBar({ budget, stats }: { budget: TokenBudget; stats: ScheduleStats }) {
  const utilPercent = Math.min(stats.tokenUtilization, 150);
  const isOver = stats.overBudgetPercent > 0;
  const deadlinePercent = (stats.deadlineTokensReserved / budget.totalBudget) * 100;

  return (
    <div className="space-y-1.5 mb-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">
          Token 预算: <span className="text-amber-400 font-mono">{stats.totalTokensUsed.toLocaleString()}</span>
          <span className="text-gray-600"> / </span>
          <span className="text-gray-300 font-mono">{budget.totalBudget.toLocaleString()}</span>
        </span>
        <span className={`font-medium ${isOver ? 'text-red-400' : 'text-green-400'}`}>
          {isOver ? `⚠️ 超额 ${stats.overBudgetPercent}%` : `✅ ${stats.tokenUtilization}%`}
        </span>
      </div>

      {/* 进度条 */}
      <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
        {/* Deadline 预留（深色底色） */}
        <div
          className="absolute inset-y-0 left-0 bg-red-900/50 rounded-l-full"
          style={{ width: `${Math.min(deadlinePercent, 100)}%` }}
        />
        {/* 已用量 */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${
            isOver
              ? 'bg-gradient-to-r from-amber-500 to-red-500'
              : 'bg-gradient-to-r from-green-500 to-amber-500'
          }`}
          style={{ width: `${Math.min(utilPercent, 100)}%` }}
        />
        {/* 100%线 */}
        <div className="absolute inset-y-0 left-[100%] w-px bg-white/20" style={{ left: `${Math.min(100, (100 / Math.max(utilPercent, 100)) * 100)}%` }} />
      </div>

      {/* 赤字警告 */}
      {stats.tokenDeficit > 0 && (
        <p className="text-[10px] text-red-400">
          💸 Token 赤字: {stats.tokenDeficit.toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ==================== 统计行 ====================

function TokenStatsRow({ stats }: { stats: ScheduleStats }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Stat icon="🤖" label="任务" value={`${stats.taskCount}`} color="#6366F1" />
      <Stat icon="⏰" label="Deadline" value={`${stats.deadlineTaskCount}`} color="#EF4444" />
      <Stat icon="🪙" label="Token" value={stats.totalTokensUsed.toLocaleString()} color="#F59E0B" />
      {/* 分类最高消耗 */}
      {Object.entries(stats.categoryBreakdown)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, tokens]) => (
          <Stat
            key={cat}
            icon={CATEGORY_ICONS[cat] || '📌'}
            label={CATEGORY_LABELS[cat] || cat}
            value={tokens.toLocaleString()}
            color={CATEGORY_COLORS[cat] || '#6B7280'}
          />
        ))}
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span>{icon}</span>
      <span className="text-gray-500">{label}</span>
      <span className="font-medium" style={{ color }}>{value}</span>
    </div>
  );
}

// ==================== 任务行 ====================

interface TaskBlockRowProps {
  block: ScheduleBlock;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onDowngrade: (tier: string) => void;
  onUpdateTaskName: (newName: string) => void;
  readOnly: boolean;
}

function TaskBlockRow({
  block,
  isExpanded,
  onToggleExpand,
  onToggleLock,
  onDelete,
  onDowngrade,
  onUpdateTaskName,
  readOnly,
}: TaskBlockRowProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editingName, setEditingName] = React.useState(block.taskName);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 同步 block.taskName 的变化
  React.useEffect(() => {
    setEditingName(block.taskName);
  }, [block.taskName]);

  // 自动聚焦输入框
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!readOnly) {
      e.stopPropagation();
      setIsEditing(true);
    }
  };

  const handleBlur = () => {
    if (editingName.trim() && editingName !== block.taskName) {
      onUpdateTaskName(editingName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingName.trim() && editingName !== block.taskName) {
        onUpdateTaskName(editingName.trim());
      }
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      setEditingName(block.taskName);
      setIsEditing(false);
    }
  };

  const color = CATEGORY_COLORS[block.category] || '#6B7280';
  const icon = CATEGORY_ICONS[block.category] || '📌';
  const catLabel = CATEGORY_LABELS[block.category] || block.category;
  const tierInfo = MODEL_TIER_LABELS[block.modelTier] || MODEL_TIER_LABELS['rule-based'];
  const isDowngraded = !!block.originalTokenCost;

  return (
    <div
      className={`group transition-all ${
        block.isDeadline ? 'bg-red-950/15' : ''
      } ${block.isLocked ? 'bg-blue-950/10' : ''}`}
    >
      {/* 主行 */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-800/30"
        onClick={onToggleExpand}
      >
        {/* 时间 */}
        <div className="flex-shrink-0 w-[100px] text-xs font-mono text-gray-400">
          {block.timeStart}
          <span className="text-gray-600"> — </span>
          {block.timeEnd}
        </div>

        {/* 颜色条 */}
        <div
          className="flex-shrink-0 w-1 h-8 rounded-full"
          style={{ backgroundColor: color }}
        />

        {/* 图标 */}
        <span className="flex-shrink-0 text-sm">{icon}</span>

        {/* 任务名 */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-gray-200 bg-gray-800 border border-blue-500 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <span
              className="text-sm text-gray-200 truncate block cursor-text hover:text-blue-400 transition-colors"
              onDoubleClick={handleDoubleClick}
              title={readOnly ? block.taskName : "双击编辑任务名称"}
            >
              {block.taskName}
              {block.isDeadline && <span className="ml-1.5 text-red-400 text-[10px]">⏰ DEADLINE</span>}
            </span>
          )}
          <span className="text-[10px] text-gray-500 flex items-center gap-2">
            <span>📍 {block.ownerAgent}</span>
          </span>
        </div>

        {/* 模型等级 */}
        <span
          className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border"
          style={{
            color: tierInfo.color,
            borderColor: tierInfo.color + '44',
            backgroundColor: tierInfo.color + '10',
          }}
        >
          {tierInfo.icon} {tierInfo.label}
        </span>

        {/* Token 消耗 - 显示基础成本 */}
        <div className="flex-shrink-0 text-right w-20">
          <span className="text-xs font-mono text-gray-300">
            🪙 {(block.originalTokenCost || block.tokenCost).toLocaleString()}
          </span>
        </div>

        {/* 操作 */}
        {!readOnly && (
          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
              className={`p-1 rounded text-xs ${
                block.isLocked ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
              }`}
              title={block.isLocked ? '解锁' : '锁定'}
            >
              {block.isLocked ? '🔒' : '🔓'}
            </button>
            {!block.isDeadline && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1 rounded text-xs text-gray-500 hover:text-red-400"
                title="删除"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>

      {/* 展开详情 */}
      {isExpanded && (
        <div className="px-4 pb-3 ml-[116px] space-y-2">
          {/* 生成注解 */}
          {block.generationNote && (
            <p className="text-[10px] text-gray-500 italic">
              💡 {block.generationNote}
            </p>
          )}

          {/* 降级选项 */}
          {!readOnly && block.modelTier !== 'rule-based' && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-500">降级模型:</span>
              {block.modelTier !== 'gpt-4o-mini' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDowngrade('gpt-4o-mini'); }}
                  className="px-2 py-0.5 bg-yellow-900/20 border border-yellow-800/30 text-yellow-300 rounded hover:bg-yellow-900/40"
                >
                  🟡 4o-mini (省90%)
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDowngrade('rule-based'); }}
                className="px-2 py-0.5 bg-gray-800/50 border border-gray-700/30 text-gray-400 rounded hover:bg-gray-700/50"
              >
                ⚪ 规则引擎 (省99%)
              </button>
            </div>
          )}

          {/* Deadline 标记 */}
          {block.isDeadline && (
            <div className="text-[10px] bg-red-900/20 border border-red-800/30 rounded-lg p-2 text-red-300">
              ⏰ Deadline 任务（{block.deadlineTime}前完成）：不可删除，仅可降级模型以节省 Token。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== 模型等级分布 ====================

function ModelTierBreakdown({ stats }: { stats: ScheduleStats }) {
  const tiers = [
    { key: 'gpt-4o', label: 'GPT-4o (旗舰)', color: '#22C55E', icon: '🟢' },
    { key: 'gpt-4o-mini', label: 'GPT-4o-mini (轻量)', color: '#F59E0B', icon: '🟡' },
    { key: 'rule-based', label: '规则引擎 (零消耗)', color: '#6B7280', icon: '⚪' },
  ];

  const total = Object.values(stats.modelTierBreakdown).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-200 mb-3">🤖 模型等级分布</h3>
      <div className="space-y-2">
        {tiers.map(tier => {
          const tokens = stats.modelTierBreakdown[tier.key] || 0;
          const percent = Math.round((tokens / total) * 100);
          return (
            <div key={tier.key} className="flex items-center gap-3">
              <span className="text-xs w-6">{tier.icon}</span>
              <span className="text-xs text-gray-400 w-32">{tier.label}</span>
              <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${percent}%`, backgroundColor: tier.color }}
                />
              </div>
              <span className="text-xs font-mono text-gray-300 w-20 text-right">
                {tokens.toLocaleString()} ({percent}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 通用子组件 ====================

function Tag({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800/60 border border-gray-700/50 rounded-full text-gray-300">
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    DRAFT: { label: '初稿', className: 'bg-gray-700 text-gray-300' },
    EDITED: { label: '已编辑', className: 'bg-yellow-900/50 text-yellow-300' },
    CONFIRMED: { label: '已确认', className: 'bg-green-900/50 text-green-300' },
    IN_COUNCIL: { label: '议会博弈中', className: 'bg-purple-900/50 text-purple-300' },
  };
  const c = config[status] || config.DRAFT;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.className}`}>
      {c.label}
    </span>
  );
}
