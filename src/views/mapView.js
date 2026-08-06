import { getAllCollectedItems } from '../db/index.js';
import { showNotice } from '../components/notice.js';

const MAP_PADDING = 12;

export async function renderMapView(container) {
  const items = await getAllCollectedItems();
  const locatedItems = items.filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng));

  container.innerHTML = `
    <section class="travel-map-view">
      <div class="journal-title-row">
        <div>
          <p class="journal-kicker">TRAVEL RECORD</p>
          <h2>나의 문자 지도</h2>
        </div>
        <span class="map-count">${locatedItems.length} places</span>
      </div>
      <p class="map-intro">사진에 기록된 위치를 따라, 만난 글자들을 여행 지도에 남겨요.</p>
      <div class="paper-map" role="img" aria-label="수집한 글자의 위치 지도">
        <span class="map-route route-one"></span>
        <span class="map-route route-two"></span>
        <div id="map-pins" class="map-pins"></div>
        <p id="map-empty" class="map-empty">아직 기록된 위치가 없어요.<br>다음 사진을 찍을 때 위치 권한을 허용해 보세요.</p>
      </div>
      <div class="map-records">
        <h3>최근 발자국</h3>
        <div id="map-record-list" class="map-record-list"></div>
      </div>
    </section>
  `;

  const pins = container.querySelector('#map-pins');
  const empty = container.querySelector('#map-empty');
  const list = container.querySelector('#map-record-list');

  if (!locatedItems.length) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    const bounds = getBounds(locatedItems);
    locatedItems.forEach((item, index) => {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'map-pin';
      pin.textContent = item.charId || '字';
      pin.style.left = `${scale(item.lng, bounds.minLng, bounds.maxLng)}%`;
      pin.style.top = `${100 - scale(item.lat, bounds.minLat, bounds.maxLat)}%`;
      pin.title = item.address || `수집 기록 ${index + 1}`;
      pin.addEventListener('click', () => showRecord(item));
      pins.appendChild(pin);
    });
  }

  const recentItems = [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
  if (!recentItems.length) {
    list.innerHTML = '<p class="record-empty">첫 번째 글자를 수집하면 여기에 여행 기록이 쌓입니다.</p>';
    return;
  }

  recentItems.forEach((item) => {
    const record = document.createElement('button');
    record.type = 'button';
    record.className = 'map-record';
    const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('ko-KR') : '날짜 미상';
    record.innerHTML = `<strong>${escapeHtml(item.charId || '글자')}</strong><span>${escapeHtml(item.address || date)}</span>`;
    record.addEventListener('click', () => showRecord(item));
    list.appendChild(record);
  });
}

function getBounds(items) {
  const lats = items.map((item) => item.lat);
  const lngs = items.map((item) => item.lng);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}

function scale(value, min, max) {
  if (min === max) return 50;
  return MAP_PADDING + ((value - min) / (max - min)) * (100 - MAP_PADDING * 2);
}

function showRecord(item) {
  const date = item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '날짜 미상';
  showNotice(item.charId || '글자', `${item.address || '주소 기록 없음'} · ${date}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
