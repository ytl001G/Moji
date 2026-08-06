import jscanify from 'jscanify'; // jscanify 라이브러리 임포트

/**
 * jscanify를 특정 canvas 요소에 초기화합니다.
 * @param {HTMLCanvasElement} canvasElement - 스캔을 진행할 <canvas> 요소
 * @param {HTMLImageElement} imageElement - 원본 이미지가 담긴 <img> 요소
 */
export function initScanner(canvasElement, imageElement) {
  if (scannerInstance) {
    scannerInstance.destroy(); // jscanify 인스턴스에 destroy 메서드가 있다면 호출
  } // jscanify 라이브러리 자체에는 destroy 메서드가 없으므로, 이 줄은 제거하거나 주석 처리하는 것이 좋습니다.
  // 캔버스의 크기를 원본 이미지와 동일하게 설정합니다.
  canvasElement.width = imageElement.naturalWidth;
  canvasElement.height = imageElement.naturalHeight;

  const ctx = canvasElement.getContext('2d');
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height); // 기존 내용 지우기
  ctx.drawImage(imageElement, 0, 0); // 원본 이미지 그리기


  // jscanify를 캔버스에 적용합니다. 라이브러리가 자동으로 모서리 핸들을 그립니다.
  scannerInstance = new jscanify(canvasElement);
}

/**
 * 현재 선택된 영역을 원근 보정하여 Blob 이미지로 추출합니다.
 * @returns {Promise<Blob>} 보정된 글자 이미지 Blob
 */
export function getScannedImageBlob() {
  return new Promise((resolve, reject) => {
    if (!scannerInstance) {
      reject(new Error('Scanner가 초기화되지 않았습니다.'));
      return;
    }

    const resultCanvas = scannerInstance.getScannedImage(); // jscanify 인스턴스에서 스캔된 이미지 가져오기
    resultCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('스캔 이미지 생성에 실패했습니다.'));
      }
    }, 'image/png');
  });
}

/**
 * jscanify 인스턴스 참조를 해제합니다.
 */
export function destroyScanner() {
  scannerInstance = null;
}