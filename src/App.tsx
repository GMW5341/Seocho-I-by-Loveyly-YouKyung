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
// 3D Amusement Park Interactive Loading Screen (Time-Aware)
// ============================================================
const BALLOON_COLORS = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4', '#FF9FF3', '#F8B500', '#6C5CE7'];
const EMOJI_ITEMS = ['🎡', '🎢', '🎠', '🎪', '🎨', '🖌️', '🌈', '⭐', '🎵', '🎶', '🦋', '🌸'];
const FLOAT_ITEMS = ['🎨', '🖌️', '🌈', '⭐', '🎵', '🦋', '🌸', '✨', '💫', '🎭'];

type TimeTheme = 'morning' | 'afternoon' | 'sunset' | 'night';

function getTimeTheme(): TimeTheme {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'sunset';
  return 'night';
}

const TIME_THEME_CONFIG: Record<TimeTheme, {
  bg: string;
  sunEmoji: string;
  sunGradient: string;
  showStars: boolean;
  showMoon: boolean;
  cloudOpacity: number;
  groundColors: [string, string, string];
  greeting: string;
}> = {
  morning: {
    bg: 'linear-gradient(180deg, #87CEEB 0%, #B0E0FF 25%, #E0F0FF 50%, #FFECD2 75%, #FCB69F 100%)',
    sunEmoji: '🌅',
    sunGradient: 'from-orange-200 via-yellow-300 to-orange-400',
    showStars: false,
    showMoon: false,
    cloudOpacity: 0.9,
    groundColors: ['#86efac', '#4ade80', '#22c55e'],
    greeting: '좋은 아침이에요!',
  },
  afternoon: {
    bg: 'linear-gradient(180deg, #4A90D9 0%, #87CEEB 30%, #B0E0FF 60%, #90EE90 85%, #4CAF50 100%)',
    sunEmoji: '😊',
    sunGradient: 'from-yellow-200 via-yellow-300 to-orange-400',
    showStars: false,
    showMoon: false,
    cloudOpacity: 0.95,
    groundColors: ['#4ade80', '#22c55e', '#16a34a'],
    greeting: '활기찬 오후에요!',
  },
  sunset: {
    bg: 'linear-gradient(180deg, #2D1B69 0%, #8B3A62 20%, #E94560 40%, #FF8C42 60%, #FFD700 80%, #FFECD2 100%)',
    sunEmoji: '🌇',
    sunGradient: 'from-orange-300 via-red-400 to-rose-500',
    showStars: true,
    showMoon: false,
    cloudOpacity: 0.7,
    groundColors: ['#6b8f5e', '#4a7a3e', '#2d5a1e'],
    greeting: '노을이 아름다운 저녁이에요!',
  },
  night: {
    bg: 'linear-gradient(180deg, #0a0a23 0%, #1a1a3e 20%, #16213e 40%, #1a2a5e 60%, #0f2040 80%, #1a3a2e 100%)',
    sunEmoji: '🌙',
    sunGradient: 'from-blue-100 via-gray-200 to-blue-200',
    showStars: true,
    showMoon: true,
    cloudOpacity: 0.3,
    groundColors: ['#1a4a2e', '#0f3a1e', '#082a12'],
    greeting: '별이 빛나는 밤이에요!',
  },
};

function AmusementParkLoader({ status }: { status: string }) {
  const [sparkles, setSparkles] = useState<Array<{ id: number; x: number; y: number; emoji: string; z: number }>>([]);
  const [balloons, setBalloons] = useState<Array<{ id: number; x: number; color: string; z: number }>>([]);
  const [floatingItems, setFloatingItems] = useState<Array<{ id: number; x: number; y: number; emoji: string; delay: number; speed: number }>>([]);
  const sparkleIdRef = useRef(0);
  const balloonIdRef = useRef(0);

  const theme = getTimeTheme();
  const config = TIME_THEME_CONFIG[theme];

  // Initialize floating 3D items
  useEffect(() => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      emoji: FLOAT_ITEMS[i % FLOAT_ITEMS.length],
      delay: Math.random() * 5,
      speed: 3 + Math.random() * 4,
    }));
    setFloatingItems(items);
  }, []);

  // Click/tap → 3D sparkle burst
  const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const newSparkles = Array.from({ length: 8 }, () => ({
      id: sparkleIdRef.current++,
      x: x + (Math.random() - 0.5) * 100,
      y: y + (Math.random() - 0.5) * 100,
      z: Math.random() * 200 - 100,
      emoji: EMOJI_ITEMS[Math.floor(Math.random() * EMOJI_ITEMS.length)],
    }));
    setSparkles(prev => [...prev, ...newSparkles]);
    setTimeout(() => {
      setSparkles(prev => prev.filter(s => !newSparkles.find(ns => ns.id === s.id)));
    }, 1000);
  }, []);

  // Auto-release balloons with 3D depth
  useEffect(() => {
    const interval = setInterval(() => {
      const newBalloon = {
        id: balloonIdRef.current++,
        x: 10 + Math.random() * 80,
        color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
        z: Math.random() * 100 - 50,
      };
      setBalloons(prev => [...prev.slice(-7), newBalloon]);
      setTimeout(() => {
        setBalloons(prev => prev.filter(b => b.id !== newBalloon.id));
      }, 5000);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center min-h-screen z-[9999] overflow-hidden cursor-pointer select-none"
      onClick={handleClick}
      style={{ perspective: '1200px', background: config.bg, transformStyle: 'preserve-3d' }}
    >
      {/* Stars (sunset & night) */}
      {config.showStars && <div className="stars-bg" />}

      {/* Moon (night only) */}
      {config.showMoon && (
        <div className="absolute top-8 left-10 md:top-12 md:left-16 moon-3d">
          <div className="relative">
            <div className="absolute -inset-8 rounded-full" style={{ background: 'radial-gradient(circle, rgba(200,220,255,0.3) 0%, transparent 70%)' }} />
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-100 via-blue-50 to-gray-200 shadow-lg shadow-blue-200/30 flex items-center justify-center text-2xl">
              🌙
            </div>
          </div>
        </div>
      )}

      {/* Sun/Sunset (not night) */}
      {!config.showMoon && (
        <div className="absolute top-6 right-8 md:top-10 md:right-16 sun-3d">
          <div className="relative">
            <div className="sun-glow" />
            <div className="sun-rays-3d">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="sun-ray"
                  style={{ transform: `rotate(${i * 30}deg)` }}
                />
              ))}
            </div>
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${config.sunGradient} shadow-lg flex items-center justify-center text-2xl sun-face`}>
              {config.sunEmoji}
            </div>
          </div>
        </div>
      )}

      {/* 3D Clouds with depth */}
      <div className="cloud-3d cloud-3d-1" style={{ transform: 'translateZ(50px)', opacity: config.cloudOpacity }} />
      <div className="cloud-3d cloud-3d-2" style={{ transform: 'translateZ(-30px)', opacity: config.cloudOpacity * 0.7 }} />
      <div className="cloud-3d cloud-3d-3" style={{ transform: 'translateZ(20px)', opacity: config.cloudOpacity * 0.85 }} />

      {/* Night: extra shooting stars */}
      {theme === 'night' && (
        <>
          <div className="shooting-star" style={{ top: '12%', left: '15%', animationDelay: '0s' }} />
          <div className="shooting-star" style={{ top: '8%', left: '55%', animationDelay: '2.5s' }} />
          <div className="shooting-star" style={{ top: '20%', left: '75%', animationDelay: '5s' }} />
        </>
      )}

      {/* Sunset: warm light rays */}
      {theme === 'sunset' && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 85% 40%, rgba(255,140,0,0.15) 0%, transparent 60%)',
        }} />
      )}

      {/* Floating 3D emoji particles */}
      {floatingItems.map(item => (
        <div
          key={item.id}
          className="float-3d-item"
          style={{
            left: `${item.x}%`,
            top: `${item.y}%`,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.speed}s`,
          }}
        >
          {item.emoji}
        </div>
      ))}

      {/* 3D Balloons */}
      {balloons.map(b => (
        <div
          key={b.id}
          className="balloon-3d"
          style={{
            left: `${b.x}%`,
            bottom: 0,
            transform: `translateZ(${b.z}px)`,
          }}
        >
          <svg width="36" height="52" viewBox="0 0 36 52">
            <defs>
              <radialGradient id={`bg-${b.id}`} cx="35%" cy="30%">
                <stop offset="0%" stopColor="white" stopOpacity="0.5" />
                <stop offset="100%" stopColor={b.color} stopOpacity="0.9" />
              </radialGradient>
            </defs>
            <ellipse cx="18" cy="18" rx="14" ry="18" fill={`url(#bg-${b.id})`} />
            <ellipse cx="13" cy="11" rx="4" ry="6" fill="white" opacity="0.35" transform="rotate(-15 13 11)" />
            <path d="M18 36 L18 52" stroke={b.color} strokeWidth="1" opacity="0.5" />
            <polygon points="16,36 20,36 18,39" fill={b.color} opacity="0.6" />
          </svg>
        </div>
      ))}

      {/* 3D Sparkle effects on click */}
      {sparkles.map(s => (
        <div
          key={s.id}
          className="sparkle-3d text-2xl md:text-3xl"
          style={{
            left: s.x,
            top: s.y,
            transform: `translateZ(${s.z}px) scale(${0.5 + Math.random()})`,
          }}
        >
          {s.emoji}
        </div>
      ))}

      {/* Central 3D content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-4 scene-3d">
        {/* 3D Ferris Wheel */}
        <div className="relative w-36 h-36 md:w-44 md:h-44 ferris-container-3d">
          {/* Night: neon glow on wheel */}
          {theme === 'night' && (
            <div className="absolute inset-0 rounded-full" style={{ filter: 'blur(20px)', background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)' }} />
          )}
          <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-xl">
            <rect x="30" y="93" width="60" height="4" rx="2" fill="#8B7355" opacity="0.8" />
            <line x1="60" y1="55" x2="38" y2="93" stroke="#8B7355" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="60" y1="55" x2="82" y2="93" stroke="#8B7355" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="60" cy="55" r="6" fill={theme === 'night' ? '#a5b4fc' : '#818cf8'} />
            <circle cx="60" cy="55" r="4" fill="#6366f1" />
            <circle cx="59" cy="54" r="2" fill="white" opacity="0.4" />
            <g className="ferris-wheel" style={{ transformOrigin: '60px 55px' }}>
              <circle cx="60" cy="55" r="34" fill="none" stroke={theme === 'night' ? '#c7d2fe' : '#a5b4fc'} strokeWidth="1" />
              <circle cx="60" cy="55" r="32" fill="none" stroke="#6366f1" strokeWidth="2.5" />
              <circle cx="60" cy="55" r="16" fill="none" stroke="#6366f1" strokeWidth="1" opacity="0.3" />
              {Array.from({ length: 8 }).map((_, i) => {
                const angle = (i * 45 - 90) * (Math.PI / 180);
                const x = 60 + 32 * Math.cos(angle);
                const y = 55 + 32 * Math.sin(angle);
                const colors = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4', '#FF9FF3', '#F8B500', '#6C5CE7'];
                return (
                  <g key={i}>
                    <line x1="60" y1="55" x2={x} y2={y} stroke="#818cf8" strokeWidth="1" opacity="0.4" />
                    <rect x={x - 5.5} y={y - 1} width="11" height="9" rx="2.5" fill={colors[i]} />
                    <rect x={x - 5.5} y={y - 1} width="11" height="3.5" rx="2" fill="white" opacity="0.25" />
                    <line x1={x} y1={y - 3} x2={x} y2={y - 1} stroke={colors[i]} strokeWidth="1.5" />
                    {/* Night: gondola glow */}
                    {theme === 'night' && <circle cx={x} cy={y + 3} r="6" fill={colors[i]} opacity="0.15" />}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* 3D Title with depth */}
        <div className="text-center title-3d">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="bounce-1 text-3xl md:text-4xl" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }}>🎨</span>
            <h1
              className="text-3xl md:text-4xl font-bold text-white title-text-3d"
              style={{ textShadow: '0 2px 4px rgba(0,0,0,0.1), 0 4px 12px rgba(99,102,241,0.3)' }}
            >
              서초아이미술
            </h1>
            <span className="bounce-2 text-3xl md:text-4xl" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }}>🖌️</span>
          </div>
          <p className="text-white/80 text-sm drop-shadow-sm tracking-wide">
            {status || config.greeting}
          </p>
        </div>

        {/* 3D Loading bar */}
        <div className="w-64 md:w-80 loading-bar-3d">
          <div className="h-4 bg-white/20 rounded-full overflow-hidden backdrop-blur-md shadow-inner border border-white/20">
            <div className="loading-bar-fill-3d h-full rounded-full" />
          </div>
          <p className="text-center text-white/60 text-xs mt-2.5 drop-shadow-sm">화면을 터치하면 불꽃놀이가 터져요!</p>
        </div>

        {/* 3D Bouncing characters */}
        <div className="flex gap-6 mt-2">
          {(theme === 'night'
            ? ['🎡', '🎆', '🎇', '🎪']
            : theme === 'sunset'
            ? ['🎡', '🌅', '🎠', '🎪']
            : ['🎡', '🎢', '🎠', '🎪']
          ).map((emoji, i) => (
            <span
              key={i}
              className={`bounce-${(i % 3) + 1} text-4xl md:text-5xl cursor-pointer hover:scale-125 transition-transform char-3d`}
              style={{
                animationDelay: `${i * 0.3}s`,
                filter: `drop-shadow(0 6px 8px rgba(0,0,0,${theme === 'night' ? 0.4 : 0.25}))`,
              }}
            >
              {emoji}
            </span>
          ))}
        </div>
      </div>

      {/* 3D Ground with perspective */}
      <div className="absolute bottom-0 left-0 right-0 ground-3d pointer-events-none">
        <svg className="absolute bottom-0 w-full" viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ height: '80px' }}>
          <path d="M0,80 C200,20 400,100 600,50 C800,0 1000,60 1200,30 L1200,120 L0,120 Z" fill={config.groundColors[0]} opacity="0.4" />
          <path d="M0,90 C300,40 500,110 700,60 C900,10 1100,80 1200,50 L1200,120 L0,120 Z" fill={config.groundColors[1]} opacity="0.5" />
          <path d="M0,100 C150,80 350,105 600,85 C850,65 1050,100 1200,80 L1200,120 L0,120 Z" fill={config.groundColors[2]} opacity="0.6" />
        </svg>
        {/* Night: tiny ground lights */}
        {theme === 'night' && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-8">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: ['#FFE66D', '#FF9FF3', '#4ECDC4', '#FF6B6B'][i % 4],
                  boxShadow: `0 0 6px ${['#FFE66D', '#FF9FF3', '#4ECDC4', '#FF6B6B'][i % 4]}`,
                  animation: `twinkle 1.5s ease-in-out infinite ${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        )}
        {/* Flags */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center flag-3d" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className={`w-1 h-6 rounded-t ${theme === 'night' ? 'bg-amber-900/30' : 'bg-amber-800/50'}`} />
              <div className="flag-wave text-lg" style={{ animationDelay: `${i * 0.15}s` }}>
                {theme === 'night'
                  ? ['🏮', '🎆', '🏮', '🎇', '🏮'][i % 5]
                  : ['🚩', '🏁', '🎌', '🎏', '🚩'][i % 5]}
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
