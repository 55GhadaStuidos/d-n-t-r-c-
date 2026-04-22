const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.json());

const dbURI = process.env.MONGO_URI || "mongodb+srv://kaanghada_db_user:8MvVvvzGgVssOS0Z@cluster0.ezihax5.mongodb.net/borte_messenger?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(dbURI).then(() => {
    console.log("🚀 MongoDB bağlandı!");
}).catch(err => console.error("❌ DB Hatası:", err.message));

// ── ŞEMALAR ──────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    borteId: { type: String, unique: true },
    username: String,
    createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    content: String,
    timestamp: { type: Date, default: Date.now }
});

const friendshipSchema = new mongoose.Schema({
    requester: String,
    receiver: String,
    status: { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const Friendship = mongoose.model('Friendship', friendshipSchema);

// ── REST API ──────────────────────────────────────────────

app.get('/', (req, res) => res.json({ status: 'ok', app: 'Börte Messenger' }));

// Kayıt
app.post('/api/register', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username gerekli' });
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        const borteId = `${username}#${randomDigits}`;
        const user = new User({ borteId, username });
        await user.save();
        res.json({ success: true, borteId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Kullanıcı var mı?
app.get('/api/user/:borteId', async (req, res) => {
    try {
        const user = await User.findOne({ borteId: req.params.borteId });
        if (!user) return res.status(404).json({ exists: false });
        res.json({ exists: true, borteId: user.borteId, username: user.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Arkadaşlık isteği gönder
app.post('/api/friend/request', async (req, res) => {
    try {
        const { requester, receiver } = req.body;
        const receiverUser = await User.findOne({ borteId: receiver });
        if (!receiverUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        const existing = await Friendship.findOne({
            $or: [{ requester, receiver }, { requester: receiver, receiver: requester }]
        });
        if (existing) return res.status(400).json({ error: 'Zaten istek gönderilmiş veya arkadaşsınız' });
        const friendship = new Friendship({ requester, receiver });
        await friendship.save();
        io.to(receiver).emit('friend_request', { from: requester });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// İstek kabul/red
app.post('/api/friend/respond', async (req, res) => {
    try {
        const { requester, receiver, action } = req.body;
        const friendship = await Friendship.findOne({ requester, receiver, status: 'pending' });
        if (!friendship) return res.status(404).json({ error: 'İstek bulunamadı' });
        if (action === 'accept') {
            friendship.status = 'accepted';
            await friendship.save();
            io.to(requester).emit('friend_accepted', { by: receiver });
            res.json({ success: true, status: 'accepted' });
        } else {
            await friendship.deleteOne();
            res.json({ success: true, status: 'rejected' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Arkadaş listesi
app.get('/api/friends/:borteId', async (req, res) => {
    try {
        const { borteId } = req.params;
        const friendships = await Friendship.find({
            $or: [{ requester: borteId }, { receiver: borteId }],
            status: 'accepted'
        });
        const friendIds = friendships.map(f => f.requester === borteId ? f.receiver : f.requester);
        res.json({ friends: friendIds });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bekleyen istekler
app.get('/api/friend/pending/:borteId', async (req, res) => {
    try {
        const pending = await Friendship.find({ receiver: req.params.borteId, status: 'pending' });
        res.json({ requests: pending.map(p => p.requester) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Engelle
app.post('/api/friend/block', async (req, res) => {
    try {
        const { blocker, blocked } = req.body;
        await Friendship.findOneAndUpdate(
            { $or: [{ requester: blocker, receiver: blocked }, { requester: blocked, receiver: blocker }] },
            { requester: blocker, receiver: blocked, status: 'blocked' },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Arkadaşlıktan çıkar
app.delete('/api/friend', async (req, res) => {
    try {
        const { userA, userB } = req.body;
        await Friendship.deleteOne({
            $or: [
                { requester: userA, receiver: userB },
                { requester: userB, receiver: userA }
            ]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mesaj geçmişi
app.get('/api/messages/:userA/:userB', async (req, res) => {
    try {
        const { userA, userB } = req.params;
        const messages = await Message.find({
            $or: [
                { sender: userA, receiver: userB },
                { sender: userB, receiver: userA }
            ]
        }).sort({ timestamp: 1 }).limit(100);
        res.json({ messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── SOCKET.IO ─────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('⚡ Bağlandı: ' + socket.id);

    socket.on('join_node', (borteId) => {
        socket.join(borteId);
        console.log(`👤 ${borteId} odasına girdi`);
    });

    socket.on('send_msg', async (data) => {
        if (!data.nodeTag || !data.sender || !data.content) return;
        try {
            await new Message({ sender: data.sender, receiver: data.nodeTag, content: data.content }).save();
        } catch (e) {
            console.error("Mesaj kaydedilemedi:", e.message);
        }
        io.to(data.nodeTag).emit('receive_msg', data);
    });

    socket.on('disconnect', () => {
        console.log('❌ Ayrıldı: ' + socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Börte Sunucusu ${PORT} portunda aktif!`);
});
