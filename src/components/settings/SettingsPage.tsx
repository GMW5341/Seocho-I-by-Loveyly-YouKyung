import { useState } from 'react';
import { format } from 'date-fns';
import { useAppStore } from '../../store/StoreContext';
import type { SeasonType, DayOfWeek, ClassDuration } from '../../types';
import { DAYS_OF_WEEK, formatCurrency } from '../../utils/helpers';

export default function SettingsPage() {
  const { settings, updateSettings, holidays, addHoliday, removeHoliday, logoDataUrl, setLogoDataUrl } = useAppStore();
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

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
      addHoliday({ date: newHolidayDate, name: newHolidayName });
      setNewHolidayDate('');
      setNewHolidayName('');
    }
  };

  const handleExportData = () => {
    const data = {
      students: localStorage.getItem('seocho_students'),
      schedules: localStorage.getItem('seocho_schedules'),
      attendance: localStorage.getItem('seocho_attendance'),
      payments: localStorage.getItem('seocho_payments'),
      holidays: localStorage.getItem('seocho_holidays'),
      settings: localStorage.getItem('seocho_settings'),
      exportDate: new Date().toISOString(),
    };
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
        if (data.students) localStorage.setItem('seocho_students', data.students);
        if (data.schedules) localStorage.setItem('seocho_schedules', data.schedules);
        if (data.attendance) localStorage.setItem('seocho_attendance', data.attendance);
        if (data.payments) localStorage.setItem('seocho_payments', data.payments);
        if (data.holidays) localStorage.setItem('seocho_holidays', data.holidays);
        if (data.settings) localStorage.setItem('seocho_settings', data.settings);
        window.location.reload();
      } catch {
        alert('올바르지 않은 파일 형식입니다.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6 max-w-3xl">
      <h3 className="text-lg font-bold text-gray-800 mb-6">설정</h3>

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
        <div className="flex gap-2 mb-3">
          <input
            type="date"
            value={newHolidayDate}
            onChange={e => setNewHolidayDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="명칭 (예: 설날)"
            value={newHolidayName}
            onChange={e => setNewHolidayName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
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
              <span className="text-sm text-gray-700">{h.date} - {h.name}</span>
              <button
                onClick={() => removeHoliday(h.id)}
                className="text-xs text-red-500 hover:text-red-700"
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

      {/* Data Management */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">데이터 관리</h4>
        <div className="flex gap-3">
          <button
            onClick={handleExportData}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
          >
            데이터 백업 (내보내기)
          </button>
          <label className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer">
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
