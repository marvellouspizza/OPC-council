/**
 * 议会历史记录组件
 * 显示已完成和已取消的议会记录
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useCouncilStore } from '@/store/council';

export default function CouncilHistory() {
  const { historicalSessions, fetchHistory, loadHistoricalSession } = useCouncilStore();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleViewSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    loadHistoricalSession(sessionId);
  };

  const selectedSession = historicalSessions.find(s => s.id === selectedSessionId);

  return (
    <div className="space-y-4">
      <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          📚 历史议会记录
        </h2>

        {historicalSessions.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            暂无历史记录
          </div>
        ) : (
          <div className="space-y-3">
            {historicalSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleViewSession(session.id)}
                className={`bg-gray-800/50 rounded-lg p-4 cursor-pointer transition-all hover:bg-gray-800 border ${
                  selectedSessionId === session.id
                    ? 'border-blue-500'
                    : 'border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        session.status === 'COMPLETED'
                          ? 'bg-green-900/50 text-green-300'
                          : 'bg-orange-900/50 text-orange-300'
                      }`}>
                        {session.status === 'COMPLETED' ? '✓ 已完成' : '✕ 已取消'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(session.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 line-clamp-2">
                      {session.trigger || '无议题描述'}
                    </p>
                    {session.resultCard && (
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                        <span>评级: {session.resultCard.grade}</span>
                        <span>Token: {session.resultCard.tokenSpent}</span>
                        <span>任务数: {session.resultCard.tasks.length}</span>
                      </div>
                    )}
                  </div>
                  <button
                    className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    查看详情 →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 详细信息面板 */}
      {selectedSession && (
        <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">议会详情</h3>
            <button
              onClick={() => setSelectedSessionId(null)}
              className="text-gray-400 hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          {/* 基本信息 */}
          <div className="mb-4 p-4 bg-gray-800/30 rounded-lg">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">创建时间:</span>
                <span className="ml-2 text-gray-300">
                  {new Date(selectedSession.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
              <div>
                <span className="text-gray-500">完成时间:</span>
                <span className="ml-2 text-gray-300">
                  {selectedSession.completedAt
                    ? new Date(selectedSession.completedAt).toLocaleString('zh-CN')
                    : '-'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">议题:</span>
                <p className="mt-1 text-gray-300">{selectedSession.trigger}</p>
              </div>
            </div>
          </div>

          {/* 结算报告 */}
          {selectedSession.resultCard && (
            <div className="mb-4 p-4 bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-lg border border-purple-700/30">
              <h4 className="font-semibold text-white mb-3">📊 议会结算</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-gray-500">评级</div>
                  <div className="text-xl font-bold text-yellow-400">
                    {selectedSession.resultCard.grade}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Token消耗</div>
                  <div className="text-lg font-semibold text-red-400">
                    -{selectedSession.resultCard.tokenSpent}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Token剩余</div>
                  <div className="text-lg font-semibold text-green-400">
                    {selectedSession.resultCard.tokenRemaining}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">完成任务</div>
                  <div className="text-lg font-semibold text-blue-400">
                    {selectedSession.resultCard.tasks.length}
                  </div>
                </div>
              </div>
              
              {selectedSession.resultCard.narrativeSummary && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-xs text-gray-400">
                    {selectedSession.resultCard.narrativeSummary}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 议会日志 */}
          <div>
            <h4 className="font-semibold text-white mb-2">📝 议会日志</h4>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {selectedSession.logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-gray-800/30 rounded text-sm"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {log.agentId && (
                      <span className="text-xs font-medium text-blue-400">
                        {log.agentId}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{log.type}</span>
                    <span className="text-xs text-gray-600">
                      {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                    </span>
                  </div>
                  <p className="text-gray-300">{log.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
