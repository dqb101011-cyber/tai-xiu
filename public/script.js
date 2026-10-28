const socket = io();
let currentBet = 0;
let currentUser = null;
let currentBalance = 0;
let audioCtx = null;

// DOM
const timerEl = document.getElementById('timer');
const diceCircle = document.getElementById('diceCircle');
const diceArea = document.getElementById('diceArea');
const bowl = document.getElementById('bowl');
const bowlCover = document.getElementById('bowlCover');
const toastBox = document.getElementById('toastBox');
const toastText = document.getElementById('toastText');
const panelTai = document.getElementById('panelTai');
const panelXiu = document.getElementById('panelXiu');
const betDisplay = document.getElementById('betDisplay');

// Kích hoạt âm thanh khi click lần đầu (do trình duyệt chặn autoplay)
document.body.addEventListener('click', () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}, { once: true });

const playSound = (type) => {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        
        if (type === 'chip') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime); osc.start(); osc.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'win') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(400, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime); osc.start(); osc.stop(audioCtx.currentTime + 0.5);
        } else if (type === 'roll') {
            osc.type = 'square'; osc.frequency.setValueAtTime(100, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime); osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        } else if (type === 'lose') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime); osc.start(); osc.stop(audioCtx.currentTime + 0.4);
        }
    } catch(e) {}
};

function showToast(msg, isSuccess = true) {
    toastText.innerText = msg;
    const color = isSuccess ? '#2ecc71' : '#e74c3c';
    toastBox.style.borderColor = color;
    toastBox.style.boxShadow = `0 0 20px ${color}`;
    toastBox.style.color = color;
    toastBox.style.display = 'flex';
}

// --- KHỞI TẠO ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/user');
        if (res.ok) {
            const data = await res.json();
            currentUser = data.username; currentBalance = data.balance;
            showUser(data.username, data.balance);
        }
    } catch (e) {}
});

async function login() {
    const u = document.getElementById('usernameInput').value;
    const p = document.getElementById('passwordInput').value;
    if(!u || !p) return showToast('Nhập đủ tài khoản và mật khẩu', false);
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const data = await res.json();
    if (res.ok) {
        currentUser = data.username;
        const uRes = await fetch('/api/user'); const uData = await uRes.json();
        currentBalance = uData.balance; showUser(uData.username, uData.balance);
        showToast('Đăng nhập thành công!');
    } else showToast(data.error, false);
}

async function register() {
    const u = document.getElementById('usernameInput').value;
    const p = document.getElementById('passwordInput').value;
    if(!u || !p) return showToast('Nhập đủ thông tin', false);
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const data = await res.json();
    if (res.ok) showToast('Đăng ký thành công, hãy đăng nhập!'); else showToast(data.error, false);
}

function logout() { document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"; window.location.reload(); }

function showUser(username, balance) {
    document.getElementById('authForm').style.display = 'none';
    document.getElementById('userBox').style.display = 'flex';
    document.getElementById('welcomeUser').innerText = username;
    document.getElementById('userBalance').innerText = `${balance.toLocaleString()} VNĐ`;
}

async function deposit() {
    const amount = prompt("Nhập số tiền muốn nạp (VD: 50000):", "50000");
    if (!amount || isNaN(amount)) return;
    const res = await fetch('/api/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: parseInt(amount) }) });
    const data = await res.json();
    if (res.ok) {
        document.getElementById('qrOrderCode').innerText = data.code;
        document.getElementById('qrImage').src = data.qrUrl;
        document.getElementById('qrModal').style.display = 'flex';
        
        const checkDeposit = setInterval(async () => {
            const checkRes = await fetch(`/api/check-deposit/${data.code}`);
            const checkData = await checkRes.json();
            if (checkData.success) {
                clearInterval(checkDeposit);
                document.getElementById('qrModal').style.display = 'none';
                const userRes = await fetch('/api/user'); const userData = await userRes.json();
                currentBalance = userData.balance;
                document.getElementById('userBalance').innerText = `${userData.balance.toLocaleString()} VNĐ`;
                showToast(`NẠP THÀNH CÔNG ${checkData.amount.toLocaleString()} VNĐ!`);
                playSound('win');
            }
        }, 2000);
    }
}

// --- ĐẶT CƯỢC (CLICK TRỰC TIẾP) ---
function selectChip(element, amount) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    currentBet = amount;
    betDisplay.innerText = currentBet.toLocaleString();
    playSound('chip');
}

function allIn() {
    if (!currentUser) return showToast('Vui lòng đăng nhập!', false);
    currentBet = currentBalance;
    betDisplay.innerText = currentBet.toLocaleString();
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    playSound('chip');
}

function cancelBet() {
    currentBet = 0;
    betDisplay.innerText = "0";
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
}

// Bấm trực tiếp vào Tài hoặc Xỉu để đặt cược
function placeBet(choice) {
    if (!currentUser) return showToast('Vui lòng đăng nhập để chơi!', false);
    if (currentBet <= 0) return showToast('Vui lòng chọn số tiền cược trước!', false);
    
    socket.emit('place_bet', { username: currentUser, choice: choice, amount: currentBet });
}

// --- SOCKET EVENTS ---
socket.on('update_timer', (time) => {
    timerEl.innerText = time;
    timerEl.style.color = time <= 5 ? '#e74c3c' : 'var(--gold-light)';
});

socket.on('update_bets', (data) => {
    document.getElementById('totalTai').innerText = data.totalTai.toLocaleString();
    document.getElementById('totalXiu').innerText = data.totalXiu.toLocaleString();
    document.getElementById('playersTai').innerText = data.playersTai;
    document.getElementById('playersXiu').innerText = data.playersXiu;
});

socket.on('game_state', (data) => {
    timerEl.innerText = data.timeLeft;
    if (data.sessionId) document.getElementById('sessionCodeDisplay').innerText = data.sessionId;
    
    if (data.state === 'BETTING') {
        bowl.style.display = 'none'; 
        diceArea.style.display = 'flex';
        panelTai.classList.remove('win-glow', 'lose-dim'); 
        panelXiu.classList.remove('win-glow', 'lose-dim');
        diceCircle.classList.remove('rolling');
    } else if (data.state === 'ROLLING') {
        diceCircle.classList.add('rolling'); 
        playSound('roll');
    }
});

socket.on('game_result', (data) => {
    diceCircle.classList.remove('rolling');
    diceArea.style.display = 'none'; 
    bowl.style.display = 'block'; 
    bowlCover.style.transform = 'translateY(0)';
    
    document.getElementById('resD1').setAttribute('data-value', data.dice[0]);
    document.getElementById('resD2').setAttribute('data-value', data.dice[1]);
    document.getElementById('resD3').setAttribute('data-value', data.dice[2]);
    
    timerEl.innerText = data.sum;
    timerEl.style.color = data.result === 'TAI' ? '#ff6b6b' : '#6bb9ff';

    if(data.result === 'TAI') { 
        panelTai.classList.add('win-glow'); panelXiu.classList.add('lose-dim'); 
    } else { 
        panelXiu.classList.add('win-glow'); panelTai.classList.add('lose-dim'); 
    }

    if (currentUser && data.userResults) {
        const myResult = data.userResults.find(r => r.username === currentUser);
        if (myResult) {
            if (myResult.win > 0) { 
                showToast(`CHÚC MỪNG! Bạn thắng +${myResult.win.toLocaleString()} VNĐ`); 
                playSound('win'); 
            } else { 
                showToast(`RẤT TIẾC! Bạn thua -${myResult.amount.toLocaleString()} VNĐ`, false); 
                playSound('lose'); 
            }
        }
    }

    if (currentUser) {
        fetch('/api/user').then(res => res.json()).then(userData => {
            currentBalance = userData.balance;
            document.getElementById('userBalance').innerText = `${userData.balance.toLocaleString()} VNĐ`;
        });
    }
});

socket.on('bet_error', (msg) => showToast(msg, false));

socket.on('bet_success', (data) => {
    currentBalance = data.balance;
    document.getElementById('userBalance').innerText = `${data.balance.toLocaleString()} VNĐ`;
    showToast(`Đã đặt ${data.amount.toLocaleString()} VNĐ vào ${data.choice === 'TAI' ? 'TÀI' : 'XỈU'}`);
    currentBet = 0; 
    betDisplay.innerText = "0";
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
});

// --- KÉO BÁT ÚP ---
let isDragging = false, startY = 0, currentY = 0;
function startDrag(e) { isDragging = true; startY = e.touches ? e.touches[0].clientY : e.clientY; bowlCover.style.cursor = 'grabbing'; }
document.addEventListener('mousemove', (e) => { if (!isDragging) return; currentY = e.clientY; let diff = currentY - startY; if (diff > 0) bowlCover.style.transform = `translateY(${Math.min(diff, 200)}px)`; });
document.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; bowlCover.style.cursor = 'grab'; let diff = currentY - startY; bowlCover.style.transform = `translateY(${diff > 50 ? 200 : 0}px)`; } });
document.addEventListener('touchmove', (e) => { if (!isDragging) return; currentY = e.touches[0].clientY; let diff = currentY - startY; if (diff > 0) bowlCover.style.transform = `translateY(${Math.min(diff, 200)}px)`; });
document.addEventListener('touchend', () => { if (isDragging) { isDragging = false; let diff = currentY - startY; bowlCover.style.transform = `translateY(${diff > 50 ? 200 : 0}px)`; } });

// --- CHAT ---
function toggleChat() {
    const msgs = document.getElementById('chatMessages');
    const input = document.querySelector('.chat-input-area');
    const isHidden = msgs.style.display === 'none';
    msgs.style.display = isHidden ? 'flex' : 'none';
    input.style.display = isHidden ? 'flex' : 'none';
}
function sendChat() {
    if (!currentUser) return showToast('Đăng nhập để chat', false);
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat_message', { username: currentUser, text: text });
    input.value = '';
}
function handleChatEnter(e) { if (e.key === 'Enter') sendChat(); }
socket.on('chat_message', (data) => {
    const chatBox = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    msgDiv.innerHTML = `<span class="user">${data.username}:</span> ${data.text}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// --- LỊCH SỬ ---
async function openHistory() {
    document.getElementById('historyModal').style.display = 'flex';
    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = '<tr><td colspan="4">Đang tải...</td></tr>';
    try {
        const res = await fetch('/api/history');
        const history = await res.json();
        tbody.innerHTML = history.length === 0 ? '<tr><td colspan="4">Chưa có dữ liệu</td></tr>' : '';
        history.forEach(item => {
            let resColor = item.result === 'TAI' ? '#ff6b6b' : '#6bb9ff';
            tbody.innerHTML += `<tr><td>#${item.sessionId}</td><td>${item.dice.join(' - ')}</td><td>${item.sum}</td><td style="color:${resColor}; font-weight:bold;">${item.result}</td></tr>`;
        });
    } catch (err) { tbody.innerHTML = '<tr><td colspan="4">Lỗi tải dữ liệu</td></tr>'; }
        }
