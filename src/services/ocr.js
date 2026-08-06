import { createWorker } from 'tesseract.js';

let ocrWorker = null;

/**
 * Tesseract.js Worker 초기화 (일본어 전용 데이터 로드)
 */
async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = await createWorker('jpn');
  }
  return ocrWorker;
}

/**
 * 크롭된 이미지(Blob/URL)에서 일본어 글자를 추정하여 인식된 첫 글자 id를 반환합니다.
 * @param {Blob|string} imageSource - 인식할 글자 이미지
 * @returns {Promise<string|null>} 인식된 글자 (예: 'あ', '酒' 등) 또는 null
 */
export async function recognizeChar(imageSource) {
  try {
    const worker = await getOcrWorker();
    const { data: { text } } = await worker.recognize(imageSource);
    
    // 공백, 줄바꿈 제거 후 첫 번째 일본어 문자 추출
    const cleanedText = text.replace(/[\s\r\n]/g, '');
    if (cleanedText.length > 0) {
      return cleanedText[0]; // 추정된 첫 글자 반환
    }
    return null;
  } catch (error) {
    console.error('OCR 문자 인식 실패:', error);
    return null;
  }
}