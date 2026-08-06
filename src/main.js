import './assets/styles/main.css';
import './assets/styles/thumb-zone.css';
import './assets/styles/card-3d.css';

import { initApp } from './app.js';

// DOM 요소가 모두 준비된 시점에 안전하게 초기화 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initApp());
} else {
  initApp();
}