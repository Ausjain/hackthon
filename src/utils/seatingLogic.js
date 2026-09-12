/**
 * 학급 자리 배치 로직 유틸리티
 */

// 기본 학생 목록 생성 (1번부터 count번까지)
export function createDefaultStudents(count = 24) {
  const list = [];
  for (let i = 1; i <= count; i++) {
    list.push({
      id: i,
      number: i,
      name: `${i}번`,
    });
  }
  return list;
}

// 초기 좌석 그리드 생성
export function createInitialSeats(rows = 4, cols = 6, students = []) {
  const seats = [];
  let studentIdx = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const student = studentIdx < students.length ? students[studentIdx] : null;
      seats.push({
        id: `seat-${r}-${c}`,
        row: r,
        col: c,
        studentId: student ? student.id : null,
        isLocked: false,
        isDisabled: false, // 결번/통로로 비워둔 자리 여부
      });
      studentIdx++;
    }
  }

  return seats;
}

// Fisher-Yates 무작위 셔플
function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 좌석 랜덤 셔플 (고정석 유지)
export function shuffleSeatsWithLocks(seats, students) {
  // 1. 고정된 좌석과 그 좌석에 배정된 학생 ID 파악
  const lockedStudentIds = new Set();
  seats.forEach((seat) => {
    if (seat.isLocked && !seat.isDisabled && seat.studentId !== null) {
      lockedStudentIds.add(seat.studentId);
    }
  });

  // 2. 셔플 대상 학생들 (고정되지 않은 학생들)
  const studentsToPlace = students.filter((s) => !lockedStudentIds.has(s.id));
  const shuffledStudents = fisherYatesShuffle(studentsToPlace);

  // 3. 배정 가능한 좌석 (고정되지 않고, 비활성화되지 않은 좌석)
  const assignableSeatIndices = [];
  seats.forEach((seat, idx) => {
    if (!seat.isLocked && !seat.isDisabled) {
      assignableSeatIndices.push(idx);
    }
  });

  // 4. 새로운 좌석 배열 생성
  const nextSeats = seats.map((seat) => ({ ...seat }));

  // 배정 가능한 좌석에 셔플된 학생 순차 배정
  let assignIdx = 0;
  for (const seatIndex of assignableSeatIndices) {
    if (assignIdx < shuffledStudents.length) {
      nextSeats[seatIndex].studentId = shuffledStudents[assignIdx].id;
      assignIdx++;
    } else {
      nextSeats[seatIndex].studentId = null; // 남은 자리는 빈자리
    }
  }

  return nextSeats;
}

// 두 좌석 간 학생 맞바꾸기(Swap)
export function swapSeats(seats, seatId1, seatId2) {
  const idx1 = seats.findIndex((s) => s.id === seatId1);
  const idx2 = seats.findIndex((s) => s.id === seatId2);

  if (idx1 === -1 || idx2 === -1) return seats;

  const nextSeats = seats.map((seat) => ({ ...seat }));
  const tempStudentId = nextSeats[idx1].studentId;
  nextSeats[idx1].studentId = nextSeats[idx2].studentId;
  nextSeats[idx2].studentId = tempStudentId;

  return nextSeats;
}

// 특정 좌석의 고정 상태 토글
export function toggleSeatLock(seats, seatId) {
  return seats.map((seat) => {
    if (seat.id === seatId) {
      // 학생이 없는 빈자리는 굳이 고정하지 않거나, 빈자리인 채로 고정 가능
      return { ...seat, isLocked: !seat.isLocked };
    }
    return seat;
  });
}

// 특정 좌석의 사용 여부 토글 (책상 제외/통로화)
export function toggleSeatDisabled(seats, seatId) {
  return seats.map((seat) => {
    if (seat.id === seatId) {
      const nextDisabled = !seat.isDisabled;
      return {
        ...seat,
        isDisabled: nextDisabled,
        // 비활성화되면 학생 배정 및 고정 해제
        studentId: nextDisabled ? null : seat.studentId,
        isLocked: nextDisabled ? false : seat.isLocked,
      };
    }
    return seat;
  });
}

// 좌석에 특정 학생 직접 지정
export function assignStudentToSeat(seats, seatId, studentId) {
  // 이미 다른 좌석에 해당 학생이 있다면 그 좌석은 null로 비우거나 맞바꿈
  return seats.map((seat) => {
    if (seat.id === seatId) {
      return { ...seat, studentId: studentId };
    }
    if (studentId !== null && seat.studentId === studentId) {
      return { ...seat, studentId: null, isLocked: false };
    }
    return seat;
  });
}
