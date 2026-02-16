import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface HeaderProps {
  title: string;
  onMenuToggle?: () => void;
}

export default function Header({ title, onMenuToggle }: HeaderProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="메뉴 열기"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <h2 className="text-lg md:text-xl font-bold text-gray-800 truncate">{title}</h2>
      </div>
      <div className="text-xs md:text-sm text-gray-500 whitespace-nowrap shrink-0">
        <span className="hidden sm:inline">
          {format(now, 'yyyy년 MM월 dd일 (EEEE)', { locale: ko })}
        </span>
        <span className="sm:hidden">
          {format(now, 'MM/dd (EEE)', { locale: ko })}
        </span>
        <span className="ml-2 text-gray-700 font-medium tabular-nums">
          {format(now, 'HH:mm:ss')}
        </span>
      </div>
    </header>
  );
}
