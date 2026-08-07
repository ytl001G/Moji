import { db } from './db/index.js';
import { renderCaptureView } from './views/captureView.js';

let currentViewCleanup = null; // 현재 활성화된 뷰의 정리 함수를 저장
let handleSnapClickRef = null; // captureView에서 설정할 셔터 클릭 핸들러 참조
let btnShutterGlobal = null; // 전역 카메라/셔터 버튼 참조
let originalShutterButtonProps = {}; // btnShutterGlobal의 원래 속성을 저장

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

  // btnShutterGlobal이 아직 초기화되지 않았다면 초기화
  if (!btnShutterGlobal) {
    btnShutterGlobal = document.getElementById('btn-camera-shutter');
    // originalShutterButtonProps는 initApp에서 설정되므로 여기서는 초기화만 확인합니다.
    // btnShutterGlobal은 initApp에서 초기 네비게이션 이벤트 리스너를 가집니다.
    // handleSnapClickRef는 captureView에서 설정됩니다.
  }

  // 이전 뷰의 정리 함수가 있다면 호출하고 초기화
  if (currentViewCleanup) {
    currentViewCleanup();
    currentViewCleanup = null;
  }

  // --- Start: Centralized button state management ---

  displayZone.innerHTML = '';
  
  // 모든 뷰 전환 시, 카메라 버튼의 모든 리스너를 제거하고 현재 뷰에 맞는 리스너를 다시 설정
  if (btnShutterGlobal) {
    // 기존에 추가된 모든 리스너 제거 (중복 방지 및 상태 초기화)
    if (originalShutterButtonProps.navHandler) {
      btnShutterGlobal.removeEventListener('click', originalShutterButtonProps.navHandler);
    }
    if (handleSnapClickRef) { // captureView에서 설정된 셔터 핸들러가 있다면 제거
      btnShutterGlobal.removeEventListener('click', handleSnapClickRef);
      handleSnapClickRef = null; // 참조도 초기화
    }

    // 항상 기본 네비게이션 상태로 복원
    btnShutterGlobal.innerHTML = originalShutterButtonProps.innerHTML; // UI 복원
    btnShutterGlobal.className = originalShutterButtonProps.className; // UI 복원
    btnShutterGlobal.disabled = originalShutterButtonProps.disabled; // UI 복원
    btnShutterGlobal.addEventListener('click', originalShutterButtonProps.navHandler); // 네비게이션 핸들러 다시 연결
  }

  updateActiveNavButton(viewName);

  try {
    switch (viewName) {
      case 'collection':
        const { renderCollectionPlanView } = await import('./views/collectionPlanView.js');
        await renderCollectionPlanView(displayZone);
        break;

      case 'capture':
        currentViewCleanup = renderCaptureView(displayZone, btnShutterGlobal, originalShutterButtonProps, (handler) => { handleSnapClickRef = handler; });
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
  // 카메라 버튼은 이 로직에서 제외됩니다. 자체적으로 상태를 관리합니다.
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
  btnShutterGlobal = document.getElementById('btn-camera-shutter'); // 전역 버튼 참조 초기화
  const btnMap = document.getElementById('nav-map');
  const btnPoster = document.getElementById('nav-poster');

  if (btnCollection) {
    btnCollection.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('collection');
    });
  }

  // 전역 셔터 버튼의 초기 네비게이션 클릭 핸들러 설정
  if (btnShutterGlobal) {
    originalShutterButtonProps = { innerHTML: btnShutterGlobal.innerHTML, className: btnShutterGlobal.className, disabled: btnShutterGlobal.disabled };
    originalShutterButtonProps.navHandler = (e) => { // 초기 네비게이션 핸들러 정의
      e.preventDefault();
      navigateTo('capture');
    };
    // 초기에는 네비게이션 핸들러를 직접 추가하지 않고, navigateTo에서 관리하도록 합니다.
    // navigateTo('collection') 호출 시 자동으로 navHandler가 추가됩니다.
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