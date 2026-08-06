import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { recognizeChar, terminateOcrWorker } from '../services/ocr.js';
import { extractExifData } from '../utils/exif.js';
import { showNotice } from '../components/notice.js';

let currentStream = null;
let cropper = null;

export function renderCaptureView(container) {
  container.innerHTML = `
    <div class="capture-container">
      <div id="camera-preview-zone">
        <video id="camera-video" autoplay playsinline></video>
        <img id="crop-target-img" alt="촬영한 이미지" hidden>
        <p id="crop-hint" class="crop-hint" hidden>네 모서리를 조절하여 글자 영역을 맞춰 주세요.</p>
      </div>
      <div class="capture-controls">
        <button id="btn-snap" type="button" disabled aria-label="사진 촬영">●</button>
        <button id="btn-save-crop" type="button" hidden>글자 선택하기</button>
        <button id="btn-cancel" type="button" hidden>다시 촬영</button>
      </div>
      <form id="save-sheet" class="save-sheet" hidden>
        <div class="save-sheet-paper">
          <p>COLLECTION NOTE</p>
          <h3>이 사진으로 저장할까요?</h3>
          <label>문자 <input id="save-char" maxlength="4" placeholder="예: あ" required></label>
          <div class="save-sheet-actions">
            <button id="btn-close-sheet" type="button">취소</button>
            <button type="submit">저장하기</button>
          </div>
        </div>
      </form>
    </div>
  `;

  const video = container.querySelector('#camera-video');
  const sourceImg = container.querySelector('#crop-target-img');
  const cropHint = container.querySelector('#crop-hint');
  const btnSnap = container.querySelector('#btn-snap');
  const btnSave = container.querySelector('#btn-save-crop');
  const btnCancel = container.querySelector('#btn-cancel');
  const saveSheet = container.querySelector('#save-sheet');
  const charInput = container.querySelector('#save-char');
  let fullImageBlob = null;
  let sourceObjectUrl = null;
  let croppedImageBlob = null;
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
      await new Promise(resolve => setTimeout(resolve, 100)); // 비디오 스트림이 안정화될 시간을 줍니다.
      cameraReady = video.videoWidth > 0 && video.videoHeight > 0;
      btnSnap.disabled = !cameraReady;
    } catch (error) {
      showNotice('카메라를 열 수 없어요', error.name === 'NotAllowedError' ? '브라우저 사이트 설정에서 카메라 권한을 허용해 주세요.' : '다른 앱에서 카메라를 사용 중인지 확인해 주세요.', 'error');
    }
  }

  btnSnap.addEventListener('click', async () => {
    if (!cameraReady) return;
    btnSnap.disabled = true;
    try {
      fullImageBlob = await capturePhoto(video);
      console.log('Captured fullImageBlob:', fullImageBlob, 'Type:', fullImageBlob?.type, 'Size:', fullImageBlob?.size);
      if (!fullImageBlob || fullImageBlob.size === 0) throw new Error('사진을 만들지 못했습니다. (빈 이미지)');

      sourceObjectUrl && URL.revokeObjectURL(sourceObjectUrl);
      sourceObjectUrl = URL.createObjectURL(fullImageBlob);
      await new Promise((resolve, reject) => {
        sourceImg.onload = () => {
          sourceImg.onload = null;
          sourceImg.onerror = null;
          resolve();
        };
        sourceImg.onerror = (e) => {
          sourceImg.onload = null;
          sourceImg.onerror = null;
          URL.revokeObjectURL(sourceObjectUrl);
          sourceObjectUrl = null;
          showNotice('이미지 로드 실패', e.message || '사진을 표시할 수 없습니다.', 'error');
          reject(new Error('이미지 로드 실패'));
        };
        sourceImg.src = sourceObjectUrl;
      });
      video.hidden = true;
      sourceImg.hidden = false;
      cropper?.destroy();
      cropper = new Cropper(sourceImg, {
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.8,
        responsive: true,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        ready() {
          requestAnimationFrame(() => {
            cropper?.crop();
            if (cropper) attachCornerHandles(cropper);
          });
        },
      });
      // Some mobile browsers do not dispatch Cropper's ready event reliably for
      // an already-decoded Blob image. Attach the visible handles independently.
      window.setTimeout(() => cropper && attachCornerHandles(cropper), 120);
      cropHint.hidden = false;
      btnSnap.hidden = true;
      btnCancel.hidden = false;
      btnSave.hidden = false; // 사진 촬영 후 스캐너 초기화 완료 시 "글자 선택하기" 버튼을 바로 표시
    } catch (error) {
      showNotice('촬영 처리 중 오류', error.message || '다시 시도해 주세요.', 'error');
      btnSnap.disabled = false;
    } finally {
    }
  });

  btnSave.addEventListener('click', async () => {
    btnSave.disabled = true;
    try {
      croppedImageBlob = await getCroppedImageBlob();
      const recognized = await recognizeChar(croppedImageBlob);
      if (recognized) {
        charInput.value = recognized;
      }
    } catch (error) {
      console.error('OCR 처리 중 오류:', error);
    } finally {
      btnSave.disabled = false;
      saveSheet.hidden = false;
      // btnSave.hidden = false; // 이 줄은 이제 불필요합니다.
      charInput.focus();
    }
  });
  container.querySelector('#btn-close-sheet').addEventListener('click', () => { saveSheet.hidden = true; });

  saveSheet.addEventListener('submit', async (event) => {
    event.preventDefault();
    const charId = charInput.value.trim();
    if (!charId || !fullImageBlob) return;

    const submitButton = saveSheet.querySelector('[type="submit"]');
    submitButton.disabled = true;

    try {
      const finalCroppedBlob = croppedImageBlob || await getCroppedImageBlob();
      if (!finalCroppedBlob) throw new Error('크롭된 이미지를 가져올 수 없습니다.');

      const timestamp = Date.now();
      const location = await extractExifData(fullImageBlob);

      await saveImageToOpfs(finalCroppedBlob, `crop_${timestamp}.png`);
      await saveImageToOpfs(fullImageBlob, `full_${timestamp}.jpg`);
      await addCollectionItem({ charId, createdAt: location.createdAt, cropFileName: `crop_${timestamp}.png`, fullFileName: `full_${timestamp}.jpg`, lat: location.lat, lng: location.lng });

      saveSheet.hidden = true;
      showNotice('도감에 저장했어요', `${charId} 기록을 추가했습니다.`, 'success');
      resetToCaptureState(); // 성공 후 카메라 뷰로 리셋
    } catch (error) {
      showNotice('저장하지 못했어요', error.message || '잠시 후 다시 시도해 주세요.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  });

  function resetToCaptureState() {
    cropper?.destroy();
    cropper = null;
    sourceImg.hidden = true;
    sourceImg.onload = null;
    sourceImg.onerror = null;
    sourceImg.removeAttribute('src');
    if (sourceObjectUrl) {
      URL.revokeObjectURL(sourceObjectUrl);
      sourceObjectUrl = null;
    }
    cropHint.hidden = true;
    video.hidden = false;
    btnSnap.hidden = false;
    btnSnap.disabled = false;
    btnSave.hidden = true;
    btnCancel.hidden = true;
    fullImageBlob = null;
    croppedImageBlob = null;
  }

  btnCancel.addEventListener('click', resetToCaptureState);

  startCamera();
  return () => { currentStream?.getTracks().forEach((track) => track.stop()); currentStream = null; cropper?.destroy(); cropper = null; if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl); terminateOcrWorker(); };
}

function getCroppedImageBlob() {
  if (!cropper) return Promise.reject(new Error('크로퍼가 초기화되지 않았습니다.'));

  const canvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });
  if (!canvas) return Promise.reject(new Error('크롭 영역을 만들지 못했습니다.'));

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('크롭 이미지를 만들지 못했습니다.')), 'image/png');
  });
}

function attachCornerHandles(instance) {
  const host = instance.cropper;
  if (!host || host.querySelector('.manual-crop-handles')) return;

  const overlay = document.createElement('div');
  overlay.className = 'manual-crop-handles';
  const corners = ['nw', 'ne', 'sw', 'se'].map((corner) => {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = `manual-crop-handle ${corner}`;
    handle.setAttribute('aria-label', `${corner} 모서리 조절`);
    overlay.appendChild(handle);
    return { corner, handle };
  });
  host.appendChild(overlay);

  const render = () => {
    const box = instance.getCropBoxData();
    corners.forEach(({ corner, handle }) => {
      handle.style.left = `${corner.includes('w') ? box.left : box.left + box.width}px`;
      handle.style.top = `${corner.includes('n') ? box.top : box.top + box.height}px`;
    });
  };

  corners.forEach(({ corner, handle }) => {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const start = instance.getCropBoxData();
      const startX = event.clientX;
      const startY = event.clientY;
      const move = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const next = { ...start };
        if (corner.includes('w')) { next.left += dx; next.width -= dx; } else next.width += dx;
        if (corner.includes('n')) { next.top += dy; next.height -= dy; } else next.height += dy;
        if (next.width < 48 || next.height < 48) return;
        instance.setCropBoxData(next);
        render();
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
    });
  });
  instance.element.addEventListener('crop', render);
  render();
}

async function capturePhoto(video) {
  // Capture the exact frame shown in the preview. ImageCapture.takePhoto() can use a
  // different sensor aspect ratio, which makes the captured image look reframed.
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.98));
}
