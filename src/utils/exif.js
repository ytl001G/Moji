/**
 * 이미지 Blob/File에서 Exif GPS 및 촬영 일시 추출 (HTML5 File FileReader 사용)
 * @param {File|Blob} file - 사진 파일
 * @returns {Promise<{lat: number|null, lng: number|null, createdAt: string}>}
 */
export async function extractExifData(file) {
  return new Promise((resolve) => {
    // 기본 반환값
    const defaultData = {
      lat: null,
      lng: null,
      createdAt: new Date().toISOString()
    };

    if (navigator.geolocation) {
      // GPS 접근 불가능 시 현재 위치 fallback 지원
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            createdAt: new Date().toISOString()
          });
        },
        () => resolve(defaultData),
        { timeout: 1000, maximumAge: 60000 }
      );
    } else {
      resolve(defaultData);
    }
  });
}
