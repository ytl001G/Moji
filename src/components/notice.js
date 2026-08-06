let activeNotice = null;

export function showNotice(title, message = '', tone = 'default') {
  activeNotice?.remove();
  const notice = document.createElement('section');
  notice.className = `paper-notice ${tone}`;
  notice.setAttribute('role', 'status');
  notice.innerHTML = `<button class="notice-close" type="button" aria-label="닫기">×</button><strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}`;
  document.body.appendChild(notice);
  activeNotice = notice;
  const dismiss = () => { if (activeNotice === notice) activeNotice = null; notice.remove(); };
  notice.querySelector('.notice-close').addEventListener('click', dismiss);
  window.setTimeout(dismiss, tone === 'error' ? 7000 : 4200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
