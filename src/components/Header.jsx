import React from 'react';
import { LayoutGrid, Printer, RotateCcw, Copy, Eye, Users } from 'lucide-react';

export default function Header({
  viewMode,
  setViewMode,
  onPrint,
  onReset,
  onCopyText,
  totalStudents,
  lockedCount,
}) {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-icon-box">
          <LayoutGrid size={22} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h1 className="brand-title">학급 자리 배치 도우미</h1>
            <span className="brand-badge">교사용</span>
          </div>
        </div>
      </div>

      <div className="header-actions">
        {/* Perspective Switcher */}
        <div className="perspective-toggle" title="시점 변경 (교탁 기준 vs 학생 칠판 기준)">
          <button
            type="button"
            className={`perspective-btn ${viewMode === 'teacher' ? 'active' : ''}`}
            onClick={() => setViewMode('teacher')}
          >
            <Eye size={15} />
            선생님 시점
          </button>
          <button
            type="button"
            className={`perspective-btn ${viewMode === 'student' ? 'active' : ''}`}
            onClick={() => setViewMode('student')}
          >
            <Users size={15} />
            학생 시점 (반전)
          </button>
        </div>

        {/* Action Buttons */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCopyText}
          title="배치표 텍스트 복사 (메신저나 알림장 공유용)"
        >
          <Copy size={16} />
          <span>텍스트 복사</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onPrint}
          title="배치표 A4 인쇄"
        >
          <Printer size={16} />
          <span>인쇄하기</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onReset}
          title="기본 설정으로 초기화"
        >
          <RotateCcw size={16} />
          <span>초기화</span>
        </button>
      </div>
    </header>
  );
}
