import { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAppStore } from '../../store/StoreContext';
import type { MessageTemplate } from '../../types';
import Modal from '../common/Modal';

const CATEGORIES = ['수업 안내', '결제 안내', '휴원 안내', '보강 안내', '체험 안내', '기타'];

export default function MessageTemplates() {
  const { messageTemplates, addMessageTemplate, updateMessageTemplate, deleteMessageTemplate } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]);

  const openNewForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormCategory(CATEGORIES[0]);
    setEditingTemplate(null);
    setShowForm(true);
  };

  const openEditForm = (template: MessageTemplate) => {
    setFormTitle(template.title);
    setFormContent(template.content);
    setFormCategory(template.category);
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formTitle.trim() || !formContent.trim()) return;

    if (editingTemplate) {
      updateMessageTemplate(editingTemplate.id, {
        title: formTitle.trim(),
        content: formContent.trim(),
        category: formCategory,
      });
    } else {
      addMessageTemplate({
        title: formTitle.trim(),
        content: formContent.trim(),
        category: formCategory,
      });
    }
    setShowForm(false);
  };

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = messageTemplates.filter(t => {
    const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
    const matchesSearch = !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">메시지 양식</h3>
          <p className="text-sm text-gray-500">카카오톡 발송용 메시지 양식을 저장하고 관리하세요.</p>
        </div>
        <button
          onClick={openNewForm}
          className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
        >
          + 양식 추가
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
            filterCategory === 'all' ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          전체 ({messageTemplates.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = messageTemplates.filter(t => t.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                filterCategory === cat ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="제목 또는 내용으로 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-300 focus:border-yellow-400 outline-none"
        />
        {searchQuery && (
          <p className="text-xs text-gray-400 mt-1">
            검색 결과: {sorted.length}건
          </p>
        )}
      </div>

      {/* Templates list */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-3xl mb-3 opacity-30">💬</div>
          <p className="text-sm text-gray-400">저장된 양식이 없습니다.</p>
          <button onClick={openNewForm} className="mt-3 text-sm text-yellow-600 hover:text-yellow-700 font-medium">
            첫 양식 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map(template => (
            <div key={template.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium shrink-0">
                    {template.category}
                  </span>
                  <span className="text-sm font-medium text-gray-800 truncate">{template.title}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(template.content, template.id)}
                    className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                      copiedId === template.id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {copiedId === template.id ? '복사됨' : '복사'}
                  </button>
                  <button
                    onClick={() => openEditForm(template)}
                    className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`"${template.title}" 양식을 삭제하시겠습니까?`)) deleteMessageTemplate(template.id);
                    }}
                    className="text-[10px] px-2 py-1 rounded bg-gray-100 text-red-500 hover:bg-red-50 font-medium"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="px-4 py-3">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-[200px] overflow-y-auto">
                  {template.content}
                </pre>
              </div>
              <div className="px-4 py-2 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  {format(new Date(template.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}
                </span>
                <button
                  onClick={() => handleCopy(template.content, template.id)}
                  className="text-xs text-yellow-600 hover:text-yellow-700 font-medium"
                >
                  {copiedId === template.id ? '클립보드에 복사됨' : '클립보드 복사'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingTemplate ? '양식 수정' : '새 양식 추가'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFormCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    formCategory === cat ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="예: 수업 시작 안내"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-300 focus:border-yellow-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메시지 내용</label>
            <textarea
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
              placeholder={"안녕하세요, 서초아이미술입니다.\n\n..."}
              rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-yellow-300 focus:border-yellow-400 outline-none"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              {formContent.length}자
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!formTitle.trim() || !formContent.trim()}
              className="flex-1 bg-yellow-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            >
              {editingTemplate ? '수정' : '저장'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
