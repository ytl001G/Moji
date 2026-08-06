/**
 * 특정 카드 엘리먼트에 3D Flip 및 스와이프 이벤트를 바인딩합니다.
 * @param {HTMLElement} cardElement - .card-3d 클래스를 가진 엘리먼트
 */
export function bindCardFlipEvent(cardElement) {
  let startX = 0;

  cardElement.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  cardElement.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const diffX = endX - startX;

    // 좌/우 50px 이상 스와이프 시 3D 뒤집기 토글
    if (Math.abs(diffX) > 50) {
      cardElement.classList.toggle('flipped');
    }
  });

  // 클릭으로도 뒤집기 지원
  cardElement.addEventListener('click', () => {
    cardElement.classList.toggle('flipped');
  });
}