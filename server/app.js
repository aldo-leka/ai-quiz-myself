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

let users = {}; // Format: { 'US': 3, 'CA': 2, etc. }

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

app.get('/', (req, res) => {
    res.send('Hello World')
});

server.listen(PORT, () => {
    console.log(`AI Quiz server app listening on port ${PORT}`)
});

io.on('connection', (socket) => {
    console.log('a user connected');

    // Default country code for new connections
    socket.countryCode = 'UNKNOWN';

    broadcastCounts();
    
    // Handle request for user counts
    socket.on('get user count', () => {
        sendCountsToClient(socket);
    });
    
    // Handle client setting their country
    socket.on('set country', (data) => {
        const oldCountry = socket.countryCode;
        const newCountry = data.country;

        if (oldCountry !== 'UNKNOWN' && users[oldCountry]) {
            users[oldCountry]--;
            if (users[oldCountry] <= 0) {
                delete [oldCountry];
            }
        }
        
        socket.countryCode = newCountry;
        users[newCountry] = (users[newCountry] || 0) + 1;

        broadcastCounts();
    });
    
    socket.on('disconnect', () => {
        console.log('user disconnected');
        
        // Remove from country count if they had set one
        if (socket.countryCode !== 'UNKNOWN' && users[socket.countryCode]) {
            users[socket.countryCode]--;
            if (users[socket.countryCode] <= 0) {
                delete users[socket.countryCode];
            }
        }
        
        broadcastCounts();
    });
});

function broadcastCounts() {
    io.emit('user counts', users);
}

function sendCountsToClient(socket) {
    socket.emit('user counts', users);
}
