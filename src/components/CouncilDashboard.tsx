/**
 * Silent Council - 议会主页面（登录后显示）
 * 画像设置、日程生成、会议室、历史记录
 */

'use client';

import React, { useState, useEffect } from 'react';
import CouncilPanel from './CouncilPanel';
import CouncilLogStream from './CouncilLogStream';
import UserProfileSetup from './UserProfileSetup';
import ScheduleView from './ScheduleView';
import CouncilHistory from './CouncilHistory';
import { useCouncilStore } from '@/store/council';

type TabId = 'council' | 'schedule' | 'profile-setup' | 'history';

export default function CouncilDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('profile-setup');
  const { activeAlerts, fetchActiveSession } = useCouncilStore();

  // 页面加载时尝试恢复活跃会话
  useEffect(() => {
    fetchActiveSession();
  }, []);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'profile-setup', label: '画像设置', icon: '🎭' },
    { id: 'schedule', label: '日程生成', icon: '📅' },
    { id: 'council', label: '会议室', icon: '🏛️' },
    { id: 'history', label: '历史记录', icon: '📚' },
  ];

  return (
    <div className="min-h-screen bg-[#080818] text-white">
      {/* 顶部导航 */}
      <nav className="bg-gray-900/90 backdrop-blur-md border-b border-gray-800 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
                OPC Council
              </h1>
              <span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">
                v0.2
              </span>
            </div>

            {/* Tab 切换 */}
            <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-gray-700 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span className="mr-1.5">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 状态指示 */}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>🔗 SecondMe 已连接</span>
              <a
                href="/api/auth/logout"
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                退出
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'council' && (
          <div className="space-y-6">
            {/* 底线告警横幅 */}
            {activeAlerts.length > 0 && (
              <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-3 space-y-1">
                {activeAlerts.slice(-3).map((alert, i) => (
                  <p key={i} className="text-xs text-red-300">{alert}</p>
                ))}
              </div>
            )}

            {/* 议题输入 + 博弈日志 */}
            <div className="space-y-4">
              <CouncilPanel />
              <div className="h-[600px]">
                <CouncilLogStream />
              </div>
            </div>

          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="max-w-5xl mx-auto">
            <ScheduleView />
          </div>
        )}

        {activeTab === 'profile-setup' && (
          <div className="max-w-5xl mx-auto">
            <UserProfileSetup onNavigateToSchedule={() => setActiveTab('schedule')} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="max-w-5xl mx-auto">
            <CouncilHistory />
          </div>
        )}
      </main>
    </div>
  );
}
