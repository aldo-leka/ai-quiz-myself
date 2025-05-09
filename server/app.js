const express = require('express');
const cors = require('cors')

const app = express()

const PORT = process.env.PORT || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000'

const { Server } = require('socket.io')
const { createServer } = require('node:http')
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
})

let users = new Map() // key: nickname, value: { socket id, country code etc. }
let disconnects = new Map() // key: nickname, value: timer id

app.use(cors({ origin: CORS_ORIGIN, credentials: true }))

app.get('/users-by-country', (req, res) => {
    const { code } = req.query // e.g. ?code=global game
    const countryCounts = {}

    for (const [, player] of users) {
        if (code && player.room !== code) {
            continue;
        }

        const country = player.country || 'GLOBAL';
        countryCounts[country] = (countryCounts[country] || 0) + 1;
    }

    res.json(countryCounts);
})

server.listen(PORT, () => {
    console.log(`AI Quiz server app listening on port ${PORT}`)
})

io.on('connection', (socket) => {
    socket.on('register nickname', async (nickname) => {
        const existing = users.get(nickname)
        if (existing && existing.socketId !== socket.id) {
            if (!disconnects.has(nickname)) {
                socket.emit('nickname unavailable')
                return
            }

            clearTimeout(disconnects.get(nickname))
            disconnects.delete(nickname)

            console.log(`${nickname} from ${existing.country} reconnected before timeout`);
        }

        socket.nickname = nickname

        let ip =
            socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() ||
            socket.handshake.address
        ip = normalizeIP(ip)

        const country = await getCountryFromIP(ip)

        users.set(nickname, { ...(existing || {}), socketId: socket.id, country })

        console.log(`${nickname} connected from ${country} (ip: ${ip})`)

        socket.emit('nickname accepted')
    })

    socket.on('join global game', () => {
        if (!socket.nickname) {
            console.log('Socket tried to join global game without nickname')
            return
        }

        socket.join('global game')
        console.log(`${socket.nickname} joined global game room`)

        const player = users.get(socket.nickname)
        if (!player) {
            console.log(`on join global game: Player ${socket.nickname} not found in users map`)
            return
        }

        player.room = 'global game'
        users.set(socket.nickname, player)
        console.log(`Set ${socket.nickname}'s room to 'global game': ${JSON.stringify(player)}`)

        socket.to('global game').emit('player joined global game', { nickname: socket.nickname, ...player })
    })

    socket.on('leave global game', () => {
        if (!socket.nickname) return

        const player = users.get(socket.nickname)
        if (!player) {
            console.log(`on leave global game: Player ${socket.nickname} not found in users map`)
            return
        }

        player.room = null
        users.set(socket.nickname, player)
    })

    socket.on('disconnect', () => {
        const nickname = socket.nickname
        if (!nickname) return

        const timeoutId = setTimeout(() => {
            const country = users.get(nickname).country
            users.delete(nickname)
            disconnects.delete(nickname)
            console.log(`${nickname} from ${country} (ip: ${socket.handshake.address}) removed after timeout`)
        }, 30_000)

        disconnects.set(nickname, timeoutId)
    })
})

function normalizeIP(ip) {
    // Remove IPv6-mapped IPv4 prefix
    if (ip.startsWith('::ffff:')) {
        return ip.replace('::ffff:', '')
    }
    return ip
}

async function getCountryFromIP(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}`)
        const data = await res.json()
        if (data.status === 'success') return data.countryCode
    } catch (err) {
        console.error('Geo lookup failed', err)
    }
    return null
}