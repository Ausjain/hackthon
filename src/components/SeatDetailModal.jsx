import React, { useState } from 'react';
import { X, Lock, Unlock, UserCheck, Ban, Check, UserMinus } from 'lucide-react';

export default function SeatDetailModal({
  isOpen,
  onClose,
  seat,
  students,
  allSeats,
  onAssignStudent,
  onToggleLock,
  onToggleDisable,
}) {
  if (!isOpen || !seat) return null;

  const currentStudent = seat.studentId ? students.find((s) => s.id === seat.studentId) : null;
  const [selectedStudentId, setSelectedStudentId] = useState(seat.studentId);

  // 이미 다른 좌석에 배정되어 있는 학생 목록 파악
  const assignedStudentIdToSeat = new Map();
  allSeats.forEach((s) => {
    if (s.studentId && s.id !== seat.id) {
      assignedStudentIdToSeat.set(s.studentId, s);
    }
  });

  const handleSave = () => {
    onAssignStudent(seat.id, selectedStudentId);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={20} color="var(--primary)" />
            <h2 className="modal-title">
              좌석 설정 ({seat.row + 1}행 {seat.col + 1}열)
            </h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* 학생 선택 섹션 */}
          <div className="control-item">
            <label className="control-label">배정할 학생 선택</label>
            <select
              className="form-textarea"
              style={{ minHeight: '44px', height: '44px', padding: '0.5rem 0.75rem' }}
              value={selectedStudentId === null ? '' : selectedStudentId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedStudentId(val === '' ? null : Number(val));
              }}
              disabled={seat.isDisabled}
            >
              <option value="">-- 빈 자리 (미배정) --</option>
              {students.map((student) => {
                const otherSeat = assignedStudentIdToSeat.get(student.id);
                const isCurrent = seat.studentId === student.id;
                return (
                  <option key={student.id} value={student.id}>
                    {student.name} (번호 {student.number})
                    {isCurrent ? ' [현재 좌석]' : otherSeat ? ` [${otherSeat.row + 1}행 ${otherSeat.col + 1}열에 배정됨]` : ''}
                  </option>
                );
              })}
            </select>
            <span className="helper-text">
              이미 다른 좌석에 배정된 학생을 선택하면 해당 좌석의 학생이 이 자리로 이동합니다.
            </span>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '0.5rem 0' }} />

          {/* 좌석 제어 토글 옵션 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* 고정 상태 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: seat.isLocked ? 'var(--accent-lock-bg)' : 'var(--bg-secondary)',
                border: `1px solid ${seat.isLocked ? 'var(--accent-lock-border)' : 'var(--border-subtle)'}`,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: seat.isLocked ? 'var(--accent-lock)' : 'var(--text-primary)' }}>
                  {seat.isLocked ? '🔒 좌석 고정됨' : '🔓 좌석 미고정'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  랜덤 섞기 실행 시 이 좌석의 학생을 이동시키지 않고 고정합니다.
                </div>
              </div>
              <button
                type="button"
                className={`btn ${seat.isLocked ? 'btn-secondary' : 'btn-primary'}`}
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                onClick={() => onToggleLock(seat.id)}
                disabled={seat.isDisabled}
              >
                {seat.isLocked ? '고정 해제' : '자리 고정'}
              </button>
            </div>

            {/* 통로/책상 제외 여부 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: seat.isDisabled ? 'var(--bg-secondary)' : 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {seat.isDisabled ? '🚫 통로 / 사용 안 함' : '🪑 일반 책상'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {seat.isDisabled ? '현재 학생이 앉지 않는 빈 공간입니다.' : '책상을 제외하여 통로나 여백으로 설정할 수 있습니다.'}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                onClick={() => onToggleDisable(seat.id)}
              >
                {seat.isDisabled ? '책상으로 복원' : '통로로 설정'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            <Check size={16} />
            <span>저장하기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
