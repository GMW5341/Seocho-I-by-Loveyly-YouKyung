import { useRef, useState, useCallback } from 'react';
import { useAppStore } from '../../store/StoreContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { ClassLevel, CurriculumFile } from '../../types';

const CLASS_LEVELS: { level: ClassLevel; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { level: '유아반', label: '유아반', color: 'text-pink-700', bgColor: 'bg-pink-50', borderColor: 'border-pink-300' },
  { level: '초등(저학년)', label: '초등 저학년반', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-300' },
  { level: '초등(고학년)', label: '초등 고학년반', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-300' },
];

// Compress image to reduce size for localStorage
function compressImage(dataUrl: string, maxWidth = 1600, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      // Always output as JPEG for smaller size
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function CurriculumPage() {
  const { curriculum, addCurriculumFile, deleteCurriculumFile } = useAppStore();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [zoomedFile, setZoomedFile] = useState<CurriculumFile | null>(null);
  const [draggingLevel, setDraggingLevel] = useState<ClassLevel | null>(null);

  const processFiles = useCallback(async (files: FileList | File[], classLevel: ClassLevel) => {
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) {
        alert('이미지 또는 PDF 파일만 업로드 가능합니다.');
        continue;
      }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        let dataUrl = ev.target?.result as string;

        // Compress images to prevent localStorage overflow
        if (isImage) {
          dataUrl = await compressImage(dataUrl);
        }

        addCurriculumFile({
          name: file.name,
          type: isImage ? 'image' : 'pdf',
          classLevel,
          dataUrl,
        });
      };
      reader.readAsDataURL(file);
    }
  }, [addCurriculumFile]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, classLevel: ClassLevel) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(files, classLevel);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent, classLevel: ClassLevel) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingLevel(classLevel);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingLevel(null);
  };

  const handleDrop = (e: React.DragEvent, classLevel: ClassLevel) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingLevel(null);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files, classLevel);
    }
  };

  const getFilesForLevel = (level: ClassLevel) =>
    curriculum.filter(f => f.classLevel === level);

  // Also show legacy files without classLevel in first section
  const getLegacyFiles = () =>
    curriculum.filter(f => !f.classLevel);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-800">커리큘럼</h3>
        <p className="text-sm text-gray-500">반별 커리큘럼을 업로드하고 관리하세요. 드래그하여 업로드하거나 버튼을 클릭하세요.</p>
      </div>

      {/* Three class level sections */}
      <div className="space-y-8">
        {CLASS_LEVELS.map(({ level, label, color, bgColor, borderColor }) => {
          const files = [...getFilesForLevel(level), ...(level === '유아반' ? getLegacyFiles() : [])];
          const isDragging = draggingLevel === level;

          return (
            <div key={level} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Section Header */}
              <div className={`flex items-center justify-between px-5 py-3 ${bgColor} border-b ${borderColor}`}>
                <h4 className={`text-sm font-bold ${color}`}>{label}</h4>
                <button
                  onClick={() => fileInputRefs.current[level]?.click()}
                  className={`${color} ${bgColor} border ${borderColor} px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity`}
                >
                  + 파일 업로드
                </button>
                <input
                  ref={el => { fileInputRefs.current[level] = el; }}
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  onChange={e => handleFileUpload(e, level)}
                  className="hidden"
                />
              </div>

              {/* Content / Drop Zone */}
              <div
                onDragOver={e => handleDragOver(e, level)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, level)}
                className={`p-4 transition-colors min-h-[120px] ${
                  isDragging ? `${bgColor} border-2 border-dashed ${borderColor}` : ''
                }`}
              >
                {isDragging ? (
                  <div className="flex items-center justify-center h-24">
                    <p className={`text-sm font-medium ${color}`}>여기에 파일을 놓으세요</p>
                  </div>
                ) : files.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => fileInputRefs.current[level]?.click()}
                  >
                    <div className="text-2xl mb-2 opacity-40">📂</div>
                    <p className="text-xs text-gray-400">이미지 또는 PDF를 드래그하거나 클릭하여 업로드</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map(file => (
                      <div key={file.id} className="group relative border border-gray-200 rounded-lg overflow-hidden">
                        {/* File Header */}
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-medium text-gray-700 truncate">{file.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                              file.type === 'image' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                            }`}>
                              {file.type === 'image' ? 'IMG' : 'PDF'}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`"${file.name}" 파일을 삭제하시겠습니까?`)) deleteCurriculumFile(file.id);
                            }}
                            className="text-[10px] text-red-500 hover:text-red-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                          >
                            삭제
                          </button>
                        </div>

                        {/* File Preview */}
                        {file.type === 'image' ? (
                          <div
                            className="cursor-pointer overflow-hidden"
                            onClick={() => setZoomedFile(file)}
                          >
                            <img
                              src={file.dataUrl}
                              alt={file.name}
                              className="w-full h-48 object-cover transition-transform duration-300 hover:scale-110"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML =
                                  '<div class="flex items-center justify-center h-48 text-sm text-gray-400">이미지를 불러올 수 없습니다</div>';
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            className="cursor-pointer"
                            onClick={() => setZoomedFile(file)}
                          >
                            <iframe
                              src={file.dataUrl}
                              title={file.name}
                              className="w-full h-48 pointer-events-none"
                            />
                          </div>
                        )}

                        <div className="px-3 py-1.5 text-[10px] text-gray-400">
                          {format(new Date(file.createdAt), 'yyyy.MM.dd', { locale: ko })}
                        </div>
                      </div>
                    ))}

                    {/* Add more drop area */}
                    <div
                      className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg min-h-[200px] cursor-pointer hover:border-gray-400 transition-colors"
                      onClick={() => fileInputRefs.current[level]?.click()}
                    >
                      <div className="text-xl mb-1 opacity-30">+</div>
                      <p className="text-[10px] text-gray-400">추가 업로드</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Zoom Modal */}
      {zoomedFile && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomedFile(null)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={e => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => setZoomedFile(null)}
              className="absolute -top-10 right-0 text-white text-sm font-medium hover:text-gray-300 flex items-center gap-1"
            >
              닫기 ✕
            </button>

            {/* File name */}
            <div className="absolute -top-10 left-0 text-white text-sm font-medium truncate max-w-[60%]">
              {zoomedFile.name}
            </div>

            {zoomedFile.type === 'image' ? (
              <img
                src={zoomedFile.dataUrl}
                alt={zoomedFile.name}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <iframe
                src={zoomedFile.dataUrl}
                title={zoomedFile.name}
                className="w-[90vw] h-[90vh] rounded-lg bg-white"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
