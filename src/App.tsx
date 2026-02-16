import { useState, useCallback, useEffect } from 'react';
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
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{status || '데이터 불러오는 중...'}</p>
        </div>
      </div>
    );
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
