/* mDANCE テンポチェンジャー — オフライン用 Service Worker
 *
 * 方針:
 *  - アプリ本体(HTML)は「ネット優先・失敗したらキャッシュ」。
 *    こうしておくと、GitHubのindex.htmlを差し替えたとき、オンラインなら
 *    次に開いた時点で必ず新しい版が出る(古い版が residual に残らない)。
 *  - アイコンやmanifestは「キャッシュ優先」。ほぼ変わらないので毎回取りに行かない。
 *  - 音声処理は元々すべて端末内で動くので、一度読み込めば通信は一切不要。
 */

// キャッシュ名は固定。アプリ本体(HTML)はネット優先で取りに行くので、
// バージョンを上げなくても更新はきちんと反映される。
// → このsw.jsは一度アップロードすれば、以後ずっと差し替え不要。
var CACHE = 'mdance-tempo';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 1つでも取得に失敗したら全部が入らない、という事故を避けるため個別に入れる
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { /* 個別の失敗は無視 */ });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        // 自分の古い世代のキャッシュだけ消す
        if (key.indexOf('mdance-tempo-') === 0 && key !== CACHE) return caches.delete(key);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // 外部への通信には関与しない

  var accept = req.headers.get('accept') || '';
  var isDocument = req.mode === 'navigate' || accept.indexOf('text/html') !== -1;

  if (isDocument) {
    // --- アプリ本体: ネット優先 ---
    event.respondWith(
      fetch(req).then(function (fresh) {
        if (fresh && fresh.ok) {
          var copy = fresh.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put('./index.html', copy).catch(function () {});
          });
        }
        return fresh;
      }).catch(function () {
        // 電波がない時はキャッシュから復元
        return caches.match('./index.html', { ignoreSearch: true }).then(function (cached) {
          return cached || caches.match('./', { ignoreSearch: true });
        });
      })
    );
    return;
  }

  // --- アイコン等: キャッシュ優先 ---
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (fresh) {
        if (fresh && fresh.ok && fresh.type === 'basic') {
          var copy = fresh.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(req, copy).catch(function () {});
          });
        }
        return fresh;
      });
    })
  );
});
