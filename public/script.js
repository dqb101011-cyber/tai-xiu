const socket = io();
let currentBet = 0;
let currentUser = null;

// --- KHỞI TẠO VÀ KIỂM TRA ĐĂNG NHẬP ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/user');
        if (res.ok) {
            const data = await res.json();
            currentUser = data.username;
            showUser(data.username, data.balance);
        }
    } catch (e) { console.log('Chưa đăng nhập'); }
});

// --- AUTH LOGIC ---
async function login() {
    const username = document.getElementById('usernameInput').value;
    const password = document.getElementById('passwordInput').value;
    if(!username || !password) return alert('Vui lòng nhập đủ thông tin');
    
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
        currentUser = data.username;
        const userRes = await fetch('/api/user');
        const userData = await userRes.json();
        showUser(userData.username, userData.balance);
    } else {
        alert(data.error);
    }
}

async function register() {
    const username = document.getElementById('usernameInput').value;
    const password = document.getElementById('passwordInput').value;
    if(!username || !password) return alert('Vui lòng nhập đủ thông tin');
    
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
        alert('Đăng ký thành công, hãy đăng nhập!');
    } else {
        alert(data.error);
    }
}

function logout() {
    // Xóa cookie bằng cách set thời gian hết hạn trong quá khứ
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.reload();
}

function showUser(username, balance) {
    document.getElementById('authForm').style.display = 'none';
    document.getElementById('userBox').style.display = 'flex';
    document.getElementById('welcomeUser').innerText = `Xin chào, ${username}`;
    document.getElementById('userBalance').innerText = `${balance.toLocaleString()} VNĐ`;
}

// --- NẠP TIỀN SEPAY ---
async function deposit() {
    const amount = prompt("Nhập số tiền muốn nạp (VD: 50000):", "50000");
    if (!amount || isNaN(amount)) return;

    const res = await fetch('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseInt(amount) })
    });
    const data = await res.json();
    if (res.ok) {
        document.getElementById('qrOrderCode').innerText = data.code;
        document.getElementById('qrImage').src = data.qrUrl;
        document.getElementById('qrModal').style.display = 'flex';
    }
}

// --- GAME LOGIC (SOCKET) ---
socket.on('update_timer', (time) => {
    document.getElementById('timer').innerText = time;
});

socket.on('update_bets', (data) => {
    document.getElementById('totalTai').innerText = data.totalTai.toLocaleString();
    document.getElementById('totalXiu').innerText = data.totalXiu.toLocaleString();
    document.getElementById('playersTai').innerText = data.playersTai;
    document.getElementById('playersXiu').innerText = data.playersXiu;
});

socket.on('game_state', (data) => {
    document.getElementById('timer').innerText = data.timeLeft;
    if (data.state === 'BETTING') {
        document.getElementById('timer').style.color = '#f9d976';
        // Reset hiệu ứng xúc xắc
        document.getElementById('diceDisplay').innerHTML = `<span>🎲</span><span>🎲</span><span>🎲</span>`;
    } else if (data.state === 'ROLLING') {
        document.getElementById('timer').style.color = '#e74c3c';
        // Hiệu ứng lắc
        document.getElementById('diceDisplay').innerHTML = `<span style="animation: shake 0.5s infinite;">🎲</span><span style="animation: shake 0.5s infinite 0.1s;">🎲</span><span style="animation: shake 0.5s infinite 0.2s;">🎲</span>`;
    }
});

socket.on('game_result', (data) => {
    const diceContainer = document.getElementById('diceDisplay');
    diceContainer.innerHTML = '';
    data.dice.forEach(d => {
        // Đổi số thành mặt xúc xắc tương ứng
        const diceFaces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        let span = document.createElement('span');
        span.innerText = diceFaces[d];
        span.style.color = data.result === 'TAI' ? '#e74c3c' : '#3498db';
        diceContainer.appendChild(span);
    });
    
    // Hiển thị tổng điểm
    document.getElementById('timer').innerText = data.sum;
    document.getElementById('timer').style.color = data.result === 'TAI' ? '#e74c3c' : '#3498db';
    
    // Cập nhật lại số dư user sau khi có kết quả (nếu đang đăng nhập)
    if (currentUser) {
        fetch('/api/user').then(res => res.json()).then(data => {
            document.getElementById('userBalance').innerText = `${data.balance.toLocaleString()} VNĐ`;
        });
    }
});

socket.on('bet_error', (msg) => {
    alert(msg);
});

socket.on('bet_success', (newBalance) => {
    document.getElementById('userBalance').innerText = `${newBalance.toLocaleString()} VNĐ`;
    currentBet = 0;
    updateBetDisplay();
});

// --- ĐẶT CƯỢC ---
function addBet(amount) {
    currentBet += amount;
    updateBetDisplay();
}

function allIn() {
    if(!currentUser) return alert('Vui lòng đăng nhập');
    const balanceText = document.getElementById('userBalance').innerText;
    const balance = parseInt(balanceText.replace(/[^0-9]/g, ''));
    currentBet = balance;
    updateBetDisplay();
}

function cancelBet() {
    currentBet = 0;
    updateBetDisplay();
}

function updateBetDisplay() {
    document.getElementById('currentBetDisplay').innerText = currentBet.toLocaleString();
}

function placeBet(choice) {
    if (!currentUser) return alert('Vui lòng đăng nhập để chơi');
    if (currentBet <= 0) return alert('Vui lòng chọn số tiền cược');

    socket.emit('place_bet', {
        username: currentUser,
        choice: choice,
        amount: currentBet
    });
}

// --- CHAT ---
function sendChat() {
    if (!currentUser) return alert('Vui lòng đăng nhập để chat');
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    socket.emit('chat_message', { username: currentUser, text: text });
    input.value = '';
}

function handleChatEnter(e) {
    if (e.key === 'Enter') sendChat();
}

socket.on('chat_message', (data) => {
    const chatBox = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    msgDiv.innerHTML = `<span class="user">${data.username}:</span> ${data.text}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight; // Cuộn xuống dưới
});
