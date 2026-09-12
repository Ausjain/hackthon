import React from 'react';
import { Presentation, DoorOpen, Sun } from 'lucide-react';

export default function ClassroomBoard({ viewMode }) {
  const isTeacherView = viewMode === 'teacher';

  return (
    <div className="classroom-board-container" style={{ width: '100%' }}>
      {/* 교실 주변 환경 인디케이터 (창문 / 복도문) */}
      <div className="room-edge-indicators no-print">
        <div className="edge-pill" title="창문 위치">
          <Sun size={14} color="#f59e0b" />
          <span>{isTeacherView ? '창문 (왼쪽)' : '복도 및 출입문 (왼쪽)'}</span>
        </div>

        <div className="edge-pill" title="출입문 위치">
          <DoorOpen size={14} color="#3b82f6" />
          <span>{isTeacherView ? '복도 및 출입문 (오른쪽)' : '창문 (오른쪽)'}</span>
        </div>
      </div>

      {/* 칠판 & 교탁 배너 */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <div className="board-banner">
          <div className="board-content">
            <Presentation size={20} />
            <span>칠 판 &nbsp;·&nbsp; 교 탁</span>
          </div>
          <div className="board-subtext">
            {isTeacherView
              ? '선생님 시점 : 교탁에서 학생들을 내려다보는 기준입니다'
              : '학생 시점 : 학생들이 칠판을 정면으로 바라보는 기준입니다 (좌우 반전)'}
          </div>
        </div>
      </div>
    </div>
  );
}
