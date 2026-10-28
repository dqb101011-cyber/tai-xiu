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

// Cấu hình Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Kết nối cơ sở dữ liệu MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/taixiu')
  .then(() => {
    console.log('--------------------------------------------------');
    console.log('KẾT NỐI MONGODB THÀNH CÔNG!');
    console.log('--------------------------------------------------');
  })
  .catch(err => {
    console.log('--------------------------------------------------');
    console.log('LỖI KẾT NỐI MONGODB:', err);
    console.log('--------------------------------------------------');
  });

// ==========================================
// ĐỊNH NGHĨA CÁC MODEL (CƠ SỞ DỮ LIỆU)
// ==========================================

// Model Người dùng
const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  balance: { 
    type: Number, 
    default: 0 
  }
});
const User = mongoose.model('User', UserSchema);

// Model Giao dịch (Nạp/Rút)
const TransactionSchema = new mongoose.Schema({
  orderCode: { 
    type: String 
  },
  username: { 
    type: String 
  },
  amount: { 
    type: Number 
  },
  type: { 
    type: String 
  },
  status: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// Model Lịch sử Game
const GameHistorySchema = new mongoose.Schema({
  sessionId: { 
    type: Number 
  },
  dice: { 
    type: [Number] 
  },
  sum: { 
    type: Number 
  },
  result: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});
const GameHistory = mongoose.model('GameHistory', GameHistorySchema);


// ==========================================
// MIDDLEWARE XÁC THỰC (AUTH)
// ==========================================
const auth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_sunwin');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Phiên đăng nhập hết hạn' });
  }
};

// ==========================================
// CÁC API ROUTES
// ==========================================

// 1. API Đăng ký
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập đủ thông tin' });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Tài khoản này đã tồn tại' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username: username,
      password: hashedPassword,
      balance: 0
    });
    
    await newUser.save();
    res.json({ message: 'Đăng ký tài khoản thành công' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// 2. API Đăng nhập
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập đủ thông tin' });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Tài khoản hoặc mật khẩu không đúng' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Tài khoản hoặc mật khẩu không đúng' });
    }
    
    const token = jwt.sign(
      { username: user.username }, 
      process.env.JWT_SECRET || 'secret_key_sunwin', 
      { expiresIn: '7d' }
    );
    
    res.cookie('token', token, { httpOnly: true, secure: false });
    res.json({ message: 'Đăng nhập thành công', username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// 3. API Lấy thông tin User
app.get('/api/user', auth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }
    res.json({ 
      username: user.username, 
      balance: user.balance 
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// 4. API Nạp tiền (Tạo mã QR)
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const amount = req.body.amount || 10000;
    const orderCode = 'NAP' + Math.floor(100000 + Math.random() * 900000);
    
    const newTrans = new Transaction({
      orderCode: orderCode,
      username: req.user.username,
      amount: amount,
      type: 'nap',
      status: 'pending'
    });
    await newTrans.save();
    
    const qrUrl = `https://img.vietqr.io/image/${process.env.BANK_ID || '970423'}-${process.env.ACCOUNT_NO || '0000000000'}-compact2.png?amount=${amount}&addInfo=${orderCode}&accountName=${encodeURIComponent(process.env.ACCOUNT_NAME || 'NGUYEN VAN A')}`;
    
    res.json({ 
      code: orderCode, 
      qrUrl: qrUrl 
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo giao dịch' });
  }
});

// 5. API Kiểm tra trạng thái nạp tiền
app.get('/api/check-deposit/:code', auth, async (req, res) => {
  try {
    const trans = await Transaction.findOne({ 
      orderCode: req.params.code, 
      username: req.user.username 
    });
    
    if (trans && trans.status === 'success') {
      res.json({ success: true, amount: trans.amount });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// 6. API Webhook nhận tiền từ SePay
app.post('/sepay-webhook', async (req, res) => {
  try {
    const { content, transferAmount } = req.body;
    const match = content.match(/NAP\d{6}/);
    
    if (match) {
      const orderCode = match[0];
      const trans = await Transaction.findOne({ orderCode: orderCode, status: 'pending' });
      
      if (trans) {
        trans.status = 'success';
        await trans.save();
        
        await User.updateOne(
          { username: trans.username }, 
          { $inc: { balance: transferAmount } }
        );
        console.log(`Đã cộng ${transferAmount} VNĐ cho tài khoản ${trans.username}`);
      }
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. API Lấy lịch sử phiên
app.get('/api/history', async (req, res) => {
  try {
    const history = await GameHistory.find()
      .sort({ createdAt: -1 })
      .limit(10);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});


// ==========================================
// LOGIC GAME TÀI XỈU
// ==========================================
let timeLeft = 35;
let gameState = 'BETTING';
let totalTai = 0;
let totalXiu = 0;
let playersTai = 0;
let playersXiu = 0;
let currentBets = [];
let currentSessionId = 3305050;

const rollDice = () => {
  let d1, d2, d3, sum;
  
  if (totalTai > totalXiu) {
    do {
      d1 = Math.floor(Math.random() * 6) + 1;
      d2 = Math.floor(Math.random() * 6) + 1;
      d3 = Math.floor(Math.random() * 6) + 1;
      sum = d1 + d2 + d3;
    } while (sum > 10);
  } else if (totalXiu > totalTai) {
    do {
      d1 = Math.floor(Math.random() * 6) + 1;
      d2 = Math.floor(Math.random() * 6) + 1;
      d3 = Math.floor(Math.random() * 6) + 1;
      sum = d1 + d2 + d3;
    } while (sum < 11);
  } else {
    d1 = Math.floor(Math.random() * 6) + 1;
    d2 = Math.floor(Math.random() * 6) + 1;
    d3 = Math.floor(Math.random() * 6) + 1;
    sum = d1 + d2 + d3;
  }
  
  return { 
    dice: [d1, d2, d3], 
    sum: sum, 
    result: sum >= 11 ? 'TAI' : 'XIU' 
  };
};

io.on('connection', (socket) => {
  socket.emit('game_state', { 
    state: gameState, 
    timeLeft: timeLeft, 
    totalTai: totalTai, 
    totalXiu: totalXiu, 
    playersTai: playersTai, 
    playersXiu: playersXiu, 
    currentSessionId: currentSessionId 
  });

  socket.on('place_bet', async (data) => {
    if (gameState !== 'BETTING') {
      return socket.emit('bet_error', 'Đã hết thời gian đặt cược');
    }
    
    const { username, choice, amount } = data;
    
    try {
      const user = await User.findOne({ username });
      if (!user || user.balance < amount) {
        return socket.emit('bet_error', 'Số dư tài khoản không đủ');
      }
      
      user.balance -= amount;
      await user.save();
      
      if (choice === 'TAI') {
        totalTai += amount;
        playersTai++;
      } else {
        totalXiu += amount;
        playersXiu++;
      }
      
      currentBets.push({ username, choice, amount });
      
      io.emit('update_bets', { 
        totalTai: totalTai, 
        totalXiu: totalXiu, 
        playersTai: playersTai, 
        playersXiu: playersXiu 
      });
      
      socket.emit('bet_success', { 
        balance: user.balance, 
        choice: choice, 
        amount: amount 
      });
      
    } catch (err) {
      socket.emit('bet_error', 'Lỗi khi đặt cược');
    }
  });

  socket.on('chat_message', (data) => {
    io.emit('chat_message', data);
  });
});

setInterval(async () => {
  if (timeLeft > 0) {
    timeLeft--;
    io.emit('update_timer', timeLeft);
  } else {
    if (gameState === 'BETTING') {
      gameState = 'ROLLING';
      timeLeft = 5;
      io.emit('game_state', { state: gameState, currentSessionId: currentSessionId });
      
    } else if (gameState === 'ROLLING') {
      gameState = 'RESULT';
      timeLeft = 5;
      
      const resultData = rollDice();
      
      const historyRecord = new GameHistory({
        sessionId: currentSessionId,
        dice: resultData.dice,
        sum: resultData.sum,
        result: resultData.result
      });
      await historyRecord.save();
      
      let userResults = [];
      if (currentBets.length > 0) {
        for (let bet of currentBets) {
          let winAmount = 0;
          if (bet.choice === resultData.result) {
            winAmount = bet.amount * 2;
            await User.updateOne(
              { username: bet.username }, 
              { $inc: { balance: winAmount } }
            );
          }
          userResults.push({ 
            username: bet.username, 
            choice: bet.choice, 
            amount: bet.amount, 
            win: winAmount 
          });
        }
      }
      
      io.emit('game_result', {
        dice: resultData.dice,
        sum: resultData.sum,
        result: resultData.result,
        userResults: userResults
      });
      
      totalTai = 0;
      totalXiu = 0;
      playersTai = 0;
      playersXiu = 0;
      currentBets = [];
      currentSessionId++;
      
      io.emit('update_bets', { 
        totalTai: totalTai, 
        totalXiu: totalXiu, 
        playersTai: playersTai, 
        playersXiu: playersXiu 
      });
      
    } else if (gameState === 'RESULT') {
      gameState = 'BETTING';
      timeLeft = 35;
      io.emit('game_state', { state: gameState, currentSessionId: currentSessionId });
    }
  }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Máy chủ đang chạy tại cổng ${PORT}`);
});
