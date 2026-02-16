import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <div className="text-sm text-gray-500">
        {format(now, 'yyyy년 MM월 dd일 (EEEE)', { locale: ko })}
        <span className="ml-2 text-gray-700 font-medium tabular-nums">
          {format(now, 'HH:mm:ss')}
        </span>
      </div>
    </header>
  );
}
