/**
 * Silent Council - 议会控制面板
 * 启动议会博弈
 */

'use client';

import React, { useState } from 'react';
import { useCouncilStore } from '@/store/council';



export default function CouncilPanel() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { startCouncil, cancelCouncil, isRunning } = useCouncilStore();

  const handleSubmit = async () => {
    if (isRunning || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const confirmRes = await fetch('/api/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      const confirmData = await confirmRes.json();

      await fetch('/api/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'to-council' }),
      });

      const councilTrigger = confirmData.councilTrigger || '请根据当前日程进行议会博弈';
      await startCouncil(councilTrigger);
    } catch (err) {
      console.error('提交议会失败:', err);
      await startCouncil('请根据当前日程进行议会博弈');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!isRunning) return;
    if (confirm('确定要终止当前议会吗？')) {
      await cancelCouncil();
    }
  };

  return (
    <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-4">
      {/* 提交议会博弈按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={isRunning || isSubmitting}
          className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              议会讨论中...
            </span>
          ) : isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              提交中...
            </span>
          ) : (
            '⚡ 提交议会博弈'
          )}
        </button>

        {isRunning && (
          <button
            onClick={handleCancel}
            className="px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-all"
          >
            ✕ 终止
          </button>
        )}
      </div>
    </div>
  );
}
