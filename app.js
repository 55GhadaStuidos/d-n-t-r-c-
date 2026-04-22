// ═══════════════════════════════════════════════
//   55GHADA STUDIOS — BÖRTE MESSENGER v2.0
// ═══════════════════════════════════════════════
const io = require('socket.io-client');

const SERVER_URL = "https://web-production-29a0e.up.railway.app";

const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000
});

// ── STATE ─────────────────────────────────────
let myBorteId = localStorage.getItem('borte_id') || null;
let activeChatId = null;
let friends = [];
let pendingRequests = [];

// ── SOCKET OLAYLARI ───────────────────────────
socket.on('connect', () => {
    setStatus('AKTİF ✓', 'green');
    if (myBorteId) socket.emit('join_node', myBorteId);
});

socket.on('connect_error', () => setStatus('BAĞLANIYOR...', 'orange'));
socket.on('disconnect', () => setStatus('KESİLDİ', 'red'));

socket.on('receive_msg', (data) => {
    if (data.sender === myBorteId) return;
    if (data.sender === activeChatId || data.nodeTag === activeChatId) {
        appendMessage(data.content, 'received', data.sender);
    } else {
        showNotificationDot(data.sender);
    }
});

socket.on('friend_request', (data) => {
    pendingRequests.push(data.from);
    showToast(`📨 ${data.from} arkadaşlık isteği gönderdi!`);
    renderPendingRequests();
});

socket.on('friend_accepted', (data) => {
    showToast(`✅ ${data.by} arkadaşlık isteğini kabul etti!`);
    loadFriends();
});

// ── YARDIMCI ──────────────────────────────────
function setStatus(text, color) {
    const el = document.getElementById('db-status');
    if (!el) return;
    const colors = { green: '#22c55e', orange: '#f59e0b', red: '#ef4444' };
    el.innerText = 'Bulut: ' + text;
    el.style.color = colors[color];
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}

function showNotificationDot(senderId) {
    document.querySelectorAll('.friend-card').forEach(card => {
        if (card.dataset.id === senderId) {
            let dot = card.querySelector('.notif-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'notif-dot';
                card.appendChild(dot);
            }
        }
    });
}

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── KAYIT / GİRİŞ ────────────────────────────
async function register() {
    const nickInput = document.getElementById('nickInput');
    const nick = nickInput ? nickInput.value.trim() : '';
    if (!nick) { showToast('⚠️ Bir isim yaz!'); return; }
    if (!/^[a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]+$/.test(nick)) {
        showToast('⚠️ Sadece harf ve rakam kullan!');
        return;
    }

    const btn = document.getElementById('registerBtn');
    btn.innerText = 'Kaydediliyor...';
    btn.disabled = true;

    try {
        const res = await fetch(`${SERVER_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: nick })
        });
        const data = await res.json();
        if (data.success) {
            myBorteId = data.borteId;
            localStorage.setItem('borte_id', myBorteId);
            showApp(myBorteId);
        } else {
            showToast('❌ ' + data.error);
        }
    } catch (e) {
        showToast('❌ Sunucuya ulaşılamadı!');
    }

    btn.innerText = 'BAŞLAT';
    btn.disabled = false;
}

function showApp(id) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('display-id').innerText = id;
    socket.emit('join_node', id);
    loadFriends();
    loadPendingRequests();
}

// ── ARKADAŞ SİSTEMİ ───────────────────────────
async function loadFriends() {
    if (!myBorteId) return;
    try {
        const res = await fetch(`${SERVER_URL}/api/friends/${encodeURIComponent(myBorteId)}`);
        const data = await res.json();
        friends = data.friends || [];
        renderFriends();
    } catch (e) { console.error('Arkadaş listesi yüklenemedi:', e); }
}

async function loadPendingRequests() {
    if (!myBorteId) return;
    try {
        const res = await fetch(`${SERVER_URL}/api/friend/pending/${encodeURIComponent(myBorteId)}`);
        const data = await res.json();
        pendingRequests = data.requests || [];
        renderPendingRequests();
    } catch (e) { console.error('Bekleyen istekler yüklenemedi:', e); }
}

function renderFriends() {
    const container = document.getElementById('friend-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (friends.length === 0) {
        container.innerHTML = '<div class="empty-list">Henüz arkadaş yok.<br>+ EKLE butonuna bas!</div>';
        return;
    }

    friends.forEach(f => {
        const card = document.createElement('div');
        card.className = 'friend-card';
        card.dataset.id = f;
        const nick = f.split('#')[0];
        const tag = '#' + f.split('#')[1];
        card.innerHTML = `
            <div class="friend-avatar">${nick[0].toUpperCase()}</div>
            <div class="friend-info">
                <span class="friend-nick">${nick}</span>
                <span class="friend-tag">${tag}</span>
            </div>
            <div class="friend-actions">
                <button class="action-btn block-btn" title="Engelle" onclick="blockFriend(event, '${f}')">🚫</button>
                <button class="action-btn remove-btn" title="Arkadaşlıktan çıkar" onclick="removeFriend(event, '${f}')">×</button>
            </div>
        `;
        card.onclick = (e) => {
            if (e.target.closest('.friend-actions')) return;
            openChat(f);
        };
        container.appendChild(card);
    });
}

function renderPendingRequests() {
    const badge = document.getElementById('pending-badge');
    if (badge) {
        badge.innerText = pendingRequests.length;
        badge.style.display = pendingRequests.length > 0 ? 'flex' : 'none';
    }

    const container = document.getElementById('pending-container');
    if (!container) return;
    container.innerHTML = '';

    if (pendingRequests.length === 0) {
        container.innerHTML = '<div class="empty-list">Bekleyen istek yok.</div>';
        return;
    }

    pendingRequests.forEach(req => {
        const card = document.createElement('div');
        card.className = 'request-card';
        card.innerHTML = `
            <span class="request-from">${req}</span>
            <div class="request-btns">
                <button class="accept-btn" onclick="respondRequest('${req}', 'accept')">✓</button>
                <button class="reject-btn" onclick="respondRequest('${req}', 'reject')">✕</button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function executeAdd() {
    const idInput = document.getElementById('friendIDInput');
    const id = idInput ? idInput.value.trim() : '';

    if (!id.includes('#')) { showToast('⚠️ Nick#1234 formatında gir!'); return; }
    if (id === myBorteId) { showToast('⚠️ Kendini ekleyemezsin!'); return; }

    const addBtn = document.getElementById('addFriendBtn');
    addBtn.innerText = 'Gönderiliyor...';
    addBtn.disabled = true;

    try {
        const res = await fetch(`${SERVER_URL}/api/friend/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester: myBorteId, receiver: id })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ İstek gönderildi!');
            closeModal();
            if (idInput) idInput.value = '';
        } else {
            showToast('❌ ' + data.error);
        }
    } catch (e) {
        showToast('❌ Sunucuya ulaşılamadı!');
    }

    addBtn.innerText = 'İSTEK GÖNDER';
    addBtn.disabled = false;
}

async function respondRequest(requester, action) {
    try {
        const res = await fetch(`${SERVER_URL}/api/friend/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester, receiver: myBorteId, action })
        });
        const data = await res.json();
        if (data.success) {
            pendingRequests = pendingRequests.filter(r => r !== requester);
            renderPendingRequests();
            if (action === 'accept') {
                showToast(`✅ ${requester} arkadaş listene eklendi!`);
                loadFriends();
            } else {
                showToast('İstek reddedildi.');
            }
        }
    } catch (e) { showToast('❌ İşlem başarısız!'); }
}

async function removeFriend(event, friendId) {
    event.stopPropagation();
    if (!confirm(`${friendId} arkadaşlıktan çıkarılsın mı?`)) return;
    try {
        await fetch(`${SERVER_URL}/api/friend`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userA: myBorteId, userB: friendId })
        });
        friends = friends.filter(f => f !== friendId);
        renderFriends();
        if (activeChatId === friendId) closeChat();
        showToast('Arkadaşlıktan çıkarıldı.');
    } catch (e) { showToast('❌ İşlem başarısız!'); }
}

async function blockFriend(event, friendId) {
    event.stopPropagation();
    if (!confirm(`${friendId} engellensin mi?`)) return;
    try {
        await fetch(`${SERVER_URL}/api/friend/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocker: myBorteId, blocked: friendId })
        });
        friends = friends.filter(f => f !== friendId);
        renderFriends();
        if (activeChatId === friendId) closeChat();
        showToast('Kullanıcı engellendi.');
    } catch (e) { showToast('❌ İşlem başarısız!'); }
}

// ── CHAT ──────────────────────────────────────
async function openChat(friendId) {
    activeChatId = friendId;
    const title = document.getElementById('active-chat-title');
    const chatFlow = document.getElementById('chatFlow');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    const chatArea = document.getElementById('chat-area');

    if (title) title.innerText = friendId;
    if (chatFlow) chatFlow.innerHTML = '';
    if (chatPlaceholder) chatPlaceholder.style.display = 'none';
    if (chatArea) chatArea.style.display = 'flex';

    document.querySelectorAll('.friend-card').forEach(card => {
        card.classList.toggle('active', card.dataset.id === friendId);
        if (card.dataset.id === friendId) {
            const dot = card.querySelector('.notif-dot');
            if (dot) dot.remove();
        }
    });

    try {
        const res = await fetch(`${SERVER_URL}/api/messages/${encodeURIComponent(myBorteId)}/${encodeURIComponent(friendId)}`);
        const data = await res.json();
        if (data.messages && chatFlow) {
            data.messages.forEach(msg => {
                appendMessage(msg.content, msg.sender === myBorteId ? 'sent' : 'received', msg.sender);
            });
        }
    } catch (e) { console.error('Mesaj geçmişi yüklenemedi:', e); }
}

function closeChat() {
    activeChatId = null;
    const chatPlaceholder = document.getElementById('chat-placeholder');
    const chatArea = document.getElementById('chat-area');
    if (chatPlaceholder) chatPlaceholder.style.display = 'flex';
    if (chatArea) chatArea.style.display = 'none';
}

function appendMessage(content, type, sender) {
    const chatFlow = document.getElementById('chatFlow');
    if (!chatFlow) return;
    const d = document.createElement('div');
    d.className = `msg ${type}`;
    if (type === 'received') {
        d.innerHTML = `<span class="msg-sender">${sender.split('#')[0]}</span><span class="msg-content">${escapeHtml(content)}</span>`;
    } else {
        d.innerHTML = `<span class="msg-content">${escapeHtml(content)}</span>`;
    }
    chatFlow.appendChild(d);
    chatFlow.scrollTop = chatFlow.scrollHeight;
}

function send() {
    const inp = document.getElementById('msgInput');
    const content = inp ? inp.value.trim() : '';
    if (!content || !activeChatId || !myBorteId) return;

    socket.emit('send_msg', { nodeTag: activeChatId, sender: myBorteId, content });
    appendMessage(content, 'sent', myBorteId);
    inp.value = '';
}

// ── TAB ───────────────────────────────────────
function switchTab(tab) {
    document.getElementById('tab-friends').style.display = tab === 'friends' ? 'flex' : 'none';
    document.getElementById('tab-pending').style.display = tab === 'pending' ? 'flex' : 'none';
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${tab}`).classList.add('active');
}

// ── MODAL ─────────────────────────────────────
function openAddModal() {
    document.getElementById('modal-overlay').style.display = 'flex';
    setTimeout(() => document.getElementById('friendIDInput').focus(), 100);
}
function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

// ── INIT ──────────────────────────────────────
window.onload = () => {
    if (myBorteId) showApp(myBorteId);
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const overlay = document.getElementById('modal-overlay');
        if (overlay && overlay.style.display === 'flex') executeAdd();
    }
});

window.register = register;
window.send = send;
window.openAddModal = openAddModal;
window.closeModal = closeModal;
window.executeAdd = executeAdd;
window.removeFriend = removeFriend;
window.blockFriend = blockFriend;
window.respondRequest = respondRequest;
window.switchTab = switchTab;
