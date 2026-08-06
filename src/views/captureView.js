import { extractAndAlignSignboard } from '../services/scanner.js';
import { initCropper, getCroppedCanvasBlob, destroyCropper } from '../services/cropper.js';
import { recognizeChar } from '../services/ocr.js';
import { saveImageToOpfs } from '../db/opfs.js';
import { addCollectionItem } from '../db/index.js';
import { extractExifData } from '../utils/exif.js';
import { showNotice } from '../components/notice.js';

let currentStream = null; // 카메라 스트림을 모듈 스코프에 유지하여 정리 가능하도록

export function renderCaptureView(container) {
  // 한 손 UX에 최적화된 촬영/보정 인터페이스 HTML
  container.innerHTML = `
    <div class="capture-container" style="display: flex; flex-direction: column; height: 100%; padding: 16px; background: #121212;">
      <div id="camera-preview-zone" style="flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: #000; border-radius: 12px; overflow: hidden;">
        <video id="camera-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
        <img id="crop-target-img" style="display: none; max-width: 100%; max-height: 100%;" />
        <div id="loading-spinner" style="display: none; position: absolute; color: #ffcc00; font-weight: bold; background: rgba(0,0,0,0.7); padding: 12px 20px; border-radius: 20px;">
          ⚡ 수평 자동 보정 및 OCR 인식 중...
        </div>
      </div>

      <div class="capture-controls" style="margin-top: 16px; display: flex; justify-content: space-around; align-items: center;">
        <button id="btn-snap" style="width: 70px; height: 70px; border-radius: 50%; background: #ff3b30; color: #fff; border: none; font-size: 1.5rem; font-weight: bold; cursor: pointer;">
          📸
        </button>
        <button id="btn-save-crop" style="display: none; padding: 12px 24px; border-radius: 24px; background: #30d158; color: #fff; border: none; font-weight: bold; cursor: pointer;">
          도감에 저장
        </button>
        <button id="btn-cancel" style="display: none; padding: 12px 20px; border-radius: 24px; background: #3a3a3c; color: #fff; border: none; cursor: pointer;">
          다시 찍기
        </button>
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

  // 1. 카메라 스트림 켜기
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showNotice('카메라를 열 수 없어요', '모바일 카메라는 HTTPS로 접속한 앱에서만 사용할 수 있어요.', 'error');
    return () => {};
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then((mediaStream) => {
      currentStream = mediaStream; // 모듈 스코프 변수에 할당
      video.srcObject = currentStream;
    })
    .catch((err) => {
      console.error('카메라 접근 실패:', err);
      const message = err.name === 'NotAllowedError'
        ? '브라우저 설정에서 카메라 권한을 허용한 뒤 다시 시도해 주세요.'
        : '카메라를 찾지 못했어요. HTTPS 연결과 다른 앱의 카메라 사용 여부를 확인해 주세요.';
      showNotice('카메라를 열 수 없어요', message, 'error');
    });

  // 2. 셔터 버튼 터치 시: 촬영 -> scanner.js (자동 수평) -> cropper.js & ocr.js
  btnSnap.addEventListener('click', async () => {
    spinner.style.display = 'block';
    btnSnap.disabled = true; // 중복 클릭 방지

    try {
      // Video 프레임을 Canvas 캡처
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      // 원본 이미지를 Blob으로 보관
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
      if (!blob) {
        throw new Error('Failed to capture image from video.');
      }
      fullImageBlob = blob;

      // scanner.js: jscanify로 간판 수평/정면 보정
      const alignedCanvas = await extractAndAlignSignboard(canvas);
      if (!alignedCanvas) {
        throw new Error('Failed to extract and align signboard.');
      }
      cropImg.src = alignedCanvas.toDataURL('image/png');

      // UI 교체 (Video 숨기고 크롭 이미지 노출)
      video.style.display = 'none';
      cropImg.style.display = 'block';
      btnSnap.style.display = 'none';
      btnSnap.disabled = false; // 재활성화
      btnSave.style.display = 'block';
      btnCancel.style.display = 'block';

      // cropper.js 초기화
      initCropper(cropImg);
      console.log('Cropper initialized.');

      // ocr.js: Tesseract.js로 글자 자동 추천 인식
      const suggestedChar = await recognizeChar(cropImg.src);
      spinner.style.display = 'none';

      if (suggestedChar) {
        console.log('추천된 글자:', suggestedChar);
      }
    } catch (error) {
      console.error('촬영 및 인식 중 오류 발생:', error);
      showNotice('촬영 처리 중 오류', error.message || '알 수 없는 오류가 발생했어요.', 'error');
      // 오류 발생 시 UI를 초기 상태로 되돌리거나 적절히 처리
      destroyCropper(); // 혹시 모를 크롭퍼 잔여물 제거
    } finally {
      spinner.style.display = 'none'; // 오류 발생 여부와 관계없이 스피너 숨김
    }
  });

  // 3. 다시 찍기 버튼
  btnCancel.addEventListener('click', () => {
    destroyCropper();
    cropImg.style.display = 'none';
    video.style.display = 'block';
    btnSnap.style.display = 'block';
    btnSave.style.display = 'none';
    btnSnap.disabled = false; // 셔터 버튼 재활성화
    btnCancel.style.display = 'none';
  });

  // 4. 저장 버튼: 오려낸 이미지 OPFS & Dexie DB 저장
  btnSave.addEventListener('click', async () => {
    try {
      const croppedBlob = await getCroppedCanvasBlob();
      const timeStamp = Date.now();
      
      const cropFileName = `crop_${timeStamp}.png`;
      const fullFileName = `full_${timeStamp}.jpg`;
      const location = await extractExifData(fullImageBlob);

      // OPFS 고화질 파일 저장
      await saveImageToOpfs(croppedBlob, cropFileName);
      if (fullImageBlob) {
        await saveImageToOpfs(fullImageBlob, fullFileName);
      }

      // Dexie.js 메타데이터 저장
      await addCollectionItem({
        charId: 'あ', // 실제 구현 시 OCR 추천 글자 또는 유저 지정 글자
        cropFileName,
        fullFileName,
        lat: location.lat,
        lng: location.lng,
      });

      showNotice('도감에 저장했어요', '여행 기록과 문자 도감에서 확인할 수 있어요.', 'success');
      
      // 스트림 정리 후 화면 리셋
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null; // 스트림 변수 초기화
      }
      destroyCropper();
      
    } catch (error) {
      console.error('저장 실패:', error);
      showNotice('저장하지 못했어요', '잠시 후 다시 시도해 주세요.', 'error');
    }
    // 저장 실패 시에도 UI를 초기 상태로 되돌리는 것이 좋을 수 있습니다.
    // 또는 사용자가 다시 시도할 수 있도록 현재 상태를 유지할 수도 있습니다.
    // 여기서는 일단 현재 상태를 유지하는 것으로 가정합니다.
  });

  // 뷰가 DOM에서 제거될 때 호출될 정리 함수 반환
  return () => {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    destroyCropper(); // 크롭퍼도 함께 정리
  };
}
