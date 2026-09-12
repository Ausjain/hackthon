import React from 'react';
import { Shuffle, UserCheck, Lock, Users, Plus, Minus, FileEdit } from 'lucide-react';

export default function ControlBar({
  rows,
  cols,
  totalStudents,
  onRowsChange,
  onColsChange,
  onTotalStudentsChange,
  onOpenStudentModal,
  onShuffle,
  isShuffling,
  lockedCount,
  totalSeats,
}) {
  return (
    <div className="control-panel no-print">
      <div className="control-group-left">
        {/* 행 설정 */}
        <div className="control-item">
          <span className="control-label">행 (가로 줄)</span>
          <div className="stepper">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => onRowsChange(rows - 1)}
              disabled={rows <= 2 || isShuffling}
              title="1행 감소"
            >
              <Minus size={14} />
            </button>
            <span className="stepper-val">{rows}행</span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => onRowsChange(rows + 1)}
              disabled={rows >= 8 || isShuffling}
              title="1행 증가"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* 열 설정 */}
        <div className="control-item">
          <span className="control-label">열 (세로 줄)</span>
          <div className="stepper">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => onColsChange(cols - 1)}
              disabled={cols <= 2 || isShuffling}
              title="1열 감소"
            >
              <Minus size={14} />
            </button>
            <span className="stepper-val">{cols}열</span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => onColsChange(cols + 1)}
              disabled={cols >= 8 || isShuffling}
              title="1열 증가"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* 학생 수 설정 */}
        <div className="control-item">
          <span className="control-label">학생 수</span>
          <div className="stepper">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => onTotalStudentsChange(totalStudents - 1)}
              disabled={totalStudents <= 1 || isShuffling}
              title="1명 감소"
            >
              <Minus size={14} />
            </button>
            <span className="stepper-val">{totalStudents}명</span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => onTotalStudentsChange(totalStudents + 1)}
              disabled={totalStudents >= rows * cols || isShuffling}
              title="1명 증가"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="control-divider" />

        {/* 명단 관리 버튼 */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenStudentModal}
          disabled={isShuffling}
          title="학생 이름 및 번호 일괄 편집"
        >
          <FileEdit size={16} />
          <span>명단 관리</span>
        </button>

        {/* 상태 뱃지들 */}
        <div className="stats-badges">
          <div className="stat-pill" title="전체 생성된 책상 수">
            <Users size={14} />
            <span>총 {totalSeats}석</span>
          </div>

          {lockedCount > 0 && (
            <div className="stat-pill locked" title="랜덤 배치 시 위치가 고정되는 좌석">
              <Lock size={13} />
              <span>{lockedCount}석 고정됨</span>
            </div>
          )}
        </div>
      </div>

      {/* 메인 무작위 셔플 버튼 */}
      <button
        type="button"
        className={`btn-shuffle ${isShuffling ? 'shuffling' : ''}`}
        onClick={onShuffle}
        disabled={isShuffling}
      >
        <Shuffle size={18} className={isShuffling ? 'spin-icon' : ''} />
        <span>{isShuffling ? '자리 배치하는 중...' : '자리 무작위 섞기'}</span>
      </button>
    </div>
  );
}
