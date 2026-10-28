require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/taixiu')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Error:', err));

// --- MODELS ---
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 }
}));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  orderCode: String, username: String, amount: Number, type: String, status: String, createdAt: { type: Date, default: Date.now }
}));

const GameHistory = mongoose.model('GameHistory', new mongoose.Schema({
  sessionId: Number, dice: [Number], sum: Number, result: String, createdAt: { type: Date, default: Date.now }
}));

// --- AUTH ---
const auth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_sunwin');
    req.user = decoded; next();
  } catch (err) { res.status(401).json({ error: 'Token không hợp lệ' }); }
};

// --- API ---
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (await User.findOne({ username })) return res.status(400).json({ error: 'Tài khoản đã tồn tại' });
    const user = new User({ username, password: await bcrypt.hash(password, 10), balance: 0 });
    await user.save(); res.json({ message: 'Đăng ký thành công' });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET || 'secret_key_sunwin', { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: false }); 
    res.json({ message: 'Đăng nhập thành công', username: user.username });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.get('/api/user', auth, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });
  res.json({ username: user.username, balance: user.balance });
});

app.post('/api/deposit', auth, async (req, res) => {
  const amount = req.body.amount || 10000;
  const orderCode = 'NAP' + Math.floor(100000 + Math.random() * 900000);
  await new Transaction({ orderCode, username: req.user.username, amount, type: 'nap', status: 'pending' }).save();
  const qrUrl = `https://img.vietqr.io/image/${process.env.BANK_ID || '970423'}-${process.env.ACCOUNT_NO || '0000000000'}-compact2.png?amount=${amount}&addInfo=${orderCode}&accountName=${encodeURIComponent(process.env.ACCOUNT_NAME || 'NGUYEN VAN A')}`;
  res.json({ code: orderCode, qrUrl });
});

app.get('/api/check-deposit/:code', auth, async (req, res) => {
  try {
    const trans = await Transaction.findOne({ orderCode: req.params.code, username: req.user.username });
    if (trans && trans.status === 'success') res.json({ success: true, amount: trans.amount });
    else res.json({ success: false });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/sepay-webhook', async (req, res) => {
  try {
    const { content, transferAmount } = req.body;
    const match = content.match(/NAP\d{6}/);
    if (match) {
      const trans = await Transaction.findOne({ orderCode: match[0], status: 'pending' });
      if (trans) {
        trans.status = 'success'; await trans.save();
        await User.updateOne({ username: trans.username }, { $inc: { balance: transferAmount } });
      }
    }
    res.status(200).json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/history', async (req, res) => {
  try { res.json(await GameHistory.find().sort({ createdAt: -1 }).limit(10)); } 
  catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// --- LOGIC GAME ---
let timeLeft = 35, gameState = 'BETTING', totalTai = 0, totalXiu = 0, playersTai = 0, playersXiu = 0, currentBets = [], currentSessionId = 3305050;

const rollDice = () => {
  let d1, d2, d3, sum;
  if (totalTai > totalXiu) { do { d1=Math.floor(Math.random()*6)+1; d2=Math.floor(Math.random()*6)+1; d3=Math.floor(Math.random()*6)+1; sum=d1+d2+d3; } while (sum > 10); } 
  else if (totalXiu > totalTai) { do { d1=Math.floor(Math.random()*6)+1; d2=Math.floor(Math.random()*6)+1; d3=Math.floor(Math.random()*6)+1; sum=d1+d2+d3; } while (sum < 11); } 
  else { d1=Math.floor(Math.random()*6)+1; d2=Math.floor(Math.random()*6)+1; d3=Math.floor(Math.random()*6)+1; sum=d1+d2+d3; }
  return { dice: [d1, d2, d3], sum, result: sum >= 11 ? 'TAI' : 'XIU' };
};

io.on('connection', (socket) => {
  socket.emit('game_state', { state: gameState, timeLeft, totalTai, totalXiu, playersTai, playersXiu, currentSessionId });
  
  socket.on('place_bet', async (data) => {
    if (gameState !== 'BETTING') return socket.emit('bet_error', 'Đã hết thời gian đặt cược');
    const { username, choice, amount } = data;
    
    try {
      const user = await User.findOne({ username });
      if (!user || user.balance < amount) return socket.emit('bet_error', 'Số dư không đủ');
      
      // Trừ tiền
      user.balance -= amount;
      await user.save();
      
      // Cập nhật tổng
      if (choice === 'TAI') { totalTai += amount; playersTai++; } 
      else { totalXiu += amount; playersXiu++; }
      
      currentBets.push({ username, choice, amount });
      
      io.emit('update_bets', { totalTai, totalXiu, playersTai, playersXiu });
      
      // Trả về số dư mới và thông tin cược để Frontend thông báo ĐÚNG SỐ TIỀN
      socket.emit('bet_success', { balance: user.balance, choice, amount });
      
    } catch (err) { socket.emit('bet_error', 'Lỗi đặt cược'); }
  });

  socket.on('chat_message', (data) => { io.emit('chat_message', data); });
});

setInterval(async () => {
  if (timeLeft > 0) { timeLeft--; io.emit('update_timer', timeLeft); } 
  else {
    if (gameState === 'BETTING') { gameState = 'ROLLING'; timeLeft = 5; io.emit('game_state', { state: gameState, currentSessionId }); } 
    else if (gameState === 'ROLLING') {
      gameState = 'RESULT'; timeLeft = 5;
      const resultData = rollDice();
      await new GameHistory({ sessionId: currentSessionId, dice: resultData.dice, sum: resultData.sum, result: resultData.result }).save();
      
      let userResults = []; 
      if (currentBets.length > 0) {
        for (let bet of currentBets) {
          let winAmount = 0;
          if (bet.choice === resultData.result) { 
            winAmount = bet.amount * 2; 
            await User.updateOne({ username: bet.username }, { $inc: { balance: winAmount } }); 
          }
          userResults.push({ username: bet.username, choice: bet.choice, amount: bet.amount, win: winAmount });
        }
      }
      
      io.emit('game_result', { dice: resultData.dice, sum: resultData.sum, result: resultData.result, userResults });
      
      totalTai = 0; totalXiu = 0; playersTai = 0; playersXiu = 0; currentBets = []; currentSessionId++;
      io.emit('update_bets', { totalTai, totalXiu, playersTai, playersXiu });
    } else if (gameState === 'RESULT') { 
      gameState = 'BETTING'; timeLeft = 35; 
      io.emit('game_state', { state: gameState, currentSessionId }); 
    }
  }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server chạy tại port ${PORT}`); });
