// `jscanify`'s package root resolves to its Node.js build.  Use the explicit
// browser entry point so Vite does not bundle Node built-ins (`fs`, `url`, etc.).
import jscanify from 'jscanify/client';

const scanner = new jscanify();

/**
 * 이미지(HTMLImageElement/Canvas/Blob)를 받아 간판 윤곽을 자동 인식하고 정면으로 펼쳐진 Canvas를 반환합니다.
 * @param {HTMLImageElement|HTMLCanvasElement} imageElement - 보정할 원본 이미지
 * @returns {Promise<HTMLCanvasElement>} 수평/투시 보정이 완료된 Canvas
 */
export async function extractAndAlignSignboard(imageElement) {
  return new Promise((resolve, reject) => {
    try {
      // jscanify로 기울어진 간판 모서리를 인식하여 정면 직사각형으로 투시 변환 (Perspective Transform)
      const resultCanvas = scanner.extractPaper(imageElement, 1000, 1000);
      resolve(resultCanvas);
    } catch (error) {
      console.warn('간판 자동 윤곽선 감지 실패, 원본 이미지를 유지합니다:', error);
      // 윤곽 감지 실패 시 원본 이미지를 Canvas로 담아 반환
      const fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = imageElement.width || imageElement.naturalWidth;
      fallbackCanvas.height = imageElement.height || imageElement.naturalHeight;
      const ctx = fallbackCanvas.getContext('2d');
      ctx.drawImage(imageElement, 0, 0);
      resolve(fallbackCanvas);
    }
  });
}
