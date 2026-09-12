import React from 'react';
import { Lock, Unlock, ArrowLeftRight, Ban, CheckCircle2 } from 'lucide-react';

export default function SeatCard({
  seat,
  student,
  isShuffling,
  justSettled,
  isSwapSource,
  isSwapTargetPossible,
  onToggleLock,
  onToggleDisable,
  onSelectForSwap,
  onCardClick,
  viewRow,
  viewCol,
}) {
  const isLocked = seat.isLocked;
  const isDisabled = seat.isDisabled;
  const hasStudent = student !== null && !isDisabled;

  // 카드 스타일 클래스
  const cardClasses = [
    'seat-card',
    isLocked ? 'locked' : '',
    isDisabled ? 'disabled' : '',
    !hasStudent && !isDisabled ? 'empty' : '',
    isSwapSource ? 'swap-selected' : '',
    isShuffling && !isLocked ? 'shuffling-card' : '',
    justSettled ? 'just-settled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleCardBodyClick = (e) => {
    e.stopPropagation();
    if (isShuffling) return;

    if (isSwapSource) {
      // 이미 본인이 스왑 시작점이면 취소
      onSelectForSwap(null);
    } else if (isSwapTargetPossible) {
      // 다른 좌석이 이미 스왑 소스로 선택되어 있다면 맞바꾸기 실행
      onSelectForSwap(seat.id);
    } else {
      // 일반 클릭: 좌석 상세/학생 배정 모달 열기
      onCardClick(seat);
    }
  };

  return (
    <div className={cardClasses}>
      {/* 상단 라인: 위치 태그 & 고정/비활성화 버튼 */}
      <div className="seat-top-row">
        <span className="seat-number-tag">
          {viewRow}분단 {viewCol}열
        </span>

        <div className="seat-actions-inline no-print">
          {/* 맞바꾸기 버튼 */}
          {!isDisabled && (
            <button
              type="button"
              className={`icon-btn ${isSwapSource ? 'active-swap' : ''}`}
              title={isSwapSource ? '맞바꾸기 선택 취소' : '다른 좌석과 자리 맞바꾸기'}
              onClick={(e) => {
                e.stopPropagation();
                onSelectForSwap(seat.id);
              }}
            >
              <ArrowLeftRight size={13} />
            </button>
          )}

          {/* 좌석 고정(Lock) 버튼 */}
          {!isDisabled && (
            <button
              type="button"
              className={`icon-btn ${isLocked ? 'active-lock' : ''}`}
              title={isLocked ? '고정 해제 (랜덤 섞기 대상에 포함)' : '좌석 고정 (랜덤 섞기 시 현재 위치 유지)'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(seat.id);
              }}
            >
              {isLocked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
          )}

          {/* 빈 책상/통로(사용 안 함) 토글 버튼 */}
          <button
            type="button"
            className="icon-btn"
            title={isDisabled ? '좌석 복원 (책상으로 사용)' : '책상 제외 (통로나 빈자리로 비워둠)'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDisable(seat.id);
            }}
          >
            <Ban size={13} />
          </button>
        </div>
      </div>

      {/* 카드 중앙: 학생 이름 및 번호 */}
      <div className="seat-body" onClick={handleCardBodyClick}>
        {isDisabled ? (
          <span className="empty-label">통로 / 공석</span>
        ) : hasStudent ? (
          <>
            <span className="student-name">{student.name}</span>
          </>
        ) : (
          <span className="empty-label">+ 빈 자리</span>
        )}
      </div>

      {/* 카드 하단: 상태 힌트 */}
      <div className="seat-footer">
        <span className="desk-pos">
          {hasStudent ? `학생 ID #${student.number}` : isDisabled ? '미배치' : '비어있음'}
        </span>
        {isLocked && !isDisabled && (
          <span style={{ color: 'var(--accent-lock)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Lock size={10} /> 고정됨
          </span>
        )}
      </div>
    </div>
  );
}
