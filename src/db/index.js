import Dexie from 'dexie';
import { deleteImageFromOpfs } from './opfs.js';

// IndexedDB 데이터베이스 초기화
export const db = new Dexie('MojiDatabase');

// 데이터베이스 스키마 정의
// charId: 수집 대상 글자 ('あ', '酒' 등)
// id: 자동 증가 고유 PK
// createdAt: 촬영/수집 시간
db.version(1).stores({ // 스키마에 address 필드 추가
  collections: '++id, charId, createdAt, lat, lng, address, isNight'
});

/**
 * 수집한 간판 글자 아이템 메타데이터 추가
 * @param {Object} itemData - 수집 데이터 객체
 * @returns {Promise<number>} 생성된 ID 값
 */
export async function addCollectionItem({
  createdAt,      // 생성 시각 (ISO String)
  charId,         // 문자 ID (예: 'あ', '酒')
  cropFileName,   // OPFS에 저장된 크롭 이미지 파일명
  fullFileName,   // OPFS에 저장된 원본 전경 이미지 파일명
  lat = null,     // 위도
  lng = null,     // 경도
  address = '',   // 위치 주소 (선택)
  isNight = false // 야간 여부 (HDR/시간대 스탬프용)
}) {
  return await db.collections.add({
    createdAt,
    charId,
    cropFileName,
    fullFileName,
    lat,
    lng,
    address,
    isNight,
  });
}

/**
 * 특정 글자(charId)에 매핑되어 꿰어진 모든 수집 사진 목록 조회 (필름 스트립용)
 * @param {string} charId - 조회할 글자
 */
export async function getItemsByCharId(charId) {
  return await db.collections
    .where('charId')
    .equals(charId)
    .reverse()
    .sortBy('createdAt');
}

/**
 * 모든 수집 아이템 목록 조회 (구글 맵/포스터 생성용)
 */
export async function getAllCollectedItems() {
  return await db.collections.toArray();
}

/**
 * 특정 수집 아이템 삭제 및 OPFS 연동 파일 함께 삭제
 * @param {number} id - 수집 데이터 PK
 */
export async function deleteCollectionItem(id) {
  const item = await db.collections.get(id);
  if (item) {
    // 파일 삭제는 개별적으로 시도하고, 실패해도 DB 삭제는 진행하도록 함
    if (item.cropFileName) {
      try {
        await deleteImageFromOpfs(item.cropFileName);
      } catch (opfsErr) {
        console.warn(`OPFS에서 크롭 파일 ${item.cropFileName} 삭제 실패:`, opfsErr);
      }
    }
    if (item.fullFileName) {
      try {
        await deleteImageFromOpfs(item.fullFileName);
      } catch (opfsErr) {
        console.warn(`OPFS에서 원본 파일 ${item.fullFileName} 삭제 실패:`, opfsErr);
      }
    }
    
    // DB 메타데이터 삭제
    await db.collections.delete(id);
  }
}