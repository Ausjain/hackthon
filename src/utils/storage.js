/**
 * 로컬스토리지 저장 및 불러오기 유틸
 */

const STORAGE_KEY = 'classroom_seating_data_v1';

export function loadSeatingData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load data from localStorage:', err);
    return null;
  }
}

export function saveSeatingData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save data to localStorage:', err);
  }
}

export function clearSeatingData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear data from localStorage:', err);
  }
}
