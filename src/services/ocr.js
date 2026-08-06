import { createWorker } from 'tesseract.js';

let ocrWorker = null;

// 여러 번 호출되어도 worker가 한 번만 생성되도록 Promise를 저장합니다.
let workerPromise = null;

/**
 * Tesseract.js Worker 초기화 (일본어 전용 데이터 로드)
 */
async function getOcrWorker() {
  if (!workerPromise) {
    // createWorker는 시간이 걸리는 작업이므로 Promise를 저장해둡니다.
    workerPromise = (async () => {
      const worker = await createWorker('jpn');
      // 단일 문자 인식 정확도를 높이기 위해 페이지 분할 모드를 '단일 문자'로 설정합니다.
      await worker.setParameters({ tessedit_pageseg_mode: '10' });
      return worker;
    })();
  }
  if (!ocrWorker) { // worker가 아직 할당되지 않았을 경우에만 await 합니다.
    ocrWorker = await workerPromise;
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

/**
 * Tesseract.js Worker를 종료하여 메모리를 해제합니다.
 * 뷰가 사라질 때 호출해야 합니다.
 */
export async function terminateOcrWorker() {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
    workerPromise = null;
  }
}