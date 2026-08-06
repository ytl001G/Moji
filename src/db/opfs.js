/**
 * OPFS (Origin Private File System) 파일 관리 유틸리티
 * 원본 간판 사진 및 크롭된 글자 이미지를 전용 무제한 보관소에 파일 형태로 저장합니다.
 */

// OPFS 루트 디렉토리 핸들 가져오기
async function getOpfsRoot() {
  if (!navigator.storage || !navigator.storage.getDirectory) {
    throw new Error('이 브라우저는 OPFS(Origin Private File System)를 지원하지 않습니다.');
  }
  return await navigator.storage.getDirectory();
}

/**
 * Blob/File 객체를 OPFS에 저장하고 저장된 파일명을 반환합니다.
 * @param {Blob|File} fileBlob - 저장할 이미지 Blob
 * @param {string} fileName - 저장할 파일 이름 (예: 'crop_20260806_103000.png')
 * @returns {Promise<string>} 저장 완료된 파일명
 */
export async function saveImageToOpfs(fileBlob, fileName) {
  try {
    const root = await getOpfsRoot();
    const fileHandle = await root.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(fileBlob);
    await writable.close();
    return fileName;
  } catch (error) {
    console.error('OPFS 파일 저장 실패:', error);
    throw error;
  }
}

/**
 * OPFS에 저장된 파일명을 기반으로 Image URL(Object URL)을 생성해 반환합니다.
 * @param {string} fileName - 불러올 파일 이름
 * @returns {Promise<string>} <img src="...">에 직접 바인딩 가능한 Blob URL
 */
export async function getImageUrlFromOpfs(fileName) {
  try {
    const root = await getOpfsRoot();
    const fileHandle = await root.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch (error) {
    console.error(`OPFS 파일 읽기 실패 (${fileName}):`, error);
    return null;
  }
}

/**
 * OPFS에서 특정 파일 삭제
 * @param {string} fileName - 삭제할 파일 이름
 */
export async function deleteImageFromOpfs(fileName) {
  try {
    const root = await getOpfsRoot();
    await root.removeEntry(fileName);
  } catch (error) {
    console.error(`OPFS 파일 삭제 실패 (${fileName}):`, error);
  }
}