import { cookies } from 'next/headers';
import LoginButton from '@/components/LoginButton';
import CouncilDashboard from '@/components/CouncilDashboard';

export default async function Home() {
  const cookieStore = await cookies();
  const isLoggedIn = !!cookieStore.get('user_id')?.value;

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080818]">
        <div className="text-center space-y-8 p-8">
          <div className="space-y-4">
            {/* 核心球动画 */}
            <div className="relative mx-auto w-32 h-32 mb-8">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 opacity-30 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 opacity-50 animate-pulse" />
              <div className="absolute inset-6 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 flex items-center justify-center">
                <span className="text-4xl">🏛️</span>
              </div>
            </div>

            <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              OPC Council
            </h1>
            <p className="text-lg text-gray-400 max-w-lg mx-auto">
              基于多智能体博弈与 SecondMe 身份映射的生活优化生态系统
            </p>
            <p className="text-sm text-gray-600 max-w-md mx-auto">
              4位阵营代理组成的议会，代表效率、健康、精神、探索维度，在你设定的人生模板下自动博弈出最优方案
            </p>
          </div>
          
          <div className="space-y-4">
            <LoginButton />
            <p className="text-sm text-gray-600">
              通过 SecondMe 登录，让议会读取你的深层记忆
            </p>
          </div>

          {/* 代理预览 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto mt-12">
            {[
              { icon: '⚡', name: 'ENTJ 效率之神', desc: 'ROI最大化', color: 'border-blue-500/30' },
              { icon: '🛡️', name: 'ISFJ 健康官', desc: '生理安全守护', color: 'border-emerald-500/30' },
              { icon: '🔮', name: 'INFJ 精神导师', desc: '一票否决权', color: 'border-purple-500/30' },
              { icon: '🎲', name: 'ESTP 赌徒', desc: '风险收益博弈', color: 'border-amber-500/30' },
            ].map((agent) => (
              <div key={agent.name} className={`p-4 bg-gray-900/60 rounded-xl border ${agent.color}`}>
                <div className="text-2xl mb-2">{agent.icon}</div>
                <h3 className="text-sm font-semibold text-gray-200">{agent.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{agent.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <CouncilDashboard />;
}
