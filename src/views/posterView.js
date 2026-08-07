import { getAllCollectedItems } from '../db/index.js';
import { getImageUrlFromOpfs } from '../db/opfs.js';

const PAPER_COLORS = ['#e4604e', '#e5b93f', '#6e9d43', '#2c91c8', '#c7507a', '#5a66a5', '#eee2bb'];
const SHAPES = ['torn', 'slant', 'ticket', 'notch'];

export async function renderPosterView(container) {
  container.innerHTML = `
    <section class="poster-view-container">
      <div class="poster-controls">
        <label class="poster-text-field"><span>문자 조합</span><input type="text" id="poster-text-input" placeholder="예: あいうえお" value="あいう" maxlength="24" /></label>
        <label class="poster-select"><span>캔버스</span><select id="poster-format"><option value="portrait">세로 포스터</option><option value="landscape">가로 포스터</option></select></label>
        <label class="poster-select"><span>프레임</span><select id="poster-frame-style"><option value="mixed">섞어서</option><option value="torn">찢어진 종이</option><option value="polygon">다각형</option></select></label>
        <button id="btn-generate-poster" type="button">새 조합 만들기</button>
      </div>
      <div class="poster-actions"><label class="poster-upload"><input id="poster-image-input" type="file" accept="image/*" hidden><span>＋ 갤러리 배경 사진</span></label><span id="poster-photo-count">배경 없음</span></div>
      <p class="poster-hint">갤러리 사진은 포스터 배경으로 깔립니다. 한 손가락으로 글자를 옮기고, 글자 위에서 두 손가락을 벌리거나 돌리면 그 글자만 크기·각도를 바꿀 수 있어요.</p>
      <div class="poster-canvas-wrap"><canvas id="poster-canvas" width="900" height="1200"></canvas></div>
      <button id="btn-download-poster" class="poster-download" type="button">🖼️ 포스터 이미지 저장</button>
    </section>
  `;

  const input = container.querySelector('#poster-text-input');
  const format = container.querySelector('#poster-format');
  const frameStyle = container.querySelector('#poster-frame-style');
  const imageInput = container.querySelector('#poster-image-input');
  const photoCount = container.querySelector('#poster-photo-count');
  const canvas = container.querySelector('#poster-canvas');
  const ctx = canvas.getContext('2d');
  let backgroundImage = null;
  let posterPieces = [];
  let dragging = null;
  const activePointers = new Map();
  const pointerPieces = new Map();
  let gesture = null;

  async function buildPoster() {
    const text = [...input.value.trim()];
    const isLandscape = format.value === 'landscape';
    canvas.width = isLandscape ? 1200 : 900;
    canvas.height = isLandscape ? 900 : 1200;
    const collected = await getAllCollectedItems();
    const recordsByChar = new Map();
    collected.forEach((item) => {
      const records = recordsByChar.get(item.charId) || [];
      records.push(item);
      recordsByChar.set(item.charId, records);
    });
    const letters = await Promise.all(text.map(async (char, index) => {
      const records = recordsByChar.get(char) || [];
      const candidateIndex = records.length ? Math.floor(Math.random() * records.length) : -1;
      const record = records[candidateIndex];
      return { char, image: record ? await loadPosterImage(record.cropFileName) : null, candidateFiles: records.map((item) => item.cropFileName), candidateIndex, index };
    }));
    posterPieces = createCollageLayout(canvas, letters, frameStyle.value);
    redrawPoster();
  }

  function redrawPoster() {
    drawPaperBackground(ctx, canvas, backgroundImage);
    if (!posterPieces.length) {
      ctx.fillStyle = '#f7efdf';
      ctx.font = '700 42px "Gowun Batang", serif';
      ctx.textAlign = 'center';
      ctx.fillText('조합할 문자나 사진을 추가해 주세요', canvas.width / 2, canvas.height / 2);
      return;
    }
    posterPieces.forEach((piece) => drawPiece(ctx, piece));
  }

  async function showNextCandidate(index) {
    const piece = posterPieces[index];
    if (!piece?.candidateFiles || piece.candidateFiles.length < 2) return;
    piece.candidateIndex = (piece.candidateIndex + 1) % piece.candidateFiles.length;
    const image = await loadPosterImage(piece.candidateFiles[piece.candidateIndex]);
    if (image) {
      piece.image = image;
      redrawPoster();
    }
  }

  container.querySelector('#btn-generate-poster').addEventListener('click', buildPoster);
  format.addEventListener('change', buildPoster);
  frameStyle.addEventListener('change', buildPoster);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') buildPoster(); });
  imageInput.addEventListener('change', async () => {
    backgroundImage = await loadFileImage(imageInput.files[0]);
    photoCount.textContent = backgroundImage ? '배경 사진 적용됨' : '배경을 불러오지 못했어요';
    imageInput.value = '';
    await buildPoster();
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = getCanvasPoint(event, canvas);
    for (let index = posterPieces.length - 1; index >= 0; index -= 1) {
      const piece = posterPieces[index];
      if (point.x >= piece.x && point.x <= piece.x + piece.width && point.y >= piece.y && point.y <= piece.y + piece.height) {
        activePointers.set(event.pointerId, point);
        pointerPieces.set(event.pointerId, index);
        dragging = { index, pointerId: event.pointerId, offsetX: point.x - piece.x, offsetY: point.y - piece.y };
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add('is-dragging');
        if (activePointers.size === 2 && [...pointerPieces.values()].every((pieceIndex) => pieceIndex === index)) {
          const [first, second] = [...activePointers.values()];
          gesture = { index, distance: getDistance(first, second), angle: getAngle(first, second), width: piece.width, height: piece.height, pieceAngle: piece.angle };
          dragging = null;
        }
        return;
      }
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = getCanvasPoint(event, canvas);
    if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, point);
    if (gesture && activePointers.size >= 2) {
      const [first, second] = [...activePointers.values()];
      const piece = posterPieces[gesture.index];
      const scale = Math.max(.35, Math.min(2.5, getDistance(first, second) / gesture.distance));
      piece.width = gesture.width * scale;
      piece.height = gesture.height * scale;
      piece.angle = gesture.pieceAngle + getAngle(first, second) - gesture.angle;
      piece.x = Math.max(0, Math.min(canvas.width - piece.width, piece.x));
      piece.y = Math.max(62, Math.min(canvas.height - piece.height, piece.y));
      redrawPoster();
      return;
    }
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    dragging.moved = true;
    const piece = posterPieces[dragging.index];
    piece.x = Math.max(0, Math.min(canvas.width - piece.width, point.x - dragging.offsetX));
    piece.y = Math.max(62, Math.min(canvas.height - piece.height, point.y - dragging.offsetY));
    redrawPoster();
  });
  const finishDrag = async (event) => {
    const tapIndex = dragging?.pointerId === event.pointerId && !dragging.moved && !gesture ? dragging.index : null;
    activePointers.delete(event.pointerId);
    pointerPieces.delete(event.pointerId);
    if (activePointers.size < 2) gesture = null;
    if (!activePointers.size) { dragging = null; canvas.classList.remove('is-dragging'); }
    if (tapIndex !== null) await showNextCandidate(tapIndex);
  };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  container.querySelector('#btn-download-poster').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `moji_poster_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  await buildPoster();
}

async function loadPosterImage(fileName) {
  const url = await getImageUrlFromOpfs(fileName);
  return loadImageFromUrl(url);
}

async function loadFileImage(file) {
  return loadImageFromUrl(URL.createObjectURL(file));
}

async function loadImageFromUrl(url) {
  if (!url) return null;
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
}

function getDistance(first, second) { return Math.hypot(second.x - first.x, second.y - first.y); }
function getAngle(first, second) { return Math.atan2(second.y - first.y, second.x - first.x); }

function drawPaperBackground(ctx, canvas, backgroundImage) {
  ctx.fillStyle = '#373532';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (backgroundImage) {
    drawImageCover(ctx, backgroundImage, 0, 0, canvas.width, canvas.height);
    const overlay = ctx.createLinearGradient(0, 0, 0, canvas.height);
    overlay.addColorStop(0, 'rgba(20,16,14,.38)');
    overlay.addColorStop(.5, 'rgba(20,16,14,.18)');
    overlay.addColorStop(1, 'rgba(20,16,14,.48)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let i = 0; i < 160; i += 1) ctx.fillRect((i * 71) % canvas.width, (i * 47) % canvas.height, 2, 2);
  ctx.fillStyle = '#fff8ea';
  ctx.font = '700 23px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('MOJI / FOUND LETTERS', 36, 45);
}

function createCollageLayout(canvas, sourcePieces, frameStyle) {
  if (!sourcePieces.length) return [];
  const margin = 48;
  const header = 78;
  const cols = sourcePieces.length <= 3 ? sourcePieces.length : canvas.width > canvas.height ? 5 : 4;
  const gap = 24;
  const cellWidth = (canvas.width - margin * 2 - gap * (cols - 1)) / cols;
  const rows = [];
  sourcePieces.forEach((piece, index) => {
    const rowIndex = Math.floor(index / cols);
    const ratio = piece.image ? piece.image.naturalWidth / piece.image.naturalHeight : [.7, .82, 1.05, .66][index % 4];
    const width = cellWidth * [.88, 1, .92, .8][index % 4];
    const height = Math.min(cellWidth * 1.45, Math.max(cellWidth * .55, width / ratio));
    const row = rows[rowIndex] || { height: 0, pieces: [] };
    row.height = Math.max(row.height, height);
    row.pieces.push({ ...piece, index, col: index % cols, width, height });
    rows[rowIndex] = row;
  });
  const totalHeight = rows.reduce((sum, row) => sum + row.height, 0) + gap * (rows.length - 1);
  const scale = Math.min(1, (canvas.height - header - margin) / totalHeight);
  const scaledCellWidth = cellWidth * scale;
  const scaledGap = gap * scale;
  const startX = (canvas.width - (scaledCellWidth * cols + scaledGap * (cols - 1))) / 2;
  let y = header + Math.max(0, (canvas.height - header - margin - totalHeight * scale) / 2);
  return rows.flatMap((row) => {
    const positioned = row.pieces.map((piece) => {
      const width = piece.width * scale;
      const height = piece.height * scale;
      const shape = frameStyle === 'mixed' ? SHAPES[piece.index % SHAPES.length] : frameStyle === 'polygon' ? ['slant', 'ticket', 'notch'][piece.index % 3] : 'torn';
      return { ...piece, width, height, x: startX + piece.col * (scaledCellWidth + scaledGap) + (scaledCellWidth - width) / 2, y: y + (row.height * scale - height) / 2, shape, angle: (piece.index % 5 - 2) * .035 };
    });
    y += (row.height + gap) * scale;
    return positioned;
  });
}

function drawPiece(ctx, piece) {
  const { width, height, image, char, index, x, y, shape, angle } = piece;
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2); ctx.rotate(angle); ctx.translate(-width / 2, -height / 2);
  ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 6;
  createPiecePath(ctx, shape, width, height);
  ctx.fillStyle = PAPER_COLORS[index % PAPER_COLORS.length]; ctx.fill(); ctx.clip(); ctx.shadowColor = 'transparent';
  if (image) drawImageCover(ctx, image, 0, 0, width, height); else drawFallbackLetter(ctx, char, width, height, index);
  ctx.restore();
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2); ctx.rotate(angle); ctx.translate(-width / 2, -height / 2);
  createPiecePath(ctx, shape, width, height); ctx.strokeStyle = 'rgba(255,255,238,.9)'; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
}

function createPiecePath(ctx, shape, width, height) {
  const r = Math.min(width, height) * .06;
  ctx.beginPath();
  if (shape === 'slant') { ctx.moveTo(r, 0); ctx.lineTo(width, r); ctx.lineTo(width - r, height); ctx.lineTo(0, height - r); }
  else if (shape === 'ticket') { ctx.moveTo(r, 0); ctx.lineTo(width - r, 0); ctx.lineTo(width, height * .16); ctx.lineTo(width - r, height * .5); ctx.lineTo(width, height * .84); ctx.lineTo(width - r, height); ctx.lineTo(r, height); ctx.lineTo(0, height * .76); ctx.lineTo(r, height * .5); ctx.lineTo(0, height * .2); }
  else if (shape === 'notch') { ctx.moveTo(0, 0); ctx.lineTo(width, r); ctx.lineTo(width - r, height * .48); ctx.lineTo(width, height); ctx.lineTo(r, height - r); ctx.lineTo(0, height * .65); ctx.lineTo(r, height * .32); }
  else { ctx.moveTo(r, 0); ctx.lineTo(width - r, r * .35); ctx.lineTo(width, height - r); ctx.lineTo(width * .72, height); ctx.lineTo(width * .36, height - r * .25); ctx.lineTo(0, height - r); ctx.lineTo(r * .35, height * .58); ctx.lineTo(0, r); }
  ctx.closePath();
}

function drawImageContain(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale; const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawImageCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale; const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawFallbackLetter(ctx, char, width, height, index) {
  ctx.fillStyle = PAPER_COLORS[index % PAPER_COLORS.length]; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = index % 3 === 0 ? '#fffdf4' : '#29231f';
  ctx.font = `700 ${Math.min(width, height) * .69}px "Gowun Batang", "Noto Serif JP", serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(char, width / 2, height / 2 + height * .04);
}
