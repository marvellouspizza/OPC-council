/**
 * Silent Council - 议会日志流组件
 * 实时显示议会博弈过程的"剧本"式日志
 */

'use client';

import React, { useRef, useEffect } from 'react';
import { useCouncilStore } from '@/store/council';

/** 代理信息映射 (4大阵营) */
const AGENT_INFO: Record<string, { icon: string; roleCn: string; color: string }> = {
  ENTJ: { icon: '⚡', roleCn: '分析家', color: '#3B82F6' },
  ISFJ: { icon: '🛡️', roleCn: '守护者', color: '#10B981' },
  INFJ: { icon: '🔮', roleCn: '外交家', color: '#A855F7' },
  ESTP: { icon: '🎲', roleCn: '探险家', color: '#F59E0B' },
};

interface CouncilLog {
  id: string;
  agentId: string | null;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/** 日志类型样式 */
const LOG_TYPE_STYLES: Record<string, { badge: string; bgColor: string }> = {
  SYSTEM: { badge: '🖥️ 系统', bgColor: 'bg-gray-800/50' },
  SPEECH: { badge: '💬 发言', bgColor: 'bg-blue-900/30' },
  PROPOSAL: { badge: '📜 提案', bgColor: 'bg-purple-900/30' },
  COUNTER: { badge: '🔄 反驳', bgColor: 'bg-orange-900/30' },
  VETO: { badge: '🚫 否决', bgColor: 'bg-red-900/30' },
  CONSENSUS: { badge: '✅ 共识', bgColor: 'bg-green-900/30' },
  NARRATION: { badge: '📖 叙事', bgColor: 'bg-indigo-900/30' },
  WHISPER: { badge: '🤫 私聊', bgColor: 'bg-pink-900/30' },
  BOTTOM_LINE_ALERT: { badge: '🚨 底线', bgColor: 'bg-red-900/40' },
};

export default function CouncilLogStream() {
  const { logs, isRunning } = useCouncilStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/80 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200">📜 议会记录</h3>
          {isRunning && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              议会进行中
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">{logs.length} 条记录</span>
      </div>

      {/* 日志列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <div className="text-center space-y-2">
              <div className="text-3xl">🏛️</div>
              <p>议会尚未召开</p>
              <p className="text-xs text-gray-600">提交议题后，代理们将开始博弈</p>
            </div>
          </div>
        ) : (
          logs.map((log, index) => {
            const agent = log.agentId ? AGENT_INFO[log.agentId] : null;
            const typeStyle = LOG_TYPE_STYLES[log.type] || LOG_TYPE_STYLES.SYSTEM;
            const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={log.id || index}
                className={`rounded-lg p-3 ${typeStyle.bgColor} border border-gray-800/50 animate-fadeIn`}
              >
                {/* 头部信息 */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {agent ? (
                      <span className="flex items-center gap-1">
                        <span className="text-base">{agent.icon}</span>
                        <span
                          className="text-xs font-bold"
                          style={{ color: agent.color }}
                        >
                          {log.agentId}
                        </span>
                        <span className="text-xs text-gray-400">
                          {agent.roleCn}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {typeStyle.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono">
                    {time}
                  </span>
                </div>

                {/* 日志内容 */}
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {log.content}
                </p>

                {/* 资源变化（如果有） */}
                {(() => {
                  const delta = log.metadata?.resource_delta;
                  if (!delta || typeof delta !== 'object') return null;
                  const entries = Object.entries(delta as Record<string, number | string>);
                  if (entries.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entries.map(([key, val]) => {
                        const valStr = String(val);
                        const isPositive =
                          typeof val === 'number' ? val > 0 : valStr.startsWith('+');
                        return (
                          <span
                            key={key}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isPositive
                                ? 'bg-green-900/50 text-green-300'
                                : 'bg-red-900/50 text-red-300'
                            }`}
                          >
                            {key}: {typeof val === 'number' && val > 0 ? '+' : ''}
                            {valStr}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}

        {/* 加载指示器 */}
        {isRunning && (
          <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
            <div className="flex gap-1">
              <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>代理正在讨论中...</span>
          </div>
        )}
      </div>
    </div>
  );
}
