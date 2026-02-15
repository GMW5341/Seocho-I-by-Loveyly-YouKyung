import { StoreProvider, useAppStore } from './store/StoreContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Dashboard from './components/dashboard/Dashboard';
import ScheduleGrid from './components/schedule/ScheduleGrid';
import StudentList from './components/students/StudentList';
import AttendanceManager from './components/attendance/AttendanceManager';
import PaymentManager from './components/payments/PaymentManager';
import SettingsPage from './components/settings/SettingsPage';

const TAB_TITLES: Record<string, string> = {
  dashboard: '대시보드',
  schedule: '스케줄 관리',
  students: '원생 관리',
  attendance: '출결 관리',
  payments: '결제 관리',
  settings: '설정',
};

function AppContent() {
  const { activeTab, setActiveTab } = useAppStore();

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'schedule': return <ScheduleGrid />;
      case 'students': return <StudentList />;
      case 'attendance': return <AttendanceManager />;
      case 'payments': return <PaymentManager />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={TAB_TITLES[activeTab] || '서초아이미술'} />
        <main className="flex-1 bg-gray-50 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
