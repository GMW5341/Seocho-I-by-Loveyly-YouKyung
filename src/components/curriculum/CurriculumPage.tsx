import { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/StoreContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { ClassLevel, CurriculumFile } from '../../types';
import { getAllCurriculumImages } from '../../services/curriculumImageStore';

const CLASS_LEVELS: { level: ClassLevel; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { level: '60분', label: '60분반', color: 'text-cyan-700', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-300' },
  { level: '80분', label: '80분반', color: 'text-pink-700', bgColor: 'bg-pink-50', borderColor: 'border-pink-300' },
  { level: '100분', label: '100분반', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-300' },
];

function compressImage(dataUrl: string, maxWidth = 800, quality = 0.5): Promise<string> {
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
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function sortFiles(files: CurriculumFile[]): CurriculumFile[] {
  return [...files].sort((a, b) => {
    const orderA = a.order ?? new Date(a.createdAt).getTime();
    const orderB = b.order ?? new Date(b.createdAt).getTime();
    return orderB - orderA;
  });
}

export default function CurriculumPage() {
  const { curriculum, addCurriculumFile, reorderCurriculum, deleteCurriculumFile } = useAppStore();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [zoomedFile, setZoomedFile] = useState<CurriculumFile | null>(null);
  const [fileDraggingLevel, setFileDraggingLevel] = useState<ClassLevel | null>(null);
  const [imageMap, setImageMap] = useState<Record<string, string>>({});

  // Load images from IndexedDB on mount and when curriculum changes
  useEffect(() => {
    getAllCurriculumImages().then(setImageMap).catch(console.error);
  }, [curriculum]);

  // Helper: get dataUrl from in-memory state or IndexedDB cache
  const getDataUrl = useCallback((file: CurriculumFile) => {
    return file.dataUrl || imageMap[file.id] || '';
  }, [imageMap]);

  // Internal drag state
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropOnCurrent, setDropOnCurrent] = useState<ClassLevel | null>(null);

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

  // External file drag (from desktop)
  const isExternalDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  const handleExternalDragOver = (e: React.DragEvent, classLevel: ClassLevel) => {
    if (!isExternalDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setFileDraggingLevel(classLevel);
  };

  const handleExternalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFileDraggingLevel(null);
  };

  const handleExternalDrop = (e: React.DragEvent, classLevel: ClassLevel) => {
    if (!isExternalDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setFileDraggingLevel(null);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files, classLevel);
    }
  };

  // Internal item drag (reordering)
  const handleItemDragStart = (e: React.DragEvent, fileId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/curriculum-id', fileId);
    setDragSourceId(fileId);
  };

  const handleItemDragEnd = () => {
    setDragSourceId(null);
    setDropTargetId(null);
    setDropOnCurrent(null);
  };

  const handleCurrentDropZone = (e: React.DragEvent, level: ClassLevel) => {
    if (isExternalDrag(e)) {
      handleExternalDragOver(e, level);
      return;
    }
    e.preventDefault();
    setDropOnCurrent(level);
    setDropTargetId(null);
  };

  const handleCurrentDropZoneLeave = (e: React.DragEvent) => {
    if (isExternalDrag(e)) {
      handleExternalDragLeave(e);
      return;
    }
    e.preventDefault();
    setDropOnCurrent(null);
  };

  const handlePastItemDragOver = (e: React.DragEvent, fileId: string) => {
    if (isExternalDrag(e)) return;
    e.preventDefault();
    setDropTargetId(fileId);
    setDropOnCurrent(null);
  };

  const handlePastItemDragLeave = (e: React.DragEvent) => {
    if (isExternalDrag(e)) return;
    e.preventDefault();
    setDropTargetId(null);
  };

  const handleDropOnItem = (e: React.DragEvent, level: ClassLevel, targetFileId: string | null) => {
    // External file drop
    if (isExternalDrag(e)) {
      handleExternalDrop(e, level);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData('text/curriculum-id') || dragSourceId;
    if (!sourceId) return;

    const levelFiles = getFilesForLevel(level);
    const sorted = sortFiles(levelFiles);
    const orderedIds = sorted.map(f => f.id);

    if (!orderedIds.includes(sourceId)) return;

    // Remove source from current position
    const withoutSource = orderedIds.filter(id => id !== sourceId);

    if (targetFileId === null) {
      // Dropped on current area -> make it current (first position)
      const newOrder = [sourceId, ...withoutSource];
      reorderCurriculum(newOrder);
    } else {
      // Dropped on a past item -> insert before it
      const targetIdx = withoutSource.indexOf(targetFileId);
      if (targetIdx === -1) return;
      withoutSource.splice(targetIdx, 0, sourceId);
      reorderCurriculum(withoutSource);
    }

    setDragSourceId(null);
    setDropTargetId(null);
    setDropOnCurrent(null);
  };

  const getFilesForLevel = (level: ClassLevel): CurriculumFile[] => {
    const levelFiles = curriculum.filter(f => f.classLevel === level);
    if (level === '60분') {
      const legacy = curriculum.filter(f => !f.classLevel);
      return [...levelFiles, ...legacy];
    }
    return levelFiles;
  };

  return (
    <div className="p-3 md:p-6">
      <div className="mb-4 md:mb-6">
        <h3 className="text-lg font-bold text-gray-800">커리큘럼</h3>
        <p className="text-sm text-gray-500">반별 커리큘럼을 업로드하고 관리하세요. 파일을 드래그하여 업로드하거나, 커리큘럼 간 드래그로 순서를 변경할 수 있습니다.</p>
      </div>

      <div className="space-y-8">
        {CLASS_LEVELS.map(({ level, label, color, bgColor, borderColor }) => {
          const allFiles = getFilesForLevel(level);
          const sorted = sortFiles(allFiles);
          const currentFile = sorted[0] || null;
          const pastFiles = sorted.slice(1);
          const isFileDragging = fileDraggingLevel === level;
          const isCurrentDropTarget = dropOnCurrent === level;

          return (
            <div key={level} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Section Header */}
              <div className={`flex items-center justify-between px-5 py-3 ${bgColor} border-b ${borderColor}`}>
                <h4 className={`text-sm font-bold ${color}`}>
                  {label}
                  {allFiles.length > 0 && <span className="ml-2 text-xs font-normal opacity-70">{allFiles.length}개</span>}
                </h4>
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
                onDragOver={e => handleExternalDragOver(e, level)}
                onDragLeave={handleExternalDragLeave}
                onDrop={e => handleExternalDrop(e, level)}
                className={`p-4 transition-colors min-h-[120px] ${
                  isFileDragging ? `${bgColor} border-2 border-dashed ${borderColor}` : ''
                }`}
              >
                {isFileDragging && !dragSourceId ? (
                  <div className="flex items-center justify-center h-24">
                    <p className={`text-sm font-medium ${color}`}>여기에 파일을 놓으세요</p>
                  </div>
                ) : allFiles.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => fileInputRefs.current[level]?.click()}
                  >
                    <div className="text-2xl mb-2 opacity-40">📂</div>
                    <p className="text-xs text-gray-400">이미지 또는 PDF를 드래그하거나 클릭하여 업로드</p>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Current (latest) curriculum - large display, also a drop target */}
                    <div
                      className={`flex-1 min-w-0 rounded-lg transition-all ${
                        isCurrentDropTarget && dragSourceId !== currentFile?.id
                          ? 'ring-2 ring-indigo-400 ring-offset-2'
                          : ''
                      }`}
                      onDragOver={e => handleCurrentDropZone(e, level)}
                      onDragLeave={handleCurrentDropZoneLeave}
                      onDrop={e => handleDropOnItem(e, level, null)}
                    >
                      {currentFile && (
                        <div
                          className={`group relative border border-gray-200 rounded-lg overflow-hidden transition-opacity ${
                            dragSourceId === currentFile.id ? 'opacity-40' : ''
                          }`}
                          draggable
                          onDragStart={e => handleItemDragStart(e, currentFile.id)}
                          onDragEnd={handleItemDragEnd}
                        >
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${borderColor} border ${bgColor} ${color}`}>
                                현재
                              </span>
                              <span className="text-xs font-medium text-gray-700 truncate">{currentFile.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                                currentFile.type === 'image' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                              }`}>
                                {currentFile.type === 'image' ? 'IMG' : 'PDF'}
                              </span>
                              <span className="text-[10px] text-gray-400 cursor-grab active:cursor-grabbing ml-1">&#x2630;</span>
                            </div>
                            <button
                              onClick={() => {
                                if (confirm(`"${currentFile.name}" 파일을 삭제하시겠습니까?`)) deleteCurriculumFile(currentFile.id);
                              }}
                              className="text-[10px] text-red-500 hover:text-red-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                            >
                              삭제
                            </button>
                          </div>
                          {currentFile.type === 'image' ? (
                            <div
                              className="cursor-pointer overflow-hidden"
                              onClick={() => setZoomedFile(currentFile)}
                            >
                              <img
                                src={getDataUrl(currentFile)}
                                alt={currentFile.name}
                                className="w-full max-h-[500px] object-contain bg-gray-50 transition-transform duration-300 hover:scale-105"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).parentElement!.innerHTML =
                                    '<div class="flex items-center justify-center h-48 text-sm text-gray-400">이미지를 불러올 수 없습니다</div>';
                                }}
                              />
                            </div>
                          ) : (
                            <div className="cursor-pointer" onClick={() => setZoomedFile(currentFile)}>
                              <iframe
                                src={getDataUrl(currentFile)}
                                title={currentFile.name}
                                className="w-full h-[400px] pointer-events-none"
                              />
                            </div>
                          )}
                          <div className="px-3 py-1.5 text-[10px] text-gray-400">
                            {format(new Date(currentFile.createdAt), 'yyyy.MM.dd', { locale: ko })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Past curricula - horizontal scroll on mobile, vertical stack on desktop */}
                    {pastFiles.length > 0 && (
                      <div className="md:w-36 shrink-0 flex flex-col gap-2">
                        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-1">지난 커리큘럼</div>
                        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:max-h-[500px] pb-2 md:pb-0 md:pr-1">
                          {pastFiles.map(file => (
                            <div
                              key={file.id}
                              className={`group/past relative border rounded-lg overflow-hidden cursor-pointer transition-all shrink-0 w-28 md:w-auto ${
                                dragSourceId === file.id
                                  ? 'opacity-40 border-gray-200'
                                  : dropTargetId === file.id
                                  ? 'border-indigo-400 ring-2 ring-indigo-300 ring-offset-1'
                                  : 'border-gray-200 hover:border-gray-400'
                              }`}
                              draggable
                              onDragStart={e => handleItemDragStart(e, file.id)}
                              onDragEnd={handleItemDragEnd}
                              onDragOver={e => handlePastItemDragOver(e, file.id)}
                              onDragLeave={handlePastItemDragLeave}
                              onDrop={e => handleDropOnItem(e, level, file.id)}
                              onClick={() => setZoomedFile(file)}
                            >
                              {file.type === 'image' ? (
                                <img
                                  src={getDataUrl(file)}
                                  alt={file.name}
                                  className="w-full h-20 object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-full h-20 bg-gray-100 flex items-center justify-center">
                                  <span className="text-[10px] text-red-500 font-medium">PDF</span>
                                </div>
                              )}
                              <div className="px-1.5 py-1 bg-white border-t border-gray-100 flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 cursor-grab active:cursor-grabbing">&#x2630;</span>
                                <div className="min-w-0">
                                  <div className="text-[9px] text-gray-600 truncate">{file.name}</div>
                                  <div className="text-[9px] text-gray-400">
                                    {format(new Date(file.createdAt), 'yy.MM.dd', { locale: ko })}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`"${file.name}" 파일을 삭제하시겠습니까?`)) deleteCurriculumFile(file.id);
                                }}
                                className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover/past:opacity-100 transition-opacity"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
          className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-2 md:p-4 cursor-pointer"
          onClick={() => setZoomedFile(null)}
        >
          <div className="flex items-center justify-between w-full max-w-[95vw] px-1 mb-2">
            <div className="text-white text-xs md:text-sm font-medium truncate max-w-[70%]">
              {zoomedFile.name}
            </div>
            <button
              onClick={() => setZoomedFile(null)}
              className="text-white text-sm font-medium hover:text-gray-300 flex items-center gap-1 shrink-0"
            >
              닫기 ✕
            </button>
          </div>
          <div className="relative max-w-[95vw] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()} style={{ WebkitOverflowScrolling: 'touch' }}>
            {zoomedFile.type === 'image' ? (
              <img
                src={getDataUrl(zoomedFile)}
                alt={zoomedFile.name}
                className="max-w-full md:max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <iframe
                src={getDataUrl(zoomedFile)}
                title={zoomedFile.name}
                className="w-[95vw] md:w-[90vw] h-[85vh] rounded-lg bg-white"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
