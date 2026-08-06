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
        <img id="crop-target-img" alt="촬영한 이미지" hidden style="display: none;">
        <p id="crop-hint" class="crop-hint" hidden>드래그하여 저장할 글자 영역을 맞춰 주세요.</p>
        <div id="loading-spinner" hidden>사진을 정리하고 글자를 읽는 중…</div>
      </div>
      <div class="capture-controls">
        <button id="btn-snap" type="button" disabled aria-label="사진 촬영">●</button>
        <button id="btn-start-crop" type="button" hidden>크롭 시작</button>
        <button id="btn-save-crop" type="button" hidden>글자 선택하기</button>
        <button id="btn-cancel" type="button" hidden>다시 촬영</button>
      </div>
      <form id="save-sheet" class="save-sheet" hidden>
        <div class="save-sheet-paper">
          <p>COLLECTION NOTE</p>
          <h3>이 사진으로 저장할까요?</h3>
          <label>문자 <input id="save-char" maxlength="4" placeholder="예: あ" required></label>
          <label>장소 <input id="save-address" maxlength="80" placeholder="장소를 직접 적어도 돼요"></label>
          <div class="save-sheet-actions">
            <button id="btn-close-sheet" type="button">취소</button>
            <button type="submit">저장하기</button>
          </div>
        </div>
      </form>
    </div>
  `;

  const video = container.querySelector('#camera-video');
  const cropImg = container.querySelector('#crop-target-img');
  const cropHint = container.querySelector('#crop-hint');
  const spinner = container.querySelector('#loading-spinner');
  const btnSnap = container.querySelector('#btn-snap');
  const btnStartCrop = container.querySelector('#btn-start-crop');
  const btnSave = container.querySelector('#btn-save-crop');
  const btnCancel = container.querySelector('#btn-cancel');
  const saveSheet = container.querySelector('#save-sheet');
  const charInput = container.querySelector('#save-char');
  const addressInput = container.querySelector('#save-address');
  let fullImageBlob = null;
  let cameraReady = false;

  async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      showNotice('카메라를 열 수 없어요', 'GitHub Pages 주소(HTTPS)에서 다시 열어 주세요.', 'error');
      return;
    }
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = currentStream;
      await video.play();
      cameraReady = video.videoWidth > 0 && video.videoHeight > 0;
      btnSnap.disabled = !cameraReady;
    } catch (error) {
      showNotice('카메라를 열 수 없어요', error.name === 'NotAllowedError' ? '브라우저 사이트 설정에서 카메라 권한을 허용해 주세요.' : '다른 앱에서 카메라를 사용 중인지 확인해 주세요.', 'error');
    }
  }

  btnSnap.addEventListener('click', async () => {
    if (!cameraReady) return;
    spinner.hidden = false;
    btnSnap.disabled = true;
    try {
      fullImageBlob = await capturePhoto(video);
      if (!fullImageBlob) throw new Error('사진을 만들지 못했습니다.');
      await new Promise((resolve) => {
        cropImg.onload = resolve;
        cropImg.onerror = resolve;
        cropImg.src = canvas.toDataURL('image/jpeg', 0.98);
      });
      video.hidden = true;
      cropImg.hidden = false;
      btnSnap.hidden = true;
      btnStartCrop.hidden = false;
      btnCancel.hidden = false;
      recognizeChar(cropImg.src).then((char) => { if (char) charInput.value = char; }).catch(() => null);
    } catch (error) {
      showNotice('촬영 처리 중 오류', error.message || '다시 시도해 주세요.', 'error');
      btnSnap.disabled = false;
    } finally {
      spinner.hidden = true;
    }
  });

  btnSave.addEventListener('click', () => {
    saveSheet.hidden = false;
    charInput.focus();
  });
  btnStartCrop.addEventListener('click', () => {
    initCropper(cropImg);
    cropHint.hidden = false;
    btnStartCrop.hidden = true;
    btnSave.hidden = false;
  });
  container.querySelector('#btn-close-sheet').addEventListener('click', () => { saveSheet.hidden = true; });

  saveSheet.addEventListener('submit', async (event) => {
    event.preventDefault();
    const charId = charInput.value.trim();
    if (!charId || !fullImageBlob) return;
    const submitButton = saveSheet.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const croppedBlob = await getCroppedCanvasBlob();
      const timestamp = Date.now();
      const location = await extractExifData(fullImageBlob);
      await saveImageToOpfs(croppedBlob, `crop_${timestamp}.png`);
      await saveImageToOpfs(fullImageBlob, `full_${timestamp}.jpg`);
      await addCollectionItem({ charId, cropFileName: `crop_${timestamp}.png`, fullFileName: `full_${timestamp}.jpg`, lat: location.lat, lng: location.lng, address: addressInput.value.trim() });
      saveSheet.hidden = true;
      showNotice('도감에 저장했어요', `${charId} 기록을 추가했습니다.`, 'success');
    } catch (error) {
      showNotice('저장하지 못했어요', error.message || '잠시 후 다시 시도해 주세요.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  });

  btnCancel.addEventListener('click', () => {
    destroyCropper();
    cropImg.hidden = true;
    cropHint.hidden = true;
    video.hidden = false;
    btnSnap.hidden = false;
    btnSnap.disabled = false;
    btnStartCrop.hidden = true;
    btnSave.hidden = true;
    btnCancel.hidden = true;
  });

  startCamera();
  return () => { currentStream?.getTracks().forEach((track) => track.stop()); currentStream = null; destroyCropper(); };
}

async function capturePhoto(video) {
  const track = currentStream?.getVideoTracks()[0];
  // ImageCapture returns the camera's still-photo resolution on supporting phones.
  if (track && 'ImageCapture' in window) {
    try {
      return await new ImageCapture(track).takePhoto();
    } catch {
      // Fall back to the video frame for browsers without still-photo capture support.
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.98));
}
