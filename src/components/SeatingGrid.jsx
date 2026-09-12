import React from 'react';
import SeatCard from './SeatCard';

export default function SeatingGrid({
  seats,
  students,
  rows,
  cols,
  viewMode,
  isShuffling,
  justSettled,
  swapSourceId,
  onToggleLock,
  onToggleDisable,
  onSelectForSwap,
  onCardClick,
}) {
  // 학생 ID로 학생 객체 빠른 조회를 위한 Map
  const studentMap = new Map();
  students.forEach((s) => studentMap.set(s.id, s));

  // 시점에 따른 좌석 순서 계산
  // 교사용 시점: row 0 -> rows-1, col 0 -> cols-1
  // 학생 시점: row 0 -> rows-1, col cols-1 -> 0 (좌우 반전)
  const orderedSeats = [];

  for (let r = 0; r < rows; r++) {
    if (viewMode === 'teacher') {
      for (let c = 0; c < cols; c++) {
        const found = seats.find((s) => s.row === r && s.col === c);
        if (found) orderedSeats.push(found);
      }
    } else {
      // 학생 시점: 좌우 반전
      for (let c = cols - 1; c >= 0; c--) {
        const found = seats.find((s) => s.row === r && s.col === c);
        if (found) orderedSeats.push(found);
      }
    }
  }

  return (
    <div className="grid-wrapper">
      <div
        className="seating-grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(120px, 1fr))`,
        }}
      >
        {orderedSeats.map((seat) => {
          const student = seat.studentId ? studentMap.get(seat.studentId) || null : null;
          const isSwapSource = swapSourceId === seat.id;
          const isSwapTargetPossible = swapSourceId !== null && !isSwapSource;

          // 시점 기준 분단/열 번호 표시
          const viewRow = seat.row + 1;
          const viewCol = viewMode === 'teacher' ? seat.col + 1 : cols - seat.col;

          return (
            <SeatCard
              key={seat.id}
              seat={seat}
              student={student}
              isShuffling={isShuffling}
              justSettled={justSettled}
              isSwapSource={isSwapSource}
              isSwapTargetPossible={isSwapTargetPossible}
              onToggleLock={onToggleLock}
              onToggleDisable={onToggleDisable}
              onSelectForSwap={onSelectForSwap}
              onCardClick={onCardClick}
              viewRow={viewRow}
              viewCol={viewCol}
            />
          );
        })}
      </div>
    </div>
  );
}
