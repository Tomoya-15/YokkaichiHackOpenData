// Leafletの地図を初期化し、中心座標とズームレベルを設定
const map = L.map('map').setView([34.966, 136.623], 15);  // 四日市市周辺の緯度経度を設定

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// IndexedDBの初期化
let db;
const request = indexedDB.open('MarkerDatabase', 1);

request.onerror = function(event) {
    console.log('IndexedDBのエラー:', event);
};

request.onsuccess = function(event) {
    db = event.target.result;
    console.log('IndexedDBのデータベースが開かれました');
    loadMarkers();  // IndexedDBからマーカーを読み込む
    updateCommentList();  // 初回のコメントリストの更新
};

request.onupgradeneeded = function(event) {
    db = event.target.result;
    const objectStore = db.createObjectStore('markers', { keyPath: 'id', autoIncrement: true });
    objectStore.createIndex('lat', 'lat', { unique: false });
    objectStore.createIndex('lng', 'lng', { unique: false });
    objectStore.createIndex('comment', 'comment', { unique: false });
    objectStore.createIndex('likes', 'likes', { unique: false });
};

// 地図をクリックしたときにピンを追加し、コメントを記録する
map.on('click', function(e) {
    const comment = prompt("この場所に配置する理由を追加してください:");
    
    if (comment) {
        const coords = e.latlng;
        const marker = L.marker(coords).addTo(map);
        let likes = 0;

        const popupContent = `
            <b>配置候補:</b> ${comment}<br>
            <button onclick="incrementLike(this, ${marker._leaflet_id})">いいね</button>
        `;

        marker.bindPopup(popupContent).openPopup();

        // IndexedDBにマーカーを保存
        const transaction = db.transaction(['markers'], 'readwrite');
        const objectStore = transaction.objectStore('markers');
        const request = objectStore.add({ lat: coords.lat, lng: coords.lng, comment: comment, likes: likes });

        request.onsuccess = function() {
            console.log('マーカーが保存されました');
            updateCommentList();  // 新しいコメントを追加後に一覧を更新
        };

        request.onerror = function() {
            console.log('マーカーの保存中にエラーが発生しました');
        };
    }
    window.location.reload();
});

// ページロード時にローカルストレージからマーカーを読み込む
function loadMarkers() {
    const transaction = db.transaction(['markers'], 'readonly');
    const objectStore = transaction.objectStore('markers');

    objectStore.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            const markerData = cursor.value;
            const marker = L.marker([markerData.lat, markerData.lng]).addTo(map);

            const popupContent = `
                <b>配置候補:</b> ${markerData.comment}<br>
                <button onclick="incrementLike(this, ${cursor.key})">いいね (<span>${markerData.likes})</span></button>
            `;

            marker.bindPopup(popupContent);
            cursor.continue();
        }
    };
}

// 「いいね」ボタンをクリックしたときの処理
function incrementLike(button, markerId) {
    const span = button.querySelector("span");
    let currentLikes = parseInt(span.innerText);
    span.innerText = currentLikes + 1;

    // IndexedDBでマーカーのいいね数を更新
    const transaction = db.transaction(['markers'], 'readwrite');
    const objectStore = transaction.objectStore('markers');
    const request = objectStore.get(markerId);

    request.onsuccess = function(event) {
        const data = event.target.result;
        data.likes = currentLikes + 1;

        const requestUpdate = objectStore.put(data);
        requestUpdate.onsuccess = function() {
            console.log('いいね数が更新されました');
            updateCommentList();  // いいね数更新後に一覧を更新
            
            // 現在開かれているポップアップを取得し、「いいね」数を更新
            if (map.hasLayer(button.closest('.leaflet-popup')._leaflet_pos)) {
                const marker = map._layers[markerId];
                if (marker && marker.getPopup().isOpen()) {
                    marker.setPopupContent(`
                        <b>配置候補:</b> ${data.comment}<br>
                        <button onclick="incrementLike(this, ${markerId})">いいね</button>
                    `);
                }
            }
        };
    };
    window.location.reload();
}

// コメントといいね数の一覧を表示する関数
function updateCommentList() {
    const commentListDiv = document.getElementById('comment-list');
    commentListDiv.innerHTML = '';  // 一度リセット

    const transaction = db.transaction(['markers'], 'readonly');
    const objectStore = transaction.objectStore('markers');

    objectStore.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {   
            const markerData = cursor.value;
            const commentElement = document.createElement('div');
            commentElement.innerHTML = `
                <p><strong>緯度: ${markerData.lat} 経度: ${markerData.lng}:</strong> <br>${markerData.comment} | <strong>いいね:</strong> ${markerData.likes}</p>
            `;
            commentListDiv.appendChild(commentElement);
            cursor.continue();
        }
    };
}
