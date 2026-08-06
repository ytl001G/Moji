import Cropper from 'cropperjs';

let cropperInstance = null;

/**
 * Cropper.js를 특정 <img> 요소에 초기화합니다.
 * @param {HTMLImageElement} imageElement - 크롭을 진행할 <img> 요소
 * @returns {Cropper} Cropper 인스턴스
 */
export function initCropper(imageElement) {
  if (cropperInstance) {
    cropperInstance.destroy();
  }

  cropperInstance = new Cropper(imageElement, {
    aspectRatio: NaN, // 정사각형에 구애받지 않는 자유 자르기
    viewMode: 0,
    dragMode: 'crop',
    autoCropArea: 0.82,
    restore: false,
    guides: true,
    center: true,
    highlight: false,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
  });

  return cropperInstance;
}

/**
 * 현재 설정된 크롭 영역을 Blob 이미지로 추출합니다.
 * @returns {Promise<Blob>} 자른 글자 이미지 Blob
 */
export function getCroppedCanvasBlob() {
  return new Promise((resolve, reject) => {
    if (!cropperInstance) {
      reject(new Error('Cropper가 초기화되지 않았습니다.'));
      return;
    }

    const canvas = cropperInstance.getCroppedCanvas({
      maxWidth: 2048,
      maxHeight: 2048,
      fillColor: '#fff',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('크롭 이미지 생성에 실패했습니다.'));
      }
    }, 'image/png');
  });
}

/**
 * Cropper 인스턴스 해제
 */
export function destroyCropper() {
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
}
