/**
 * Silent Council - 用户画像设置组件 v4 (Token 4维分配)
 * 职业选择、MBTI输入、Rc系数、心情、爱好、Token预算 + 4维分配
 * 新增：一键随机生成画像
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useCouncilStore } from '@/store/council';

/** MBTI 16型选项 */
const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const;

/** 职业刚性预设 */
const PROFESSION_PRESETS: { label: string; category: 'high' | 'mid' | 'low'; rc: number; examples: string }[] = [
  { label: '高刚性', category: 'high', rc: 0.85, examples: '医生、律师、金融' },
  { label: '中等弹性', category: 'mid', rc: 0.5, examples: '教师、工程师、设计师' },
  { label: '低刚性', category: 'low', rc: 0.2, examples: '自由职业、创业者、艺术家' },
];

/** 心情状态选项 */
const MOOD_OPTIONS = [
  { value: 'sprint', label: '🚀 冲刺', desc: '高能量+积极：允许突破软底线', color: 'text-orange-400' },
  { value: 'flow', label: '🌊 心流', desc: '中等能量+积极：锁定大块连续时间', color: 'text-blue-400' },
  { value: 'survival', label: '🛟 生存', desc: '低能量+消极：触发休眠协议', color: 'text-gray-400' },
  { value: 'anxiety', label: '⚡ 焦虑', desc: '高能量+消极：拆解为微小颗粒', color: 'text-yellow-400' },
] as const;

/** Token 预算预设 */
const TOKEN_PRESETS = [
  { value: 5000, label: '🪙 节俭', desc: '5k/h' },
  { value: 10000, label: '🪙 标准', desc: '10k/h' },
  { value: 20000, label: '🪙 豪华', desc: '20k/h' },
];

/** 爱好选项池 */
const HOBBY_POOL = [
  '游戏', '阅读', '健身', '音乐', '烹饪', '摄影', '旅行',
  '编程', '绘画', '瑜伽', '电影', '棋类', '露营', '钓鱼',
  '跑步', '写作', '手工', '追剧', '学语言', '投资理财',
];

export default function UserProfileSetup({ onNavigateToSchedule }: { onNavigateToSchedule?: () => void }) {
  const {
    userProfile, setUserProfile,
    tokenAllocation, setTokenAllocation,
    randomizeProfile,
  } = useCouncilStore();

  const [profession, setProfession] = useState(userProfile.profession || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [hobbyInput, setHobbyInput] = useState('');
  const [showSchedulePrompt, setShowSchedulePrompt] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/user/profile');
      if (res.ok) {
        const data = await res.json();
        if (data.code === 0 && data.data) {
          setUserProfile(data.data.userProfile);
          if (data.data.tokenAllocation) setTokenAllocation(data.data.tokenAllocation);
          setProfession(data.data.userProfile.profession || '');
        }
      }
    } catch {
      // 使用默认值
    }
  };

  const saveProfile = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfile: { ...userProfile, profession },
          tokenAllocation,
        }),
      });
      if (res.ok) {
        setSaveMessage('✅ 已保存');
        setShowSchedulePrompt(true);
        setTimeout(() => setSaveMessage(''), 2000);
      } else {
        setSaveMessage('❌ 保存失败');
      }
    } catch {
      setSaveMessage('❌ 网络错误');
    } finally {
      setIsSaving(false);
    }
  }, [userProfile, tokenAllocation, profession, setUserProfile]);

  const addHobby = useCallback(() => {
    const h = hobbyInput.trim();
    if (h && !(userProfile.hobbies || []).includes(h)) {
      setUserProfile({ hobbies: [...(userProfile.hobbies || []), h] });
      setHobbyInput('');
    }
  }, [hobbyInput, userProfile.hobbies, setUserProfile]);

  const removeHobby = useCallback((hobby: string) => {
    setUserProfile({ hobbies: (userProfile.hobbies || []).filter(h => h !== hobby) });
  }, [userProfile.hobbies, setUserProfile]);

  return (
    <div className="space-y-10">
      {/* 顶部居中区域：标题 + 按钮 + 说明文字 */}
      <div className="flex flex-col items-center space-y-8">
        <h2 className="text-4xl font-bold text-gray-100 flex items-center gap-4">
          🎭 用户画像设置
        </h2>
        
        {/* 说明性文字 */}
        <div className="max-w-4xl text-center space-y-3">
          <p className="text-gray-300 text-lg leading-relaxed">
            让 AI 代理们替你做决策 —— 三个不同立场的 AI 将针对你的日程进行激烈博弈,
          </p>
          <p className="text-gray-400 text-base leading-relaxed">
            在算力预算内争夺任务优先级,最终为你交付最优化的一小时执行方案
          </p>
        </div>

        {/* 大按钮区域 */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => {
              randomizeProfile();
              setProfession(useCouncilStore.getState().userProfile.profession || '');
            }}
            className="px-10 py-4 bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-bold rounded-xl hover:from-amber-700 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            🎲 随机生成
          </button>
          <button
            onClick={saveProfile}
            disabled={isSaving}
            className="px-10 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-lg font-bold rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
          >
            {isSaving ? '保存中...' : '💾 保存'}
          </button>
        </div>

        {/* 保存提示消息 */}
        {saveMessage && (
          <span className="text-base text-gray-400 animate-pulse">{saveMessage}</span>
        )}

        {/* 分隔线 */}
        <div className="w-full max-w-5xl border-t border-gray-800"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左列：基础信息 */}
        <div className="space-y-4">
          {/* MBTI 选择 */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-3">
            <label className="text-sm font-medium text-gray-300">你的 MBTI 类型</label>
            <p className="text-xs text-gray-500">你的MBTI类型，影响 J/P 排程风格</p>
            <div className="grid grid-cols-4 gap-1.5">
              {MBTI_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setUserProfile({ mbtiType: type })}
                  className={`text-xs px-2 py-1.5 rounded-md font-mono transition-all ${
                    userProfile.mbtiType === type
                      ? 'bg-purple-600 text-white ring-1 ring-purple-400'
                      : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            {userProfile.mbtiType && (
              <p className="text-xs text-purple-400">
                {userProfile.mbtiType.endsWith('J') ? '📐 J型→结构化日程' : '🎲 P型→弹性日程'}
              </p>
            )}
          </div>

          {/* 职业与 Rc 系数 */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-3">
            <label className="text-sm font-medium text-gray-300">职业信息</label>
            <input
              type="text"
              value={profession}
              onChange={(e) => {
                setProfession(e.target.value);
                setUserProfile({ profession: e.target.value });
              }}
              placeholder="你的职业..."
              className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
            <label className="text-xs text-gray-400 block">职业刚性等级（Rc 系数）</label>
            <div className="flex gap-2">
              {PROFESSION_PRESETS.map((preset) => (
                <button
                  key={preset.category}
                  onClick={() => setUserProfile({
                    professionCategory: preset.category,
                    rigidityCoefficient: preset.rc,
                  })}
                  className={`flex-1 text-xs px-2 py-2 rounded-lg border transition-all ${
                    userProfile.professionCategory === preset.category
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-200'
                      : 'bg-gray-800/40 border-gray-700/30 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{preset.examples}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Rc =</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={userProfile.rigidityCoefficient}
                onChange={(e) => setUserProfile({
                  rigidityCoefficient: parseFloat(e.target.value),
                  professionCategory: parseFloat(e.target.value) >= 0.7 ? 'high'
                    : parseFloat(e.target.value) <= 0.3 ? 'low' : 'mid',
                })}
                className="flex-1"
              />
              <span className="text-xs text-gray-200 font-mono w-8">{userProfile.rigidityCoefficient.toFixed(2)}</span>
            </div>
          </div>

          {/* 爱好标签 */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-3">
            <label className="text-sm font-medium text-gray-300">🎯 兴趣爱好</label>
            <p className="text-xs text-gray-500">影响娱乐/游戏/学习AI任务的生成权重</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(userProfile.hobbies || []).map((hobby) => (
                <span
                  key={hobby}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-900/30 border border-amber-800/40 text-amber-300 rounded-full text-xs cursor-pointer hover:bg-red-900/30 hover:text-red-300 hover:border-red-800/40 transition-colors"
                  onClick={() => removeHobby(hobby)}
                  title="点击移除"
                >
                  {hobby} ×
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={hobbyInput}
                onChange={(e) => setHobbyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addHobby()}
                placeholder="输入爱好..."
                className="flex-1 px-2 py-1 bg-gray-800/80 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
              <button
                onClick={addHobby}
                className="px-2 py-1 bg-amber-800/50 text-amber-300 text-xs rounded hover:bg-amber-700/50"
              >
                添加
              </button>
            </div>
            {/* 快速选择 */}
            <div className="flex flex-wrap gap-1">
              {HOBBY_POOL.filter(h => !(userProfile.hobbies || []).includes(h)).slice(0, 10).map(h => (
                <button
                  key={h}
                  onClick={() => setUserProfile({ hobbies: [...(userProfile.hobbies || []), h] })}
                  className="text-[10px] px-1.5 py-0.5 bg-gray-800/40 text-gray-500 rounded hover:text-gray-200 hover:bg-gray-700/40"
                >
                  + {h}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右列：心情 & Token & 底线 */}
        <div className="space-y-4">
          {/* 心情状态 */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-3">
            <label className="text-sm font-medium text-gray-300">当前心情状态</label>
            <div className="space-y-1.5">
              {MOOD_OPTIONS.map((mood) => (
                <button
                  key={mood.value}
                  onClick={() => setUserProfile({ moodState: mood.value })}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-all ${
                    userProfile.moodState === mood.value
                      ? 'bg-purple-600/20 border-purple-500/50'
                      : 'bg-gray-800/40 border-gray-700/30 hover:border-gray-600/50'
                  }`}
                >
                  <span className={mood.color}>{mood.label}</span>
                  <span className="text-gray-500 ml-2">{mood.desc}</span>
                </button>
              ))}
            </div>

            {/* 心情分数 */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400">心情:</span>
              <input
                type="range"
                min="1"
                max="10"
                value={userProfile.moodScore || 5}
                onChange={(e) => setUserProfile({ moodScore: parseInt(e.target.value) })}
                className="flex-1"
              />
              <span className="text-xs text-gray-200 font-mono w-6">{userProfile.moodScore || 5}</span>
            </div>

            {/* 能量水平 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">能量:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={userProfile.energyLevel}
                onChange={(e) => setUserProfile({ energyLevel: parseInt(e.target.value) })}
                className="flex-1"
              />
              <span className="text-xs text-gray-200 font-mono w-8">{userProfile.energyLevel}%</span>
            </div>
          </div>

          {/* Token 预算 */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-3">
            <label className="text-sm font-medium text-gray-300">
              🪙 Token 预算
              <span className="text-[10px] text-gray-500 ml-2">每小时 Token 额度</span>
            </label>
            <div className="flex gap-2">
              {TOKEN_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setUserProfile({ tokenBudgetPerHour: preset.value })}
                  className={`flex-1 text-xs px-2 py-2 rounded-lg border transition-all ${
                    (userProfile.tokenBudgetPerHour || 10000) === preset.value
                      ? 'bg-amber-600/20 border-amber-500/50 text-amber-200'
                      : 'bg-gray-800/40 border-gray-700/30 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{preset.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">自定义:</span>
              <input
                type="number"
                min="1000"
                max="100000"
                step="1000"
                value={userProfile.tokenBudgetPerHour || 10000}
                onChange={(e) => setUserProfile({ tokenBudgetPerHour: parseInt(e.target.value) || 10000 })}
                className="w-24 px-2 py-1 bg-gray-800/80 border border-gray-700 rounded text-sm text-gray-200 text-center"
              />
              <span className="text-xs text-gray-500">tokens/h</span>
            </div>
            <p className="text-[10px] text-gray-600">
              预算越低 → 代理间 Token 争夺越激烈 → 议会博弈越精彩
            </p>
          </div>

          {/* Token 四维分配 */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-3">
            <label className="text-sm font-medium text-gray-300">
              🎯 Token 四维分配
              <span className="text-[10px] text-gray-500 ml-2">决定4位代理的资源权重</span>
            </label>
            <p className="text-[10px] text-gray-600 mb-2">
              总和自动归一化 · 系统地板: 效率≥5 / 健康≥10 / 关系≥5 / 风险≥5
            </p>
            {([
              { key: 'efficiency' as const, label: '⚡ 效率', agent: 'ENTJ·效率之神', color: 'text-red-400', floor: 5 },
              { key: 'health' as const, label: '💚 健康', agent: 'ISFJ·健康官', color: 'text-green-400', floor: 10 },
              { key: 'relationship' as const, label: '💜 关系', agent: 'INFJ·精神导师', color: 'text-purple-400', floor: 5 },
              { key: 'risk' as const, label: '🎲 风险', agent: 'ESTP·赌徒', color: 'text-amber-400', floor: 5 },
            ]).map(dim => (
              <div key={dim.key} className="flex items-center gap-2">
                <span className={`text-xs w-16 ${dim.color}`}>{dim.label}</span>
                <input
                  type="range"
                  min={dim.floor}
                  max="60"
                  value={tokenAllocation[dim.key]}
                  onChange={(e) => setTokenAllocation({ [dim.key]: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-gray-200 font-mono w-8">{tokenAllocation[dim.key]}%</span>
                <span className="text-[10px] text-gray-600 w-20 truncate">{dim.agent}</span>
              </div>
            ))}
            <div className="text-[10px] text-gray-500 border-t border-gray-800 pt-2 mt-2">
              当前合计: {tokenAllocation.efficiency + tokenAllocation.health + tokenAllocation.relationship + tokenAllocation.risk}%
              {' '}· 系统会自动按比例分配Token预算给4位代理
            </div>
          </div>
        </div>
      </div>

      {/* 保存后弹出：是否立即生成日程 */}
      {showSchedulePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm mx-4 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white text-center">✅ 画像已保存</h3>
            <p className="text-sm text-gray-400 text-center">
              是否立即跳转到日程生成页面？
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setShowSchedulePrompt(false);
                }}
                className="px-5 py-2 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition-all"
              >
                稍后再说
              </button>
              <button
                onClick={() => {
                  setShowSchedulePrompt(false);
                  onNavigateToSchedule?.();
                }}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
              >
                📅 立即生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
