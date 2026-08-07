import { getAllCollectedItems } from '../db/index.js';
import { getImageUrlFromOpfs } from '../db/opfs.js';

export async function renderPosterView(container) {
  container.innerHTML = `
    <div class="poster-view-container" style="padding: 16px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; background: #121212;">
      <div style="display: flex; gap: 8px;">
        <input type="text" id="poster-text-input" placeholder="조합할 문자를 입력하세요 (예: あい)" style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid #2a2a2a; background: #1e1e1e; color: #fff; font-size: 0.9rem;" value="あ" />
        <button id="btn-generate-poster" style="padding: 12px 18px; border-radius: 8px; border: none; background: #ff3b30; color: #fff; font-weight: bold; cursor: pointer;">생성</button>
      </div>

      <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: #000; border-radius: 12px; overflow: hidden; padding: 10px;">
        <canvas id="poster-canvas" width="600" height="800" style="max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"></canvas>
      </div>

      <button id="btn-download-poster" style="width: 100%; padding: 14px; border-radius: 12px; border: none; background: #30d158; color: #fff; font-weight: bold; font-size: 1rem; cursor: pointer;">
        🖼️ 포스터 이미지 저장
      </button>
    </div>
  `;

  const input = container.querySelector('#poster-text-input');
  const btnGenerate = container.querySelector('#btn-generate-poster');
  const btnDownload = container.querySelector('#btn-download-poster');
  const canvas = container.querySelector('#poster-canvas');
  const ctx = canvas.getContext('2d');

  let collectedItems = []; // collectedItems를 함수 내에서 로드하도록 변경

  // 포스터 그리기 함수
  async function drawPoster(text) {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // 캔버스 초기화
    // 배경 그리기 (어두운 레트로 포스터 테마)
    ctx.fillStyle = '#fff7e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 상단 타이틀
    ctx.fillStyle = '#9e7041';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Moji Travel Letter', canvas.width / 2, 50);

    const chars = text.split('');
    if (chars.length === 0) return;

    const cols = Math.min(chars.length, 3);
    // const rows = Math.ceil(chars.length / cols); // rows는 직접 사용되지 않음
    const boxSize = 140; // 각 이미지/글자 박스의 크기

    collectedItems = await getAllCollectedItems(); // 매번 최신 데이터 로드
    const gap = 20; // 박스 간 간격

    const startX = (canvas.width - (cols * boxSize + (cols - 1) * gap)) / 2;
    const startY = 120;

    // 이미지 로딩을 병렬로 처리하기 위한 배열
    const imagePromises = [];
    const charPositions = [];

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (boxSize + gap);
      const y = startY + row * (boxSize + gap);
      charPositions.push({ char, x, y });

      // 해당 글자가 DB에 수집되어 있는지 확인
      const matched = collectedItems.find(item => item.charId === char);

      if (matched) {
        imagePromises.push((async () => {
          const imgUrl = await getImageUrlFromOpfs(matched.cropFileName);
          const img = new Image();
          img.src = imgUrl;
          await new Promise(r => img.onload = r);
          URL.revokeObjectURL(imgUrl); // Object URL 해제
          return { img, x, y };
        })());
      } else {
        imagePromises.push(Promise.resolve(null)); // 미수집 글자는 null로 처리
      }
    }

    const loadedImages = await Promise.all(imagePromises);

    ctx.textBaseline = 'middle'; // 텍스트 정렬 기준 설정 (한 번만)

    loadedImages.forEach((data, i) => {
      const { char, x, y } = charPositions[i];

      if (data) { // 수집된 글자 이미지
        const { img } = data;

        ctx.drawImage(img, x, y, boxSize, boxSize);
        ctx.strokeStyle = '#b96d58';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, boxSize, boxSize);
      } else {
        // 미수집 글자는 회색 프레임으로 대체
        ctx.fillStyle = '#eee0ca';
        ctx.fillRect(x, y, boxSize, boxSize);
        ctx.fillStyle = '#725b48';
        ctx.font = 'bold 40px Georgia, serif'; // 폰트 설정
        ctx.textAlign = 'center'; // 텍스트 정렬
        ctx.fillText(char, x + boxSize / 2, y + boxSize / 2);
      }
    });
  }

  btnGenerate.addEventListener('click', () => drawPoster(input.value.trim()));
  btnDownload.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `moji_poster_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // 초기 렌더링
  drawPoster(input.value.trim());
}
