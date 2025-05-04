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

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

app.get('/', (req, res) => {
    res.send('Hello World')
});

server.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`)
});

io.on('connection', (socket) => {
    console.log('a user connected');
});
