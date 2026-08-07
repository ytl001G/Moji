export function requestInitialPermissions() {
  if (!window.isSecureContext) return;

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5000, maximumAge: 60000 });
  }

  // 카메라 권한은 실제 촬영 화면에서 사용자 동작으로 요청합니다.
  // 앱 시작 시 미리 스트림을 열면 일부 모바일 브라우저에서 실제 카메라 시작과 경합할 수 있습니다.
}
