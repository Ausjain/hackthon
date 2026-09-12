import React, { useState } from 'react';
import { X, Check, RefreshCw, UserPlus } from 'lucide-react';

export default function StudentListModal({
  isOpen,
  onClose,
  students,
  onSaveStudents,
  totalCapacity,
}) {
  if (!isOpen) return null;

  // 텍스트 영역에 줄바꿈 형태로 이름들을 표시
  const initialText = students.map((s) => s.name).join('\n');
  const [textValue, setTextValue] = useState(initialText);

  const parsedLines = textValue
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const handleSave = () => {
    // 줄바꿈 목록을 학생 객체 배열로 변환
    const newStudents = parsedLines.map((name, index) => ({
      id: index + 1,
      number: index + 1,
      name: name,
    }));

    onSaveStudents(newStudents);
    onClose();
  };

  const handleResetToNumbers = () => {
    const defaultCount = Math.max(parsedLines.length, 24);
    const lines = [];
    for (let i = 1; i <= defaultCount; i++) {
      lines.push(`${i}번`);
    }
    setTextValue(lines.join('\n'));
  };

  const handleLoadSampleNames = () => {
    const sampleNames = [
      '김민준', '이서연', '박도윤', '최서아', '정하준', '강하은',
      '조지호', '윤지우', '장서준', '임수아', '한예준', '오채원',
      '서유준', '신지원', '권시우', '황지안', '안은우', '송서현',
      '전도현', '홍다은', '문건우', '유하린', '백시후', '고예린'
    ];
    setTextValue(sampleNames.slice(0, Math.min(totalCapacity, 24)).join('\n'));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={20} color="var(--primary)" />
            <h2 className="modal-title">학생 명단 일괄 편집</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="helper-text">
            출석부나 엑셀에서 이름을 복사해 아래 상자에 붙여넣으세요. 한 줄에 학생 1명씩 입력되며, 위에서부터 1번부터 차례대로 번호가 부여됩니다.
          </p>

          <textarea
            className="form-textarea"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="김철수&#10;이영희&#10;박민수..."
            rows={10}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              입력된 학생 수: <strong style={{ color: 'var(--primary)' }}>{parsedLines.length}</strong>명
              {totalCapacity && ` (최대 책상 수: ${totalCapacity}석)`}
            </span>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                onClick={handleLoadSampleNames}
                title="테스트용 예시 이름 명단 넣기"
              >
                예시 이름 불러오기
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                onClick={handleResetToNumbers}
                title="1번~24번 형식으로 초기화"
              >
                <RefreshCw size={12} />
                기본 번호로 채우기
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={parsedLines.length === 0}
          >
            <Check size={16} />
            <span>명단 적용하기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
