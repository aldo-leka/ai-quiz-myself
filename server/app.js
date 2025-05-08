const express = require('express');
const cors = require('cors');

const app = express();

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3002';

const { Server } = require('socket.io');
const { createServer } = require('node:http');
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// key: nickname
// value: { socket id, country code, etc. }
let onlineUsers = new Map();
let disconnects = new Map();

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

app.get('/users-by-country', (req, res) => {
    const countryCounts = {};

    for (const [, player] of onlineUsers) {
        const country = player.country || 'GLOBAL';
        countryCounts[country] = (countryCounts[country] || 0) + 1;
    }

    res.json(countryCounts);
});

server.listen(PORT, () => {
    console.log(`AI Quiz server app listening on port ${PORT}`)
})

io.on('connection', (socket) => {
    socket.on('register nickname', async (nickname) => {
        const existing = onlineUsers.get(nickname)
        if (existing && existing.socketId !== socket.id) {
            if (!disconnects.has(nickname)) {
                socket.emit('nickname unavailable')
                return
            }

            clearTimeout(disconnects.get(nickname))
            disconnects.delete(nickname)
            console.log(`${nickname} from ${existing.country} (ip: ${socket.handshake.address}) reconnected before timeout`);
        }

        let ip = socket.handshake.address
        if (ip === '::1' || ip === '127.0.0.1') {
            ip = '8.8.8.8';
        }

        const country = await getCountryFromIP(ip)

        onlineUsers.set(nickname, { socketId: socket.id, country })
        socket.nickname = nickname
        console.log(`${nickname} connected from ${country} (ip: ${ip})`)

        socket.emit('nickname accepted')
    })

    socket.on('disconnect', () => {
        const nickname = socket.nickname
        if (!nickname) return

        const timeoutId = setTimeout(() => {
            const country = onlineUsers.get(nickname).country
            onlineUsers.delete(nickname);
            disconnects.delete(nickname);
            console.log(`${nickname} from ${country} (ip: ${socket.handshake.address}) removed after timeout`)
        }, 30000)

        disconnects.set(nickname, timeoutId)
    })
})

async function getCountryFromIP(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await res.json();
        if (data.status === 'success') return data.countryCode;
    } catch (err) {
        console.error('Geo lookup failed', err);
    }
    return null;
}