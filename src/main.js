import './assets/styles/main.css';
import './assets/styles/thumb-zone.css';
import './assets/styles/card-3d.css';
import 'cropperjs/dist/cropper.css'; // Cropper.js 스타일 추가
import { registerSW } from 'virtual:pwa-register';

import { initApp } from './app.js';
import { requestInitialPermissions } from './services/permissions.js';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Activate the new worker and reload into the newly deployed build.
    updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    registration?.update();
  },
});

// DOM 요소가 모두 준비된 시점에 안전하게 초기화 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { requestInitialPermissions(); initApp(); });
} else {
  requestInitialPermissions();
  initApp();
}
