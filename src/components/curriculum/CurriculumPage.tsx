import { useRef } from 'react';
import { useAppStore } from '../../store/StoreContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function CurriculumPage() {
  const { curriculum, addCurriculumFile, deleteCurriculumFile } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) {
        alert('이미지 또는 PDF 파일만 업로드 가능합니다.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        addCurriculumFile({
          name: file.name,
          type: isImage ? 'image' : 'pdf',
          dataUrl,
        });
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">커리큘럼</h3>
          <p className="text-sm text-gray-500">이미지 또는 PDF 파일을 업로드하여 커리큘럼을 관리하세요</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + 파일 업로드
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {curriculum.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
          <div className="text-4xl mb-3">📚</div>
          <div className="text-gray-500 text-sm mb-4">아직 업로드된 커리큘럼이 없습니다</div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-200"
          >
            이미지 또는 PDF 업로드
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {curriculum.map(file => (
            <div key={file.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{file.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    file.type === 'image'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {file.type === 'image' ? '이미지' : 'PDF'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {format(new Date(file.createdAt), 'yyyy.MM.dd', { locale: ko })}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`"${file.name}" 파일을 삭제하시겠습니까?`)) deleteCurriculumFile(file.id);
                  }}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  삭제
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                {file.type === 'image' ? (
                  <img
                    src={file.dataUrl}
                    alt={file.name}
                    className="max-w-full rounded-lg shadow-sm"
                  />
                ) : (
                  <iframe
                    src={file.dataUrl}
                    title={file.name}
                    className="w-full rounded-lg border border-gray-200"
                    style={{ height: '80vh' }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
