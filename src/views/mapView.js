import { getAllCollectedItems } from '../db/index.js';
import { showNotice } from '../components/notice.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster'; // MarkerClusterGroup 플러그인 임포트

const DEFAULT_MAP_CENTER = [35.6812, 139.7671]; // 도쿄역 근처

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
      <div class="leaflet-map-wrap">
        <div id="leaflet-map" class="leaflet-map" aria-label="수집한 글자의 위치 지도"></div>
        <p id="map-empty" class="map-empty">아직 기록된 위치가 없어요.<br>다음 사진을 찍을 때 위치 권한을 허용해 보세요.</p>
      </div>
      <div class="map-records">
        <h3>최근 발자국</h3>
        <div id="map-record-list" class="map-record-list"></div>
      </div>
    </section>
  `;

  const mapElement = container.querySelector('#leaflet-map');
  const empty = container.querySelector('#map-empty');
  const list = container.querySelector('#map-record-list');
  const map = L.map(mapElement, { zoomControl: true, attributionControl: true }).setView(DEFAULT_MAP_CENTER, 11);
  const markers = L.markerClusterGroup(); // 마커 클러스터 그룹 생성

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  if (!locatedItems.length) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    locatedItems.forEach((item, index) => {
      const marker = L.marker([item.lat, item.lng], {
        title: item.address || `수집 기록 ${index + 1}`,
        icon: L.divIcon({
          className: 'moji-map-marker-wrap',
          html: `<span class="moji-map-marker">${escapeHtml(item.charId || '字')}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 38],
        }),
      }).addTo(map);
      marker.bindPopup(`<strong>${escapeHtml(item.charId || '글자')}</strong><br>${escapeHtml(item.address || formatDate(item.createdAt))}`); // 팝업 내용 개선
      marker.on('click', () => showRecord(item));
      markers.addLayer(marker); // 마커를 클러스터 그룹에 추가
    });

    const bounds = L.latLngBounds(locatedItems.map((item) => [item.lat, item.lng]));
    if (locatedItems.length === 1) map.setView(bounds.getCenter(), 16);
    else map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
  }

  map.addLayer(markers); // 클러스터 그룹을 지도에 추가
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

  // 뷰 정리 함수 반환
  return () => {
    map.remove(); // Leaflet 맵 인스턴스 제거
  };
}

function showRecord(item) {
  const date = formatDate(item.createdAt, true);
  showNotice(item.charId || '글자', `${item.address || '주소 정보 없음'} · ${date}`); // 주소 정보가 없을 때 메시지 개선
}

function formatDate(value, withTime = false) {
  if (!value) return '날짜 미상';
  return new Date(value).toLocaleString('ko-KR', withTime ? undefined : { dateStyle: 'medium' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
