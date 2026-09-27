/* 사진 줄이기 — 태블릿 사진을 작은 JPEG(data URL)로 바꿔 데이터베이스에 저장 (무료 용량 절약)
   Media.pick() → 파일 고르기 창, Media.compress(file) → 'data:image/jpeg;base64,...' */
(function () {
  async function compress(file, { max = 900, q = 0.72, limit = 280000 } = {}) {
    if (!file || !/^image\//.test(file.type)) throw new Error('사진 파일을 골라 주세요.');
    let img;
    try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('사진을 읽지 못했어요.')); i.src = URL.createObjectURL(file); });
    }
    let w = img.width, h = img.height;
    for (let size = max; size >= 320; size = Math.round(size * 0.8)) {
      const s = Math.min(1, size / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      for (let qq = q; qq >= 0.4; qq -= 0.12) {
        const url = c.toDataURL('image/jpeg', qq);
        if (url.length <= limit) return url;
      }
    }
    throw new Error('사진이 너무 커요. 다른 사진을 골라 주세요.');
  }
  function pick() {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = 'image/*';
      i.onchange = () => res(i.files[0] || null);
      i.click();
    });
  }
  window.Media = { compress, pick };
})();
