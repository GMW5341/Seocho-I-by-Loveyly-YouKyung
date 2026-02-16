import type { TabType } from '../../types';

const tabs: { id: TabType; label: string; icon: string }[] = [
  { id: 'curriculum', label: '커리큘럼', icon: '📚' },
  { id: 'dashboard', label: '대시보드', icon: '📊' },
  { id: 'schedule', label: '스케줄', icon: '📅' },
  { id: 'students', label: '원생 관리', icon: '👨‍🎨' },
  { id: 'attendance', label: '출결 관리', icon: '✅' },
  { id: 'payments', label: '결제 관리', icon: '💳' },
  { id: 'trial', label: '체험 수업', icon: '🌟' },
  { id: 'messages', label: '메시지 양식', icon: '💬' },
  { id: 'special', label: '특강 수업', icon: '🎨' },
  { id: 'settings', label: '설정', icon: '⚙️' },
];

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="w-60 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <div className="p-5 border-b border-gray-200 flex flex-col items-center">
        <img
          src="/logo.png"
          alt="서초아이미술"
          className="w-28 h-28 rounded-full object-cover mb-2"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <h1 className="text-xl font-bold text-indigo-700">서초아이미술</h1>
        <p className="text-xs text-gray-500 mt-1">통합 운영 시스템</p>
      </div>
      <nav className="flex-1 p-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition-colors mb-1 ${
              activeTab === tab.id
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-200 text-xs text-gray-400 text-center">
        v1.1.0
      </div>
    </aside>
  );
}
