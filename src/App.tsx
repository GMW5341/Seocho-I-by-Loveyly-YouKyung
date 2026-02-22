import { useState, useCallback, useEffect, useRef } from 'react';
import { StoreProvider, useAppStore } from './store/StoreContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import CurriculumPage from './components/curriculum/CurriculumPage';
import Dashboard from './components/dashboard/Dashboard';
import ScheduleGrid from './components/schedule/ScheduleGrid';
import StudentList from './components/students/StudentList';
import AttendanceManager from './components/attendance/AttendanceManager';
import PaymentManager from './components/payments/PaymentManager';
import TrialManager from './components/trial/TrialManager';
import MessageTemplates from './components/messages/MessageTemplates';
import SpecialClassManager from './components/special/SpecialClassManager';
import RevenueOverview from './components/revenue/RevenueOverview';
import SettingsPage from './components/settings/SettingsPage';
import {
  isSyncEnabled, fetchCloudData, pushToCloud, checkUrlForSyncConfig,
  saveSyncConfig, saveSyncRoom, setSyncEnabled,
} from './services/firebaseSync';

// ============================================================
// Amusement Park Interactive Loading Screen
// ============================================================
const BALLOON_COLORS = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4', '#FF9FF3', '#F8B500', '#6C5CE7'];
const EMOJI_ITEMS = ['🎡', '🎢', '🎠', '🎪', '🎨', '🖌️', '🌈', '⭐', '🎵', '🎶', '🦋', '🌸'];

function AmusementParkLoader({ status }: { status: string }) {
  const [sparkles, setSparkles] = useState<Array<{ id: number; x: number; y: number; emoji: string }>>([]);
  const [balloons, setBalloons] = useState<Array<{ id: number; x: number; color: string }>>([]);
  const sparkleIdRef = useRef(0);
  const balloonIdRef = useRef(0);

  // Click/tap → sparkle burst
  const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const newSparkles = Array.from({ length: 5 }, () => ({
      id: sparkleIdRef.current++,
      x: x + (Math.random() - 0.5) * 60,
      y: y + (Math.random() - 0.5) * 60,
      emoji: EMOJI_ITEMS[Math.floor(Math.random() * EMOJI_ITEMS.length)],
    }));
    setSparkles(prev => [...prev, ...newSparkles]);
    setTimeout(() => {
      setSparkles(prev => prev.filter(s => !newSparkles.find(ns => ns.id === s.id)));
    }, 700);
  }, []);

  // Auto-release balloons
  useEffect(() => {
    const interval = setInterval(() => {
      const newBalloon = {
        id: balloonIdRef.current++,
        x: 10 + Math.random() * 80,
        color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
      };
      setBalloons(prev => [...prev.slice(-6), newBalloon]);
      setTimeout(() => {
        setBalloons(prev => prev.filter(b => b.id !== newBalloon.id));
      }, 4200);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="park-loader fixed inset-0 flex flex-col items-center justify-center min-h-screen z-[9999]"
      onClick={handleClick}
    >
      {/* Sun */}
      <div className="absolute top-6 right-8 md:top-10 md:right-16">
        <div className="relative">
          <div className="sun-rays absolute -inset-6 opacity-30">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 w-1 bg-yellow-300 rounded-full"
                style={{
                  height: 28,
                  transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-22px)`,
                }}
              />
            ))}
          </div>
          <div className="w-14 h-14 rounded-full bg-yellow-300 shadow-lg shadow-yellow-300/50 flex items-center justify-center text-2xl">
            😊
          </div>
        </div>
      </div>

      {/* Clouds */}
      <div className="cloud cloud-1" />
      <div className="cloud cloud-2" />
      <div className="cloud cloud-3" />

      {/* Balloons */}
      {balloons.map(b => (
        <div
          key={b.id}
          className="balloon"
          style={{ left: `${b.x}%`, bottom: 0 }}
        >
          <svg width="32" height="48" viewBox="0 0 32 48">
            <ellipse cx="16" cy="16" rx="12" ry="16" fill={b.color} opacity="0.85" />
            <ellipse cx="16" cy="16" rx="12" ry="16" fill="white" opacity="0.2" />
            <ellipse cx="12" cy="10" rx="3" ry="5" fill="white" opacity="0.3" transform="rotate(-20 12 10)" />
            <path d="M16 32 L16 48" stroke={b.color} strokeWidth="1" opacity="0.6" />
            <polygon points="14,32 18,32 16,35" fill={b.color} opacity="0.7" />
          </svg>
        </div>
      ))}

      {/* Sparkle effects on click */}
      {sparkles.map(s => (
        <div key={s.id} className="sparkle text-2xl" style={{ left: s.x, top: s.y }}>
          {s.emoji}
        </div>
      ))}

      {/* Central content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-4">
        {/* Ferris Wheel SVG */}
        <div className="relative w-32 h-32 md:w-40 md:h-40">
          <svg viewBox="0 0 120 120" className="w-full h-full">
            {/* Center hub */}
            <circle cx="60" cy="55" r="4" fill="#6366f1" />
            {/* Support legs */}
            <line x1="60" y1="55" x2="40" y2="95" stroke="#8B7355" strokeWidth="3" strokeLinecap="round" />
            <line x1="60" y1="55" x2="80" y2="95" stroke="#8B7355" strokeWidth="3" strokeLinecap="round" />
            <line x1="35" y1="95" x2="85" y2="95" stroke="#8B7355" strokeWidth="4" strokeLinecap="round" />
            {/* Rotating wheel */}
            <g className="ferris-wheel" style={{ transformOrigin: '60px 55px' }}>
              <circle cx="60" cy="55" r="32" fill="none" stroke="#6366f1" strokeWidth="2.5" />
              {/* Spokes + gondolas */}
              {Array.from({ length: 6 }).map((_, i) => {
                const angle = (i * 60 - 90) * (Math.PI / 180);
                const x = 60 + 32 * Math.cos(angle);
                const y = 55 + 32 * Math.sin(angle);
                const colors = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4', '#FF9FF3'];
                return (
                  <g key={i}>
                    <line x1="60" y1="55" x2={x} y2={y} stroke="#6366f1" strokeWidth="1" opacity="0.5" />
                    <rect x={x - 5} y={y - 2} width="10" height="8" rx="2" fill={colors[i]} stroke={colors[i]} strokeWidth="0.5" />
                    <rect x={x - 5} y={y - 2} width="10" height="3" rx="1" fill="white" opacity="0.3" />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Title */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="bounce-1 text-3xl">🎨</span>
            <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-md" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
              서초아이미술
            </h1>
            <span className="bounce-2 text-3xl">🖌️</span>
          </div>
          <p className="text-white/80 text-sm drop-shadow-sm">
            {status || '놀이동산 준비 중...'}
          </p>
        </div>

        {/* Loading bar */}
        <div className="w-64 md:w-80">
          <div className="h-3 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm shadow-inner">
            <div className="loading-bar-fill h-full rounded-full" />
          </div>
          <p className="text-center text-white/60 text-xs mt-2 drop-shadow-sm">화면을 터치하면 불꽃놀이가 터져요!</p>
        </div>

        {/* Bouncing characters */}
        <div className="flex gap-5 mt-2">
          <span className="bounce-1 text-4xl drop-shadow-md cursor-pointer hover:scale-125 transition-transform">🎡</span>
          <span className="bounce-2 text-4xl drop-shadow-md cursor-pointer hover:scale-125 transition-transform">🎢</span>
          <span className="bounce-3 text-4xl drop-shadow-md cursor-pointer hover:scale-125 transition-transform">🎠</span>
          <span className="bounce-1 text-4xl drop-shadow-md cursor-pointer hover:scale-125 transition-transform" style={{ animationDelay: '0.9s' }}>🎪</span>
        </div>
      </div>

      {/* Ground decorations */}
      <div className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none">
        {/* Grass */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-green-700 to-transparent opacity-30" />
        {/* Fence */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="w-1 h-5 bg-amber-800/40 rounded-t" />
              <div className="flag-wave text-base" style={{ animationDelay: `${i * 0.15}s` }}>
                {['🚩', '🏁', '🎌', '🚩'][i % 4]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TAB_TITLES: Record<string, string> = {
  curriculum: '커리큘럼',
  dashboard: '대시보드',
  schedule: '스케줄 관리',
  students: '원생 관리',
  attendance: '출결 관리',
  payments: '결제 관리',
  trial: '체험 수업',
  messages: '메시지 양식',
  special: '특강 수업',
  revenue: '매출 현황',
  settings: '설정',
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return isMobile;
}

function AppContent() {
  const { activeTab, setActiveTab } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleTabChange = useCallback((tab: Parameters<typeof setActiveTab>[0]) => {
    setActiveTab(tab);
    if (isMobile) setSidebarOpen(false);
  }, [setActiveTab, isMobile]);

  const renderContent = () => {
    switch (activeTab) {
      case 'curriculum': return <CurriculumPage />;
      case 'dashboard': return <Dashboard />;
      case 'schedule': return <ScheduleGrid />;
      case 'students': return <StudentList />;
      case 'attendance': return <AttendanceManager />;
      case 'payments': return <PaymentManager />;
      case 'trial': return <TrialManager />;
      case 'messages': return <MessageTemplates />;
      case 'special': return <SpecialClassManager />;
      case 'revenue': return <RevenueOverview />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen relative">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {isMobile ? (
        <div className={`sidebar-mobile ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
      ) : (
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={TAB_TITLES[activeTab] || '서초아이미술'}
          onMenuToggle={isMobile ? () => setSidebarOpen(prev => !prev) : undefined}
        />
        <main className="flex-1 bg-gray-50 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

/**
 * CloudDataLoader: Loads cloud data BEFORE React state initializes.
 * This eliminates the race condition where empty local data overwrites cloud data.
 */
function CloudDataLoader() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        // 1. Check URL for shared sync config (e.g., from mobile link)
        const urlSync = checkUrlForSyncConfig();
        if (urlSync) {
          saveSyncConfig(urlSync.config);
          saveSyncRoom(urlSync.room);
          setSyncEnabled(true);
          history.replaceState(null, '', window.location.pathname);
        }

        // 2. If sync is enabled, try to load cloud data
        if (isSyncEnabled()) {
          const justImported = localStorage.getItem('seocho_just_imported');
          if (justImported) {
            if (!cancelled) setStatus('가져온 데이터 업로드 중...');
            localStorage.removeItem('seocho_just_imported');
            const ok = await pushToCloud();
            if (!ok) console.warn('Push after import failed, continuing with local data');
          } else {
            if (!cancelled) setStatus('클라우드 데이터 확인 중...');
            await fetchCloudData();
          }
        }
      } catch (e) {
        console.error('Cloud sync error, proceeding with local data:', e);
      }

      // Always proceed to render, regardless of sync result
      if (!cancelled) setReady(true);
    }

    // Timeout: if cloud takes too long (3s), proceed with local data
    const timeout = setTimeout(() => {
      if (!cancelled && !ready) {
        console.warn('Cloud load timed out, using local data');
        setReady(true);
      }
    }, 3000);

    loadData().finally(() => clearTimeout(timeout));

    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return <AmusementParkLoader status={status} />;
  }

  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}

export default function App() {
  return <CloudDataLoader />;
}
