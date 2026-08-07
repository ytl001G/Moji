import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { extractExifData } from '../utils/exif.js';
import { showNotice } from '../components/notice.js';
import { initScanner, getScannedImageBlob, destroyScanner } from '../services/scanner.js'; // jscanify 스캐너 임포트
import { addCollectionItem } from '../db/index.js';
import { saveImageToOpfs } from '../db/opfs.js';

let currentStream = null;
let cropper = null;
let isCaptureViewActive = false; // 캡처 뷰가 현재 활성화되어 있는지 추적하는 플래그

// All valid characters for input validation
let allValidCharIds = new Set();

async function loadAllValidCharacters() {
  if (allValidCharIds.size > 0) return; // Load only once

  const hiragana = (await import('../data/ja/hiragana.json')).default;
  const katakana = (await import('../data/ja/katakana.json')).default;
  const kanji = (await import('../data/ja/kanji.json')).default;

  [...hiragana, ...katakana, ...kanji].forEach(char => {
    allValidCharIds.add(char.id);
  });
  console.log(`Loaded ${allValidCharIds.size} valid characters for input validation.`);
}

export function renderCaptureView(container, globalShutterButton, originalShutterButtonProps, setSnapClickHandler) {
  container.innerHTML = `
    <div class="capture-container">
      <div id="camera-preview-zone">
        <video id="camera-video" autoplay playsinline></video>
        <img id="crop-target-img" alt="촬영한 이미지" hidden>
        <p id="crop-hint" class="crop-hint" hidden>네 모서리를 조절하여 글자 영역을 맞춰 주세요.</p>
      </div>
      <div class="capture-controls">
        <button id="btn-save-crop" type="button" hidden>글자 입력하기</button>
        <button id="btn-cancel" type="button" hidden>다시 촬영</button>
      </div>
      <button id="btn-scan-document" type="button" hidden>문서 스캔</button> <!-- 스캔 버튼 추가 -->

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
  // const btnSnap = container.querySelector('#btn-snap'); // 전역 버튼을 사용하므로 제거, UI에서도 제거
  const saveSheet = container.querySelector('#save-sheet');
  const charInput = container.querySelector('#save-char');
  const btnSave = container.querySelector('#btn-save-crop');
  const btnCancel = container.querySelector('#btn-cancel');
  const btnScanDocument = container.querySelector('#btn-scan-document'); // 스캔 버튼 참조
  let fullImageBlob = null;
  let sourceObjectUrl = null;
  let croppedImageBlob = null;
  isCaptureViewActive = true; // 뷰가 렌더링될 때 활성화 플래그 설정
  let cameraReady = false;

  loadAllValidCharacters(); // Load valid characters when view is rendered

  // 전역 셔터 버튼의 상태를 변경하는 함수들
  function setShutterButtonCameraMode() {
    if (!globalShutterButton) return;
    if (!isCaptureViewActive) return; // 뷰가 활성화된 상태에서만 셔터 모드 적용
    globalShutterButton.innerHTML = '<div class="shutter-inner">●</div>'; // 셔터 아이콘
    globalShutterButton.classList.add('shutter-active'); // 활성 셔터 스타일 적용 (CSS에서 정의)
    globalShutterButton.disabled = !cameraReady; // 카메라 준비 상태에 따라 활성화/비활성화
    globalShutterButton.removeEventListener('click', originalShutterButtonProps.navHandler); // 기존 네비게이션 핸들러 제거
    globalShutterButton.addEventListener('click', handleSnapClick); // 사진 촬영 핸들러 연결
    globalShutterButton.hidden = false; // 혹시 숨겨져 있다면 보이게
    setSnapClickHandler(handleSnapClick); // app.js에서 참조할 수 있도록 핸들러 전달
  }

  function setShutterButtonCropMode() {
    if (!globalShutterButton) return;
    globalShutterButton.innerHTML = '<div class="shutter-inner">✅</div>'; // 크롭 완료/확인 아이콘
    globalShutterButton.classList.remove('shutter-active'); // 셔터 스타일 제거
    globalShutterButton.disabled = true; // 크롭 중에는 비활성화 (필요 시)
    globalShutterButton.removeEventListener('click', handleSnapClick); // 셔터 핸들러 제거 (안전하게)
    // 이 모드에서는 버튼이 비활성화되므로, 특별한 클릭 핸들러는 필요 없습니다.
  }

  function restoreShutterButtonNavMode() {
    if (!globalShutterButton || !originalShutterButtonProps.navHandler) return;
    // handleSnapClick이 null이 아닐 때만 removeEventListener 호출
    if (handleSnapClick) globalShutterButton.removeEventListener('click', handleSnapClick); // 셔터 핸들러 제거
    setSnapClickHandler(null); // 핸들러 참조 초기화
    globalShutterButton.innerHTML = originalShutterButtonProps.innerHTML;
    globalShutterButton.classList.remove('shutter-active'); // 셔터 UI 클래스 명시적으로 제거
    globalShutterButton.className = originalShutterButtonProps.className;
    globalShutterButton.disabled = originalShutterButtonProps.disabled;
    globalShutterButton.addEventListener('click', originalShutterButtonProps.navHandler); // 원래 네비게이션 핸들러 복원
  }

  async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      showNotice('카메라를 열 수 없어요', 'GitHub Pages 주소(HTTPS)에서 다시 열어 주세요.', 'error');
      return;
    }
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = currentStream;
      await video.play();
      await new Promise(resolve => setTimeout(resolve, 100)); // 비디오 스트림이 안정화될 시간
      cameraReady = video.videoWidth > 0 && video.videoHeight > 0;
      setShutterButtonCameraMode(); // 전역 셔터 버튼 상태 업데이트
    } catch (error) {
      showNotice('카메라를 열 수 없어요', error.name === 'NotAllowedError' ? '브라우저 사이트 설정에서 카메라 권한을 허용해 주세요.' : '다른 앱에서 카메라를 사용 중인지 확인해 주세요.', 'error');
      globalShutterButton?.removeEventListener('click', handleSnapClick); // 실패 시 셔터 핸들러 제거
      if (globalShutterButton) globalShutterButton.disabled = true; // 카메라 실패 시 버튼 비활성화
    }
  }

  const handleSnapClick = async () => { // 전역 셔터 버튼의 클릭 핸들러
    if (!cameraReady || globalShutterButton.disabled) return; // 이미 비활성화되어 있다면 중복 실행 방지
    globalShutterButton.disabled = true; // 촬영 시작 시 버튼 비활성화
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
        minCropBoxWidth: 20, // 최소 크롭 박스 너비
        minCropBoxHeight: 20, // 최소 크롭 박스 높이
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
      btnCancel.hidden = false;
      btnScanDocument.hidden = false; // 스캔 버튼 표시
      btnSave.hidden = false; // 사진 촬영 후 "글자 선택하기" 버튼 표시
    } catch (error) {
      showNotice('촬영 처리 중 오류', error.message || '다시 시도해 주세요.', 'error'); // 오류 발생 시
      globalShutterButton.disabled = false; // 오류 발생 시 버튼 다시 활성화
    } finally {
    }
  };

  btnScanDocument.addEventListener('click', async () => {
    if (!fullImageBlob) {
      showNotice('스캔 실패', '원본 이미지가 없습니다.', 'error');
      return;
    }
    btnScanDocument.disabled = true;
    showNotice('문서 스캔 중...', '이미지의 왜곡을 보정하고 있습니다.', 'info', 3000);

    try {
      // jscanify를 위한 임시 캔버스 생성
      const tempCanvas = document.createElement('canvas');
      const tempImg = new Image();
      tempImg.src = sourceObjectUrl; // 현재 크롭 대상 이미지 사용
      await new Promise(r => tempImg.onload = r);

      initScanner(tempCanvas, tempImg); // jscanify 초기화
      const scannedBlob = await getScannedImageBlob(); // 스캔된 이미지 Blob 가져오기
      destroyScanner(); // 스캐너 인스턴스 정리

      // 스캔된 이미지를 크롭 대상으로 다시 설정
      URL.revokeObjectURL(sourceObjectUrl);
      sourceObjectUrl = URL.createObjectURL(scannedBlob);
      sourceImg.src = sourceObjectUrl; // Cropper가 새 이미지를 로드하도록 트리거
      showNotice('스캔 완료', '이미지 왜곡이 보정되었습니다.', 'success');
    } catch (error) {
      showNotice('문서 스캔 실패', error.message || '다시 시도해 주세요.', 'error');
    } finally {
      btnScanDocument.disabled = false;
    }
  });

  btnSave.addEventListener('click', async () => { // "글자 입력하기" 버튼 클릭 시
    if (!fullImageBlob) {
      showNotice('저장 실패', '촬영된 이미지가 없습니다.', 'error');
      return;
    }

    btnSave.disabled = true; // 버튼 비활성화
    try {
      croppedImageBlob = croppedImageBlob || await getCroppedImageBlob(); // 크롭된 이미지 준비
      if (!croppedImageBlob) throw new Error('크롭된 이미지를 가져올 수 없습니다.');
      saveSheet.hidden = false; // 글자 입력 시트 표시
      charInput.focus(); // 입력 필드에 포커스
    } catch (error) {
      showNotice('크롭 이미지 준비 중 오류', error.message || '다시 시도해 주세요.', 'error');
    } finally {
      btnSave.disabled = false; // 버튼 다시 활성화
    }
  });

  container.querySelector('#btn-close-sheet').addEventListener('click', () => { saveSheet.hidden = true; });

  saveSheet.addEventListener('submit', async (event) => {
    event.preventDefault();
    const charId = charInput.value.trim();
    if (!charId) return;

    if (!allValidCharIds.has(charId)) {
      showNotice('유효하지 않은 글자', `"${charId}"는 도감에 없는 글자입니다. 다시 입력해 주세요.`, 'error');
      charInput.focus();
      return;
    }

    const submitButton = saveSheet.querySelector('[type="submit"]');
    submitButton.disabled = true;
    showNotice('저장 중...', '사진과 위치 정보를 저장하고 있습니다.', 'info'); // 저장 시작 시 로딩 메시지 표시

    try {
      const timestamp = Date.now();
      const location = await extractExifData(fullImageBlob);

      await saveImageToOpfs(croppedImageBlob, `crop_${timestamp}.png`);
      await saveImageToOpfs(fullImageBlob, `full_${timestamp}.jpg`);

      // DB에 아이템 추가
      await addCollectionItem({ charId, createdAt: location.createdAt, cropFileName: `crop_${timestamp}.png`, fullFileName: `full_${timestamp}.jpg`, lat: location.lat, lng: location.lng });

      saveSheet.hidden = true;
      showNotice('도감에 저장했어요', `'${charId}' 기록을 추가했습니다.`, 'success'); // 성공 메시지
      showNotice('도감에 저장했어요', `'${charId}' 기록을 추가했습니다.`, 'success');
      resetToCaptureState(); // 성공 후 카메라 뷰로 리셋
    } catch (error) {
      showNotice('저장하지 못했어요', error.message || '잠시 후 다시 시도해 주세요.', 'error');
    } finally {
      submitButton.disabled = false;
      // showNotice는 이미 catch/try 블록에서 호출되므로, 여기서 추가적인 닫기 로직은 필요 없습니다.
    }
  });

  function resetToCaptureState() {
    cropper?.destroy();
    cropper = null;
    sourceImg.hidden = true;
    sourceImg.onload = null;
    sourceImg.removeAttribute('src');
    if (sourceObjectUrl) {
      URL.revokeObjectURL(sourceObjectUrl);
      sourceObjectUrl = null;
    }
    saveSheet.hidden = true; // 저장 시트 숨김
    charInput.value = ''; // 입력 필드 초기화
    cropHint.hidden = true; // 크롭 힌트 숨김
    video.hidden = false;
    // btnSnap 관련 로직 제거, 전역 셔터 버튼이 관리
    btnScanDocument.hidden = true; // 스캔 버튼 숨김
    btnSave.hidden = true;
    btnCancel.hidden = true;
    fullImageBlob = null;
    croppedImageBlob = null;
    setShutterButtonCameraMode(); // 전역 셔터 버튼을 다시 카메라 모드로 설정
  }

  btnCancel.addEventListener('click', resetToCaptureState);

  startCamera();
  // 뷰 정리 함수: 카메라 스트림 중지, 크로퍼 파괴, OCR 워커 종료, 그리고 전역 셔터 버튼 상태 복원
  return () => {
    currentStream?.getTracks().forEach((track) => track.stop()); currentStream = null;
    cropper?.destroy(); cropper = null; if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
    destroyScanner(); // 스캐너 인스턴스 정리
    restoreShutterButtonNavMode(); // 전역 셔터 버튼을 원래 네비게이션 상태로 복원
    isCaptureViewActive = false; // 뷰가 정리될 때 비활성화 플래그 설정
  };
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
