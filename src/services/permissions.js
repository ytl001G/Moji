export function requestInitialPermissions() {
  if (!window.isSecureContext) return;

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5000, maximumAge: 60000 });
  }

  if (navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then((stream) => stream.getTracks().forEach((track) => track.stop()))
      .catch(() => {});
  }
}
