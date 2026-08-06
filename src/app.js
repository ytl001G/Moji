import { db } from './db/index.js';
import { renderCaptureView } from './views/captureView.js';

let currentViewCleanup = null; // 현재 활성화된 뷰의 정리 함수를 저장

export async function updateStatsBadge() {
  const statsBadge = document.getElementById('stats-badge');
  if (!statsBadge) return;

  try {
    const allCollectedItems = await db.collections.toArray();
    const uniqueCharIds = new Set(allCollectedItems.map(item => item.charId));
    const collectedCount = uniqueCharIds.size;
    const TOTAL_TARGET_CHARS = 2228; 
    const progressPercentage = ((collectedCount / TOTAL_TARGET_CHARS) * 100).toFixed(1);

    statsBadge.textContent = `수집률 ${progressPercentage}% (${collectedCount}/${TOTAL_TARGET_CHARS})`;
  } catch (error) {
    statsBadge.textContent = `수집률 0% (0/0)`;
  }
}

export async function navigateTo(viewName) {
  console.log(`[Moji Router] ${viewName} 화면으로 이동 시도 중...`);
  const displayZone = document.getElementById('main-content');
  if (!displayZone) {
    console.error('#main-content 요소를 찾을 수 없습니다.');
    return;
  }

  // 이전 뷰의 정리 함수가 있다면 호출하고 초기화
  if (currentViewCleanup) {
    currentViewCleanup();
    currentViewCleanup = null;
  }

  displayZone.innerHTML = '';
  updateActiveNavButton(viewName);

  try {
    switch (viewName) {
      case 'collection':
        const { renderCollectionPlanView } = await import('./views/collectionPlanView.js');
        await renderCollectionPlanView(displayZone);
        break;

      case 'capture':
        currentViewCleanup = renderCaptureView(displayZone); // 정리 함수를 저장
        break;

      case 'map':
        const { renderMapView } = await import('./views/mapView.js');
        await renderMapView(displayZone);
        break;

      case 'poster':
        const { renderPosterView } = await import('./views/posterView.js');
        await renderPosterView(displayZone);
        break;
    }
  } catch (err) {
    console.error(`[Moji Router Error] ${viewName} 화면 로드 중 오류 발생:`, err);
    displayZone.innerHTML = `<div style="padding: 20px; text-align: center; color: #ff3b30;">⚠️ 화면 로딩 중 오류가 발생했습니다.<br/><small>${err.message}</small></div>`;
  }

  await updateStatsBadge();
}

function updateActiveNavButton(activeView) {
  const navButtons = {
    collection: document.getElementById('nav-collection'),
    map: document.getElementById('nav-map'),
    poster: document.getElementById('nav-poster')
  };

  Object.entries(navButtons).forEach(([viewKey, btnElement]) => {
    if (btnElement) {
      if (viewKey === activeView) {
        btnElement.classList.add('active');
      } else {
        btnElement.classList.remove('active');
      }
    }
  });
}

export function initApp() {
  console.log('[Moji Init] 앱 이벤트 바인딩 시작...');

  const btnCollection = document.getElementById('nav-collection');
  const btnShutter = document.getElementById('btn-camera-shutter');
  const btnMap = document.getElementById('nav-map');
  const btnPoster = document.getElementById('nav-poster');

  if (btnCollection) {
    btnCollection.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('📖 도감 버튼 클릭됨');
      navigateTo('collection');
    });
  }

  if (btnShutter) {
    btnShutter.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('📷 셔터 버튼 클릭됨');
      navigateTo('capture');
    });
  }

  if (btnMap) {
    btnMap.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('🗺️ 지도 버튼 클릭됨');
      navigateTo('map');
    });
  }

  if (btnPoster) {
    btnPoster.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('🖼️ 포스터 버튼 클릭됨');
      navigateTo('poster');
    });
  }

  // 초기 뷰(도감) 로드
  navigateTo('collection');
}