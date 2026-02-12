'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  route: string;
}

interface Shade {
  title: string;
  content: string;
}

interface SoftMemory {
  content: string;
  createdAt: string;
}

export default function UserProfile() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [shades, setShades] = useState<Shade[]>([]);
  const [softMemories, setSoftMemories] = useState<SoftMemory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      // 获取用户基本信息
      const infoRes = await fetch('/api/user/info');
      const infoResult = await infoRes.json();
      if (infoResult.code === 0) {
        setUserInfo(infoResult.data);
      }

      // 获取兴趣标签
      const shadesRes = await fetch('/api/user/shades');
      const shadesResult = await shadesRes.json();
      if (shadesResult.code === 0) {
        setShades(shadesResult.data.shades || []);
      }

      // 获取软记忆
      const memoryRes = await fetch('/api/user/softmemory');
      const memoryResult = await memoryRes.json();
      if (memoryResult.code === 0) {
        setSoftMemories(memoryResult.data.list || []);
      }
    } catch (error) {
      console.error('加载用户数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!userInfo) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-500">未找到用户信息</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* 用户基本信息 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-4">
          {userInfo.avatarUrl && (
            <Image
              src={userInfo.avatarUrl}
              alt={userInfo.name}
              width={80}
              height={80}
              className="rounded-full"
            />
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{userInfo.name}</h2>
            <p className="text-gray-600">{userInfo.email}</p>
            {userInfo.route && (
              <p className="text-sm text-gray-500">@{userInfo.route}</p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>

      {/* 兴趣标签 */}
      {shades.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">兴趣标签</h3>
          <div className="space-y-3">
            {shades.map((shade, index) => (
              <div key={index} className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-1">{shade.title}</h4>
                <p className="text-sm text-gray-600">{shade.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 软记忆 */}
      {softMemories.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">软记忆</h3>
          <div className="space-y-3">
            {softMemories.map((memory, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-700">{memory.content}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(memory.createdAt).toLocaleDateString('zh-CN')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
