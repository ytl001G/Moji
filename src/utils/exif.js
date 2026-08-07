import ExifReader from 'exifreader';

/**
 * Geolocation API를 사용하여 현재 위치를 가져오는 헬퍼 함수
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
function getCurrentLocation() {
  return new Promise((resolve, reject) => { // reject 추가
    if (!navigator.geolocation) {
      reject(new Error('Geolocation API를 지원하지 않습니다.')); // reject로 변경
      return;
    }
    // 5초 타임아웃, 높은 정확도 옵션 사용
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (error) => reject(error), // 에러 발생 시 reject
      { timeout: 5000, enableHighAccuracy: true }
    );
  });
}

/**
 * 이미지 Blob/File에서 Exif GPS 및 촬영 일시 추출 (HTML5 File FileReader 사용)
 * EXIF 데이터가 없으면 Geolocation API를 fallback으로 사용합니다.
 * @param {File|Blob} file - 사진 파일
 * @returns {Promise<{lat: number|null, lng: number|null, createdAt: string}>}
 */
export async function extractExifData(file) {
  try {
    // exifreader 라이브러리를 사용하여 EXIF 태그 로드
    const tags = await ExifReader.load(file);

    // GPS 위도/경도 정보 추출
    const hasGps = tags.GPSLatitude && tags.GPSLongitude; // tags.GPSLatitude와 tags.GPSLongitude가 모두 존재해야 함
    const lat = hasGps ? tags.GPSLatitude.description : null;
    const lng = hasGps ? tags.GPSLongitude.description : null;

    // 촬영 시각(DateTimeOriginal) 정보 추출
    const createdAtTag = tags.DateTimeOriginal;
    let createdAt = new Date().toISOString(); // 기본값은 현재 시각
    if (createdAtTag) {
      // EXIF 날짜 형식 'YYYY:MM:DD HH:MM:SS'를 JS Date가 인식할 수 있는 'YYYY-MM-DD HH:MM:SS'로 변경
      const formattedDateString = createdAtTag.description.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const date = new Date(formattedDateString);
      if (!isNaN(date)) {
        createdAt = date.toISOString();
      }
    }

    // EXIF에서 GPS 정보를 성공적으로 찾았다면 해당 값 반환
    if (lat !== null && lng !== null) {
      return { lat, lng, createdAt };
    }
  } catch (error) {
    // 라이브러리가 EXIF 데이터를 읽지 못하는 경우 (예: EXIF가 없는 이미지)
    console.warn('EXIF 파싱 실패, Geolocation으로 대체합니다.', error);
  }

  // EXIF에서 GPS를 찾지 못했거나 파싱에 실패한 경우, Geolocation API 사용
  let location = { lat: null, lng: null };
  try {
    location = await getCurrentLocation();
  } catch (geoError) {
    console.warn('Geolocation 정보 가져오기 실패:', geoError.message);
  }

  return {
    lat: location?.lat || null,
    lng: location?.lng || null,
    createdAt: new Date().toISOString() // EXIF에 날짜가 없었으므로 현재 시간 사용
  };
}