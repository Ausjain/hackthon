import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import Header from './components/Header';
import ControlBar from './components/ControlBar';
import ClassroomBoard from './components/ClassroomBoard';
import SeatingGrid from './components/SeatingGrid';
import StudentListModal from './components/StudentListModal';
import SeatDetailModal from './components/SeatDetailModal';
import {
  createDefaultStudents,
  createInitialSeats,
  shuffleSeatsWithLocks,
  swapSeats,
  toggleSeatLock,
  toggleSeatDisabled,
  assignStudentToSeat,
} from './utils/seatingLogic';
import { loadSeatingData, saveSeatingData, clearSeatingData } from './utils/storage';
import { ArrowLeftRight, X } from 'lucide-react';

export default function App() {
  // 1. 상태 초기화 (로컬스토리지 우선 로드)
  const savedData = loadSeatingData();

  const [rows, setRows] = useState(savedData?.rows || 4);
  const [cols, setCols] = useState(savedData?.cols || 6);
  const [totalStudents, setTotalStudents] = useState(savedData?.totalStudents || 24);
  const [viewMode, setViewMode] = useState(savedData?.viewMode || 'teacher');

  const [students, setStudents] = useState(() => {
    if (savedData?.students && savedData.students.length > 0) {
      return savedData.students;
    }
    return createDefaultStudents(24);
  });

  const [seats, setSeats] = useState(() => {
    if (savedData?.seats && savedData.seats.length > 0) {
      return savedData.seats;
    }
    const defaultStudents = createDefaultStudents(24);
    return createInitialSeats(4, 6, defaultStudents);
  });

  // UI 인터랙션 상태
  const [isShuffling, setIsShuffling] = useState(false);
  const [justSettled, setJustSettled] = useState(false);
  const [swapSourceId, setSwapSourceId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [detailSeatId, setDetailSeatId] = useState(null);

  const toastTimeoutRef = useRef(null);

  // 2. 로컬스토리지 동기화
  useEffect(() => {
    saveSeatingData({
      rows,
      cols,
      totalStudents,
      viewMode,
      students,
      seats,
    });
  }, [rows, cols, totalStudents, viewMode, students, seats]);

  // 토스트 알림 띄우기 유틸
  const showToast = (msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // 행 변경 핸들러
  const handleRowsChange = (newRows) => {
    if (newRows < 2 || newRows > 8) return;
    setRows(newRows);
    rebuildGrid(newRows, cols, students);
  };

  // 열 변경 핸들러
  const handleColsChange = (newCols) => {
    if (newCols < 2 || newCols > 8) return;
    setCols(newCols);
    rebuildGrid(rows, newCols, students);
  };

  // 그리드 크기 변경 시 기존 좌석 및 학생 배치 최대한 보존하며 재생성
  const rebuildGrid = (nextRows, nextCols, currentStudents) => {
    const nextSeats = [];
    const existingMap = new Map();
    seats.forEach((s) => existingMap.set(`${s.row}-${s.col}`, s));

    let studentIdx = 0;
    for (let r = 0; r < nextRows; r++) {
      for (let c = 0; c < nextCols; c++) {
        const key = `${r}-${c}`;
        const existing = existingMap.get(key);

        if (existing) {
          nextSeats.push(existing);
        } else {
          // 새로 추가된 좌석
          const student = studentIdx < currentStudents.length ? currentStudents[studentIdx] : null;
          nextSeats.push({
            id: `seat-${r}-${c}`,
            row: r,
            col: c,
            studentId: student ? student.id : null,
            isLocked: false,
            isDisabled: false,
          });
        }
        studentIdx++;
      }
    }
    setSeats(nextSeats);
    showToast(`교실 구조가 ${nextRows}행 × ${nextCols}열로 조정되었습니다.`);
  };

  // 학생 수 증감 핸들러
  const handleTotalStudentsChange = (newCount) => {
    if (newCount < 1 || newCount > rows * cols) return;
    setTotalStudents(newCount);

    let updatedStudents = [...students];
    if (newCount > students.length) {
      // 추가된 학생들 생성
      for (let i = students.length + 1; i <= newCount; i++) {
        updatedStudents.push({
          id: i,
          number: i,
          name: `${i}번`,
        });
      }
    } else {
      // 줄어든 학생들 자르고, 해당 학생이 배정된 좌석 비우기
      const validIds = new Set(updatedStudents.slice(0, newCount).map((s) => s.id));
      updatedStudents = updatedStudents.slice(0, newCount);
      setSeats((prev) =>
        prev.map((seat) => (seat.studentId && !validIds.has(seat.studentId) ? { ...seat, studentId: null, isLocked: false } : seat))
      );
    }
    setStudents(updatedStudents);
    showToast(`학생 수가 ${newCount}명으로 설정되었습니다.`);
  };

  // 좌석 고정(Lock) 토글
  const handleToggleLock = (seatId) => {
    const updated = toggleSeatLock(seats, seatId);
    setSeats(updated);
    const target = updated.find((s) => s.id === seatId);
    showToast(target.isLocked ? '좌석이 고정되었습니다. (셔플 시 위치 유지)' : '좌석 고정이 해제되었습니다.');
  };

  // 좌석 사용 안함/통로 토글
  const handleToggleDisable = (seatId) => {
    const updated = toggleSeatDisabled(seats, seatId);
    setSeats(updated);
    const target = updated.find((s) => s.id === seatId);
    showToast(target.isDisabled ? '해당 좌석이 통로(공석)로 설정되었습니다.' : '좌석이 책상으로 복원되었습니다.');
  };

  // 맞바꾸기(Swap) 선택 처리
  const handleSelectForSwap = (seatId) => {
    if (seatId === null) {
      setSwapSourceId(null);
      return;
    }

    if (!swapSourceId) {
      // 첫 번째 좌석 선택
      setSwapSourceId(seatId);
      showToast('자리 바꿀 대상 좌석을 선택하세요.');
    } else {
      // 두 번째 좌석 선택 -> 스왑 실행
      const nextSeats = swapSeats(seats, swapSourceId, seatId);
      setSeats(nextSeats);
      setSwapSourceId(null);
      showToast('두 좌석의 학생이 성공적으로 맞바뀌었습니다.');
    }
  };

  // 좌석 카드 클릭 -> 상세 모달 열기
  const handleCardClick = (seat) => {
    setDetailSeatId(seat.id);
  };

  // 개별 좌석에 학생 직접 지정
  const handleAssignStudent = (seatId, studentId) => {
    const updated = assignStudentToSeat(seats, seatId, studentId);
    setSeats(updated);
    showToast('좌석 배정이 변경되었습니다.');
  };

  // 학생 명단 모달에서 일괄 저장
  const handleSaveStudents = (newStudentsList) => {
    setStudents(newStudentsList);
    setTotalStudents(newStudentsList.length);

    // 새 학생 ID 세트
    const newStudentIds = new Set(newStudentsList.map((s) => s.id));
    setSeats((prev) =>
      prev.map((seat) => (seat.studentId && !newStudentIds.has(seat.studentId) ? { ...seat, studentId: null, isLocked: false } : seat))
    );
    showToast(`${newStudentsList.length}명의 학생 명단이 저장되었습니다.`);
  };

  // ★ 무작위 자리 섞기 (랜덤 셔플)
  const handleShuffle = () => {
    if (isShuffling) return;

    setIsShuffling(true);
    setSwapSourceId(null);

    // 셔플 애니메이션 느낌을 주기 위한 가벼운 시각적 딜레이
    setTimeout(() => {
      const nextSeats = shuffleSeatsWithLocks(seats, students);
      setSeats(nextSeats);
      setIsShuffling(false);
      setJustSettled(true);

      // 경쾌한 완료 콘페티 효과
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#3b82f6', '#60a5fa', '#10b981', '#f59e0b'],
      });

      showToast('고정석을 유지하며 모든 자리가 공정하게 섞였습니다!');

      setTimeout(() => {
        setJustSettled(false);
      }, 700);
    }, 600);
  };

  // 전체 초기화
  const handleReset = () => {
    if (window.confirm('모든 자리 배치와 고정 설정을 기본값(24명, 4행 6열)으로 초기화하시겠습니까?')) {
      clearSeatingData();
      const defaultRows = 4;
      const defaultCols = 6;
      const defaultCount = 24;
      const defaultStudents = createDefaultStudents(defaultCount);
      const defaultSeats = createInitialSeats(defaultRows, defaultCols, defaultStudents);

      setRows(defaultRows);
      setCols(defaultCols);
      setTotalStudents(defaultCount);
      setStudents(defaultStudents);
      setSeats(defaultSeats);
      setViewMode('teacher');
      setSwapSourceId(null);
      showToast('초기 상태로 되돌렸습니다.');
    }
  };

  // 텍스트 형태로 클립보드 복사
  const handleCopyText = () => {
    const studentMap = new Map();
    students.forEach((s) => studentMap.set(s.id, s));

    let text = `[학급 자리 배치표]\n`;
    text += `* 기준: ${viewMode === 'teacher' ? '선생님 시점 (교탁 앞)' : '학생 시점 (칠판 마주봄)'}\n`;
    text += `* 규격: ${rows}행 × ${cols}열 (총 ${students.length}명)\n`;
    text += `==============================\n`;
    text += `       [ 칠 판 / 교 탁 ]\n`;
    text += `==============================\n`;

    for (let r = 0; r < rows; r++) {
      text += `${r + 1}행: `;
      const rowSeats = [];
      if (viewMode === 'teacher') {
        for (let c = 0; c < cols; c++) {
          const seat = seats.find((s) => s.row === r && s.col === c);
          rowSeats.push(seat);
        }
      } else {
        for (let c = cols - 1; c >= 0; c--) {
          const seat = seats.find((s) => s.row === r && s.col === c);
          rowSeats.push(seat);
        }
      }

      const rowText = rowSeats
        .map((s) => {
          if (!s || s.isDisabled) return '[ 통로 ]';
          if (!s.studentId) return '[ 빈자리 ]';
          const st = studentMap.get(s.studentId);
          return `[${st ? st.name : '학생'}${s.isLocked ? '🔒' : ''}]`;
        })
        .join(' ');

      text += `${rowText}\n`;
    }

    navigator.clipboard.writeText(text).then(
      () => {
        showToast('배치표 텍스트가 클립보드에 복사되었습니다.');
      },
      () => {
        showToast('클립보드 복사에 실패했습니다.');
      }
    );
  };

  // 인쇄
  const handlePrint = () => {
    window.print();
  };

  // 고정된 좌석 개수 계산
  const lockedCount = seats.filter((s) => s.isLocked && !s.isDisabled).length;
  const currentDetailSeat = detailSeatId ? seats.find((s) => s.id === detailSeatId) : null;

  return (
    <div className="app-container">
      {/* 상단 헤더 */}
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        onPrint={handlePrint}
        onReset={handleReset}
        onCopyText={handleCopyText}
        totalStudents={students.length}
        lockedCount={lockedCount}
      />

      <main className="main-content">
        {/* 인쇄 시 전용 상단 타이틀 */}
        <div className="print-header-info">
          <h2>학급 자리 배치표</h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>
            {viewMode === 'teacher' ? '선생님 시점 (교탁 앞 기준)' : '학생 시점 (칠판 기준)'} · 총 {students.length}명
          </p>
        </div>

        {/* 상단 컨트롤 바 */}
        <ControlBar
          rows={rows}
          cols={cols}
          totalStudents={totalStudents}
          onRowsChange={handleRowsChange}
          onColsChange={handleColsChange}
          onTotalStudentsChange={handleTotalStudentsChange}
          onOpenStudentModal={() => setIsStudentModalOpen(true)}
          onShuffle={handleShuffle}
          isShuffling={isShuffling}
          lockedCount={lockedCount}
          totalSeats={rows * cols}
        />

        {/* 맞바꾸기(Swap) 모드 안내 배너 */}
        {swapSourceId && (
          <div className="swap-notice-bar no-print">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowLeftRight size={18} />
              <span>
                <strong>좌석 맞바꾸기 진행 중:</strong> 변경할 두 번째 좌석 카드를 클릭하세요.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              onClick={() => setSwapSourceId(null)}
            >
              <X size={14} /> 취소
            </button>
          </div>
        )}

        {/* 교실 무대 (칠판 및 좌석 그리드) */}
        <section className="classroom-stage">
          <ClassroomBoard viewMode={viewMode} />

          <SeatingGrid
            seats={seats}
            students={students}
            rows={rows}
            cols={cols}
            viewMode={viewMode}
            isShuffling={isShuffling}
            justSettled={justSettled}
            swapSourceId={swapSourceId}
            onToggleLock={handleToggleLock}
            onToggleDisable={handleToggleDisable}
            onSelectForSwap={handleSelectForSwap}
            onCardClick={handleCardClick}
          />
        </section>
      </main>

      {/* 모달: 학생 명단 일괄 편집 */}
      <StudentListModal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
        students={students}
        onSaveStudents={handleSaveStudents}
        totalCapacity={rows * cols}
      />

      {/* 모달: 개별 좌석 상세 설정 */}
      <SeatDetailModal
        isOpen={detailSeatId !== null}
        onClose={() => setDetailSeatId(null)}
        seat={currentDetailSeat}
        students={students}
        allSeats={seats}
        onAssignStudent={handleAssignStudent}
        onToggleLock={handleToggleLock}
        onToggleDisable={handleToggleDisable}
      />

      {/* 토스트 알림창 */}
      {toastMessage && (
        <div className="toast-container no-print">
          <div className="toast">{toastMessage}</div>
        </div>
      )}
    </div>
  );
}
