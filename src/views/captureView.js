import { extractAndAlignSignboard } from '../services/scanner.js';
import { initCropper, getCroppedCanvasBlob, destroyCropper } from '../services/cropper.js';
import { recognizeChar } from '../services/ocr.js';
import { saveImageToOpfs } from '../db/opfs.js';
import { addCollectionItem } from '../db/index.js';
import { extractExifData } from '../utils/exif.js';
import { showNotice } from '../components/notice.js';

let currentStream = null;

export function renderCaptureView(container) {
  container.innerHTML = `
    <div class="capture-container">
      <div id="camera-preview-zone">
        <video id="camera-video" autoplay playsinline></video>
        <img id="crop-target-img" alt="촬영한 이미지" hidden>
        <div id="loading-spinner" hidden>사진을 정리하고 글자를 읽는 중…</div>
      </div>
      <div class="capture-controls">
        <button id="btn-snap" type="button" disabled aria-label="사진 촬영">●</button>
        <button id="btn-save-crop" type="button" hidden>도감에 저장</button>
        <button id="btn-cancel" type="button" hidden>다시 촬영</button>
      </div>
    </div>
  `;

  const video = container.querySelector('#camera-video');
  const cropImg = container.querySelector('#crop-target-img');
  const spinner = container.querySelector('#loading-spinner');
  const btnSnap = container.querySelector('#btn-snap');
  const btnSave = container.querySelector('#btn-save-crop');
  const btnCancel = container.querySelector('#btn-cancel');
  let fullImageBlob = null;
  let cameraReady = false;

  const startCamera = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      showNotice('카메라를 열 수 없어요', 'GitHub Pages 주소(HTTPS)에서 다시 열어 주세요.', 'error');
      return;
    }
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      });
      video.srcObject = currentStream;
      await video.play();
      cameraReady = video.videoWidth > 0 && video.videoHeight > 0;
      btnSnap.disabled = !cameraReady;
      if (!cameraReady) showNotice('카메라 준비 중', '잠시 후 촬영 버튼을 다시 눌러 주세요.', 'error');
    } catch (error) {
      const message = error.name === 'NotAllowedError'
        ? '브라우저 사이트 설정에서 카메라 권한을 허용해 주세요.'
        : '후면 카메라를 열지 못했어요. 다른 앱에서 카메라를 쓰고 있는지 확인해 주세요.';
      showNotice('카메라를 열 수 없어요', message, 'error');
    }
  };

  btnSnap.addEventListener('click', async () => {
    if (!cameraReady || !video.videoWidth || !video.videoHeight) {
      showNotice('카메라 준비 중', '미리보기가 완전히 열린 뒤 다시 눌러 주세요.', 'error');
      return;
    }
    spinner.hidden = false;
    btnSnap.disabled = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      fullImageBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.98));
      if (!fullImageBlob) throw new Error('사진을 만들지 못했습니다.');

      const alignedCanvas = await extractAndAlignSignboard(canvas);
      cropImg.src = alignedCanvas.toDataURL('image/png');
      video.hidden = true;
      cropImg.hidden = false;
      btnSnap.hidden = true;
      btnSave.hidden = false;
      btnCancel.hidden = false;
      initCropper(cropImg);
      recognizeChar(cropImg.src).catch(() => null);
    } catch (error) {
      showNotice('촬영 처리 중 오류', error.message || '다시 시도해 주세요.', 'error');
      btnSnap.disabled = false;
    } finally {
      spinner.hidden = true;
    }
  });

  btnCancel.addEventListener('click', () => {
    destroyCropper();
    cropImg.hidden = true;
    video.hidden = false;
    btnSnap.hidden = false;
    btnSnap.disabled = false;
    btnSave.hidden = true;
    btnCancel.hidden = true;
  });

  btnSave.addEventListener('click', async () => {
    btnSave.disabled = true;
    try {
      const croppedBlob = await getCroppedCanvasBlob();
      const timestamp = Date.now();
      const cropFileName = `crop_${timestamp}.png`;
      const fullFileName = `full_${timestamp}.jpg`;
      // Location is optional: a denied or unavailable location must never block saving.
      const location = await extractExifData(fullImageBlob);
      await saveImageToOpfs(croppedBlob, cropFileName);
      await saveImageToOpfs(fullImageBlob, fullFileName);
      await addCollectionItem({ charId: '？', cropFileName, fullFileName, lat: location.lat, lng: location.lng });
      showNotice('도감에 저장했어요', '위치 권한이 허용된 경우 지도에도 기록됩니다.', 'success');
    } catch (error) {
      showNotice('저장하지 못했어요', error.message || '잠시 후 다시 시도해 주세요.', 'error');
    } finally {
      btnSave.disabled = false;
    }
  });

  startCamera();
  return () => {
    currentStream?.getTracks().forEach((track) => track.stop());
    currentStream = null;
    destroyCropper();
  };
}
