import { useState } from 'react';
import { format } from 'date-fns';
import { useAppStore } from '../../store/StoreContext';
import type { SeasonType, DayOfWeek, ClassDuration } from '../../types';
import { DAYS_OF_WEEK, formatCurrency } from '../../utils/helpers';
import {
  getSyncConfig, getSyncRoom, isSyncEnabled as checkSyncEnabled,
  setupSync, stopSync, setSyncEnabled, pushToCloud, generateSyncUrl,
  type FirebaseConfig,
} from '../../services/firebaseSync';

export default function SettingsPage() {
  const { settings, updateSettings, holidays, addHoliday, removeHoliday, logoDataUrl, setLogoDataUrl } = useAppStore();
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayEndDate, setNewHolidayEndDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [isRangeMode, setIsRangeMode] = useState(false);

  // Cloud sync state
  const [syncEnabled, setSyncEnabledState] = useState(checkSyncEnabled);
  const [syncRoom, setSyncRoom] = useState(getSyncRoom);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [showSyncSetup, setShowSyncSetup] = useState(false);
  const existingConfig = getSyncConfig();
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConfig>(existingConfig || {
    apiKey: '', authDomain: '', projectId: '',
    storageBucket: '', messagingSenderId: '', appId: '',
  });
  const [configInput, setConfigInput] = useState('');

  const handleSeasonChange = (season: SeasonType) => {
    updateSettings({ currentSeason: season });
  };

  const handleMaxStudentsChange = (max: number) => {
    updateSettings({ maxStudentsPerSlot: Math.max(1, Math.min(20, max)) });
  };

  const handlePricingChange = (duration: ClassDuration, price: number) => {
    updateSettings({
      pricing: { ...settings.pricing, [duration]: price },
    });
  };

  const handleHoursChange = (season: 'semester' | 'vacation', day: DayOfWeek, field: 'start' | 'end', value: string) => {
    if (season === 'semester') {
      updateSettings({
        semesterHours: {
          ...settings.semesterHours,
          [day]: { ...settings.semesterHours[day], [field]: value },
        },
      });
    } else {
      updateSettings({
        vacationHours: {
          ...settings.vacationHours,
          [day]: { ...settings.vacationHours[day], [field]: value },
        },
      });
    }
  };

  const handleAddHoliday = () => {
    if (newHolidayDate && newHolidayName) {
      const holiday: { date: string; endDate?: string; name: string } = {
        date: newHolidayDate,
        name: newHolidayName,
      };
      if (isRangeMode && newHolidayEndDate && newHolidayEndDate > newHolidayDate) {
        holiday.endDate = newHolidayEndDate;
      }
      addHoliday(holiday);
      setNewHolidayDate('');
      setNewHolidayEndDate('');
      setNewHolidayName('');
    }
  };

  const ALL_STORAGE_KEYS = [
    'seocho_students', 'seocho_schedules', 'seocho_attendance', 'seocho_payments',
    'seocho_holidays', 'seocho_settings', 'seocho_trial_students', 'seocho_trial_lessons',
    'seocho_curriculum', 'seocho_message_templates', 'seocho_special_classes',
    'seocho_special_class_students', 'seocho_logo',
  ];

  const handleExportData = () => {
    const data: Record<string, string | null> = { exportDate: new Date().toISOString() };
    ALL_STORAGE_KEYS.forEach(key => {
      data[key] = localStorage.getItem(key);
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `서초아이미술_백업_${format(new Date(), 'yyyyMMdd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        // Support both old format (short keys) and new format (full keys)
        const keyMap: Record<string, string> = {
          students: 'seocho_students', schedules: 'seocho_schedules',
          attendance: 'seocho_attendance', payments: 'seocho_payments',
          holidays: 'seocho_holidays', settings: 'seocho_settings',
        };
        let imported = false;
        // Import new format (full storage keys)
        ALL_STORAGE_KEYS.forEach(key => {
          if (data[key] != null) {
            // Handle both string values and object/array values
            const val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
            localStorage.setItem(key, val);
            imported = true;
          }
        });
        // Import old format (short keys) as fallback
        Object.entries(keyMap).forEach(([shortKey, fullKey]) => {
          if (data[shortKey] != null && !data[fullKey]) {
            const val = typeof data[shortKey] === 'string' ? data[shortKey] : JSON.stringify(data[shortKey]);
            localStorage.setItem(fullKey, val);
            imported = true;
          }
        });
        if (imported) {
          // Set flag so sync listener knows to push (not pull) on next load
          localStorage.setItem('seocho_just_imported', 'true');
          window.location.reload();
        } else {
          alert('백업 파일에 복원할 데이터가 없습니다.');
        }
      } catch {
        alert('올바르지 않은 파일 형식입니다.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-3 md:p-6 max-w-3xl">
      <h3 className="text-lg font-bold text-gray-800 mb-4 md:mb-6">설정</h3>

      {/* Logo Upload */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">로고 이미지</h4>
        <div className="flex items-center gap-4">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="로고" className="w-16 h-16 rounded-full object-cover border-2 border-indigo-200" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">없음</div>
          )}
          <div className="flex flex-col gap-2">
            <label className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 cursor-pointer inline-block text-center">
              이미지 업로드
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement('canvas');
                      const maxSize = 200;
                      canvas.width = maxSize;
                      canvas.height = maxSize;
                      const ctx = canvas.getContext('2d')!;
                      const size = Math.min(img.width, img.height);
                      const sx = (img.width - size) / 2;
                      const sy = (img.height - size) / 2;
                      ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
                      setLogoDataUrl(canvas.toDataURL('image/png', 0.9));
                    };
                    img.src = ev.target?.result as string;
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
            </label>
            {logoDataUrl && (
              <button
                onClick={() => setLogoDataUrl('')}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                로고 삭제
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Season Toggle */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">학기 모드</h4>
        <div className="flex gap-3">
          {(['학기중', '방학중'] as SeasonType[]).map(season => (
            <button
              key={season}
              onClick={() => handleSeasonChange(season)}
              className={`px-6 py-2 rounded-lg text-sm font-medium border ${
                settings.currentSeason === season
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {season}
            </button>
          ))}
        </div>
      </section>

      {/* Max capacity */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">동시간대 최대 수용 인원</h4>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleMaxStudentsChange(settings.maxStudentsPerSlot - 1)}
            className="w-10 h-10 border border-gray-300 rounded-lg text-lg font-medium hover:bg-gray-50"
          >
            -
          </button>
          <span className="text-2xl font-bold text-indigo-700 w-12 text-center">
            {settings.maxStudentsPerSlot}
          </span>
          <button
            onClick={() => handleMaxStudentsChange(settings.maxStudentsPerSlot + 1)}
            className="w-10 h-10 border border-gray-300 rounded-lg text-lg font-medium hover:bg-gray-50"
          >
            +
          </button>
          <span className="text-sm text-gray-500 ml-2">명</span>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">수업료 설정 (4회 기준)</h4>
        <div className="space-y-3">
          {([60, 80, 100] as ClassDuration[]).map(duration => (
            <div key={duration} className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-600 w-16">{duration}분</span>
              <div className="relative flex-1 max-w-xs">
                <input
                  type="number"
                  value={settings.pricing[duration]}
                  onChange={e => handlePricingChange(duration, Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8"
                  step={10000}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">원</span>
              </div>
              <span className="text-xs text-gray-400">회당 {formatCurrency(settings.pricing[duration] / 4)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Operating Hours */}
      {(['semester', 'vacation'] as const).map(season => (
        <section key={season} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {season === 'semester' ? '학기중' : '방학중'} 운영 시간
          </h4>
          <div className="space-y-2">
            {DAYS_OF_WEEK.map(day => {
              const hours = season === 'semester' ? settings.semesterHours[day] : settings.vacationHours[day];
              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-600 w-12">{day}요일</span>
                  <input
                    type="time"
                    value={hours?.start || ''}
                    onChange={e => handleHoursChange(season, day, 'start', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  />
                  <span className="text-gray-400">~</span>
                  <input
                    type="time"
                    value={hours?.end || ''}
                    onChange={e => handleHoursChange(season, day, 'end', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Holidays */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">공휴일 / 휴원일 관리</h4>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setIsRangeMode(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              !isRangeMode ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            단일 날짜
          </button>
          <button
            onClick={() => setIsRangeMode(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              isRangeMode ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            기간 설정
          </button>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={newHolidayDate}
              onChange={e => setNewHolidayDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {isRangeMode && (
              <>
                <span className="text-gray-400 text-sm px-1">~</span>
                <input
                  type="date"
                  value={newHolidayEndDate}
                  onChange={e => setNewHolidayEndDate(e.target.value)}
                  min={newHolidayDate}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </>
            )}
          </div>
          <input
            type="text"
            placeholder="명칭 (예: 설날, 여름방학)"
            value={newHolidayName}
            onChange={e => setNewHolidayName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[150px]"
          />
          <button
            onClick={handleAddHoliday}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            추가
          </button>
        </div>
        <div className="space-y-1">
          {holidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
            <div key={h.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  {h.endDate ? `${h.date} ~ ${h.endDate}` : h.date}
                </span>
                <span className="text-sm font-medium text-gray-900">{h.name}</span>
                {h.endDate && (
                  <span className="text-xs text-gray-400">
                    ({Math.round((new Date(h.endDate).getTime() - new Date(h.date).getTime()) / (1000 * 60 * 60 * 24)) + 1}일간)
                  </span>
                )}
              </div>
              <button
                onClick={() => removeHoliday(h.id)}
                className="text-xs text-red-500 hover:text-red-700 shrink-0"
              >
                삭제
              </button>
            </div>
          ))}
          {holidays.length === 0 && (
            <p className="text-sm text-gray-400 py-2">등록된 공휴일이 없습니다.</p>
          )}
        </div>
      </section>

      {/* Cloud Sync */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700">클라우드 동기화</h4>
          {syncEnabled && syncStatus !== 'error' && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">연결됨</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Firebase를 연결하면 PC, 모바일, 다른 기기에서 데이터가 자동으로 동기화됩니다.
        </p>

        {syncEnabled && !showSyncSetup ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-green-700 font-medium">동기화 활성화됨</span>
              <span className="text-xs text-green-600 ml-auto">방 이름: {getSyncRoom()}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
              <p className="text-xs font-bold text-amber-800 mb-1.5">모바일에서 바로 연결하기</p>
              <p className="text-xs text-amber-700 mb-2">아래 링크를 카카오톡 나에게 보내기로 보낸 뒤, 모바일에서 열면 자동으로 동기화됩니다.</p>
              <button
                onClick={() => {
                  const url = generateSyncUrl();
                  if (url) {
                    navigator.clipboard.writeText(url).then(() => {
                      setSyncMessage('링크가 복사되었습니다! 카카오톡으로 보내세요.');
                      setTimeout(() => setSyncMessage(''), 5000);
                    }).catch(() => {
                      prompt('아래 링크를 복사하세요:', url);
                    });
                  }
                }}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-amber-700 w-full"
              >
                모바일 연결 링크 복사
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  setSyncStatus('connecting');
                  const success = await pushToCloud();
                  setSyncStatus(success ? 'connected' : 'error');
                  setSyncMessage(success ? '수동 업로드 완료!' : '업로드 실패');
                  setTimeout(() => setSyncMessage(''), 3000);
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                수동 업로드
              </button>
              <button
                onClick={() => setShowSyncSetup(true)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                설정 변경
              </button>
              <button
                onClick={() => {
                  stopSync();
                  setSyncEnabled(false);
                  setSyncEnabledState(false);
                  setSyncStatus('idle');
                }}
                className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-200"
              >
                동기화 해제
              </button>
            </div>
            {syncMessage && <p className="text-xs text-indigo-600 font-medium">{syncMessage}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Setup instructions */}
            <div className="bg-indigo-50 rounded-lg p-4">
              <h5 className="text-xs font-bold text-indigo-700 mb-2">Firebase 설정 방법 (최초 1회)</h5>
              <ol className="text-xs text-indigo-600 space-y-1 list-decimal list-inside">
                <li><a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="underline">Firebase Console</a> 접속 → 프로젝트 만들기 (무료)</li>
                <li>프로젝트 생성 후 → Firestore Database → 데이터베이스 만들기 → 테스트 모드로 시작</li>
                <li>프로젝트 설정(톱니바퀴) → 일반 → 내 앱 → 웹 앱 추가 → Firebase SDK snippet 복사</li>
                <li>아래 입력란에 복사한 설정값 붙여넣기</li>
              </ol>
            </div>

            {/* Config paste area */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Firebase 설정 코드 붙여넣기
              </label>
              <textarea
                value={configInput}
                onChange={e => {
                  setConfigInput(e.target.value);
                  // Try to parse Firebase config from pasted code
                  try {
                    const text = e.target.value;
                    const extract = (key: string): string => {
                      const regex = new RegExp(`${key}\\s*[:=]\\s*["'\`]([^"'\`]+)["'\`]`);
                      return regex.exec(text)?.[1] || '';
                    };
                    const parsed: FirebaseConfig = {
                      apiKey: extract('apiKey'),
                      authDomain: extract('authDomain'),
                      projectId: extract('projectId'),
                      storageBucket: extract('storageBucket'),
                      messagingSenderId: extract('messagingSenderId'),
                      appId: extract('appId'),
                    };
                    if (parsed.apiKey && parsed.projectId) {
                      setFirebaseConfig(parsed);
                    }
                  } catch { /* ignore parse errors */ }
                }}
                placeholder={`const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  ...\n};`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono resize-none h-28 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
              />
            </div>

            {/* Parsed values preview */}
            {firebaseConfig.projectId && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">인식된 프로젝트:</p>
                <p className="text-sm font-semibold text-gray-800">{firebaseConfig.projectId}</p>
              </div>
            )}

            {/* Sync room name */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                동기화 방 이름 (모든 기기에서 같은 이름 입력)
              </label>
              <input
                type="text"
                value={syncRoom}
                onChange={e => setSyncRoom(e.target.value)}
                placeholder="예: 서초아이미술"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
              />
            </div>

            {/* Connect button */}
            <div className="flex flex-wrap gap-2">
              <button
                disabled={!firebaseConfig.projectId || !syncRoom || syncStatus === 'connecting'}
                onClick={() => {
                  setSyncStatus('connecting');
                  setSyncMessage('');
                  try {
                    const ok = setupSync(firebaseConfig, syncRoom, () => {
                      window.location.reload();
                    });
                    if (ok) {
                      setSyncStatus('connected');
                      setSyncEnabledState(true);
                      setShowSyncSetup(false);
                      setSyncMessage('동기화가 시작되었습니다!');
                    } else {
                      setSyncStatus('error');
                      setSyncMessage('연결에 실패했습니다. 설정을 확인해주세요.');
                    }
                  } catch {
                    setSyncStatus('error');
                    setSyncMessage('연결에 실패했습니다.');
                  }
                }}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncStatus === 'connecting' ? '연결 중...' : '동기화 시작'}
              </button>
              {showSyncSetup && syncEnabled && (
                <button
                  onClick={() => setShowSyncSetup(false)}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  취소
                </button>
              )}
            </div>

            {syncMessage && (
              <p className={`text-xs font-medium ${syncStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {syncMessage}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Data Management */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">데이터 관리</h4>
        <p className="text-xs text-gray-400 mb-3">PC와 모바일 간 데이터를 이동하려면 백업 후 가져오기를 사용하세요.</p>
        <div className="flex flex-wrap gap-2 md:gap-3">
          <button
            onClick={handleExportData}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
          >
            데이터 백업 (내보내기)
          </button>
          <label className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer text-center">
            데이터 복원 (가져오기)
            <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
          </label>
          <button
            onClick={() => {
              if (confirm('모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
          >
            데이터 초기화
          </button>
        </div>
      </section>
    </div>
  );
}
