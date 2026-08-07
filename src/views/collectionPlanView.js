import { db, deleteCollectionItem } from '../db/index.js';
import { getImageUrlFromOpfs } from '../db/opfs.js';
import { showNotice } from '../components/notice.js';

export async function renderCollectionPlanView(container) {
  container.innerHTML = `
    <section class="collection-view">
      <div class="collection-heading"><p>MOJI ARCHIVE</p><h2>문자 도감</h2></div>
      <label class="character-search"><span>⌕</span><input id="character-search" type="search" placeholder="가나 또는 한자를 검색하세요" autocomplete="off"></label>
      <div class="category-tabs" role="tablist">
        <button class="tab-btn active" data-type="hiragana" type="button">히라가나</button>
        <button class="tab-btn" data-type="katakana" type="button">가타카나</button>
        <button class="tab-btn" data-type="kanji" type="button">한자</button>
      </div>
      <p id="search-summary" class="search-summary"></p>
      <div id="grid-container" class="character-grid"></div>
    </section>
  `;

  const grid = container.querySelector('#grid-container');
  const input = container.querySelector('#character-search');
  const summary = container.querySelector('#search-summary');
  let activeType = 'hiragana';
  let characters = [];
  let collectedMap = new Map();

  async function load(type) {
    grid.innerHTML = '<p class="grid-message">도감을 펼치는 중…</p>';
    const [dataModule, collected] = await Promise.all([loadCharacterData(type), db.collections.toArray()]);
    characters = dataModule.default;
    collectedMap = new Map();
    collected.forEach((item) => {
      const records = collectedMap.get(item.charId) || [];
      records.push(item);
      collectedMap.set(item.charId, records);
    });
    render();
  }

  async function render() {
    const query = input.value.trim().toLocaleLowerCase();
    const filtered = characters.filter((item) => Object.values(item).some((value) => String(value).toLocaleLowerCase().includes(query)));
    summary.textContent = query ? `“${input.value.trim()}” 검색 결과 ${filtered.length}개` : `${activeType === 'kanji' ? '한자' : '가나'} ${characters.length}자`;
    grid.innerHTML = '';
    if (!filtered.length) {
      grid.innerHTML = '<p class="grid-message">찾는 문자가 없어요.</p>';
      return;
    }

    for (const item of filtered) {
      const records = collectedMap.get(item.id) || [];
      const characterRow = document.createElement('section');
      characterRow.className = `character-clothesline ${records.length ? 'is-collected' : ''}`;

      const charItem = document.createElement('button');
      charItem.type = 'button';
      charItem.className = 'clothesline-char-item';
      charItem.setAttribute('aria-label', `${item.id} ${records.length ? '수집됨' : '미수집'}`);
      charItem.textContent = item.id;
      charItem.addEventListener('click', () => showNotice(item.id, records.length ? `${records.length}번 수집한 글자예요.` : '아직 수집하지 않은 글자예요.'));
      characterRow.appendChild(charItem);

      const clotheslineTrack = document.createElement('div');
      clotheslineTrack.className = 'clothesline-track';
      if (!records.length) {
        clotheslineTrack.innerHTML = '<span class="empty-clothesline">아직 수집한 사진이 없어요.</span>';
      } else {
        const imageUrls = await Promise.all(records.map((record) => getImageUrlFromOpfs(record.cropFileName)));
        imageUrls.forEach((imgUrl, index) => {
          if (!imgUrl) return;
          const photoButton = document.createElement('button');
          photoButton.type = 'button';
          photoButton.className = 'collected-photo-button';
          photoButton.title = '이 수집 사진 삭제';
          photoButton.setAttribute('aria-label', `${item.id} 수집 사진 ${index + 1} 삭제`);
          const image = document.createElement('img');
          image.src = imgUrl;
          image.alt = `${item.id} 수집 사진 ${index + 1}`;
          image.className = 'collected-image-thumbnail';
          photoButton.appendChild(image);
          photoButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (!window.confirm('이 수집 사진을 삭제할까요? 되돌릴 수 없습니다.')) return;
            await deleteCollectionItem(records[index].id);
            const remaining = records.filter((record) => record.id !== records[index].id);
            collectedMap.set(item.id, remaining);
            await render();
          });
          clotheslineTrack.appendChild(photoButton);
        });
      }
      characterRow.appendChild(clotheslineTrack);
      grid.appendChild(characterRow);
    }
  }

  input.addEventListener('input', render);
  container.querySelectorAll('.tab-btn').forEach((button) => button.addEventListener('click', async () => {
    activeType = button.dataset.type;
    container.querySelectorAll('.tab-btn').forEach((tab) => tab.classList.toggle('active', tab === button));
    await load(activeType);
  }));

  try { await load(activeType); } catch (error) { grid.innerHTML = '<p class="grid-message is-error">도감을 불러오지 못했습니다.</p>'; }
}
function loadCharacterData(type) {
  const loaders = {
    hiragana: () => import('../data/ja/hiragana.json'),
    katakana: () => import('../data/ja/katakana.json'),
    kanji: () => import('../data/ja/kanji.json')
  };
  return loaders[type]();
}

