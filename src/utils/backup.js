import JSZip from 'jszip';
import { db } from '../db/index.js';

/**
 * DB 메타데이터와 OPFS 이미지를 하나로 묶어 .zip 파일로 다운로드합니다.
 */
export async function exportBackupZip() {
  const zip = new JSZip();

  // 1. DB 수집 데이터 가져오기
  const collections = await db.collections.toArray();
  zip.file('metadata.json', JSON.stringify(collections, null, 2));

  // 2. OPFS 루트 디렉토리 읽어서 파일 압축 추가
  if (navigator.storage && navigator.storage.getDirectory) {
    const root = await navigator.storage.getDirectory();
    const imagesFolder = zip.folder('images');

    for await (const [name, handle] of root.entries()) {
      if (handle.kind === 'file') {
        const file = await handle.getFile();
        imagesFolder.file(name, file);
      }
    }
  }

  // 3. Zip 생성 및 저장 다운로드
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `moji_backup_${Date.now()}.zip`;
  a.click();
}