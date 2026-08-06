import { db } from '../db/index.js';
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
      <div id="kana-column-guide" class="kana-column-guide" aria-hidden="true"><span>a</span><span>i</span><span>u</span><span>e</span><span>o</span></div>
      <p id="search-summary" class="search-summary"></p>
      <div id="grid-container" class="character-grid"></div>
    </section>
  `;

  const grid = container.querySelector('#grid-container');
  const input = container.querySelector('#character-search');
  const summary = container.querySelector('#search-summary');
  const columnGuide = container.querySelector('#kana-column-guide');
  let activeType = 'hiragana';
  let characters = [];
  let collectedMap = new Map();

  async function load(type) {
    grid.innerHTML = '<p class="grid-message">도감을 펼치는 중…</p>';
    const [dataModule, collected] = await Promise.all([loadCharacterData(type), db.collections.toArray()]);
    characters = sortByKanaRow(dataModule.default);
    columnGuide.hidden = type === 'kanji';
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
    for (const [index, item] of filtered.entries()) {
      const records = collectedMap.get(item.id) || [];
      const card = document.createElement('button');
      card.type = 'button';
      const startsRow = index === 0 || item.row !== filtered[index - 1].row;
      card.className = `collection-card ${records.length ? 'is-collected' : ''} ${startsRow ? 'row-start' : ''}`;
      const column = getKanaColumn(item, characters);
      if (column) card.style.gridColumnStart = column;
      card.setAttribute('aria-label', `${item.id} ${records.length ? '수집됨' : '미수집'}`);
      if (records.length) {
        const imageUrl = await getImageUrlFromOpfs(records.at(-1).cropFileName);
        card.innerHTML = `<img src="${imageUrl}" alt="${item.id}"><span class="card-character">${item.id}</span>${records.length > 1 ? `<em>+${records.length}</em>` : ''}`;
      } else {
        card.innerHTML = `<span class="card-character">${item.id}</span>`;
      }
      card.addEventListener('click', () => showNotice(item.id, records.length ? `${records.length}번 수집한 글자예요.` : '아직 수집하지 않은 글자예요.'));
      grid.appendChild(card);
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

function getKanaColumn(item, allCharacters) {
  if (!item.row) return null;
  const indexInRow = allCharacters.filter((character) => character.row === item.row).findIndex((character) => character.id === item.id);
  // In the y row, the absent yi/ye columns remain intentionally empty.
  if (item.row === 'ya') return [1, 3, 5][indexInRow] || null;
  return indexInRow + 1;
}

function sortByKanaRow(characters) {
  // The source alternates plain and voiced characters (か, が, き, ぎ…).
  // Keep each row together so ka appears before ga, sa before za, and so on.
  const rowOrder = ['a', 'ka', 'ga', 'sa', 'za', 'ta', 'da', 'na', 'ha', 'ba', 'pa', 'ma', 'ya', 'ra', 'wa', 'n', 'va'];
  return [...characters].sort((left, right) => {
    const leftIndex = rowOrder.indexOf(left.row);
    const rightIndex = rowOrder.indexOf(right.row);
    if (leftIndex === -1 || rightIndex === -1) return 0;
    return leftIndex - rightIndex;
  });
}
