const dotenv = require('dotenv')
dotenv.config()

const express = require('express');
const cors = require('cors')
const openai = require('openai')

const app = express()

const PORT = process.env.PORT
const CORS_ORIGIN = process.env.CORS_ORIGIN

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

let users = new Map() // key: nickname, value: { socketId, country, room, score, etc. }
let disconnects = new Map() // key: nickname, value: timer id

// Quiz questions data structure
const quizQuestions = [
  {
    id: 1,
    question: "Which programming language was created by Brendan Eich in 1995?",
    options: ["Java", "JavaScript", "Python", "C++"],
    correctAnswer: 1, // JavaScript (index 1)
    explanation: "JavaScript was created by Brendan Eich in 1995 while he was working at Netscape. It was originally called Mocha, then LiveScript, before being renamed to JavaScript."
  },
  {
    id: 2,
    question: "What does HTML stand for?",
    options: ["Hyperlinks and Text Markup Language", "Hyper Text Markup Language", "Home Tool Markup Language", "Hyper Technical Modern Language"],
    correctAnswer: 1, // Hyper Text Markup Language (index 1)
    explanation: "HTML stands for Hyper Text Markup Language. It is the standard markup language for creating web pages and describes the structure of a web page."
  },
  {
    id: 3,
    question: "Which of these is NOT a JavaScript framework/library?",
    options: ["React", "Angular", "Vue", "Django"],
    correctAnswer: 3, // Django (index 3)
    explanation: "Django is a high-level Python web framework. React, Angular, and Vue are all JavaScript frameworks or libraries used for building user interfaces."
  }
]

// Game state management
let gameState = {
    active: false,
    theme: "Programming",
    difficulty: "Medium",
    currentQuestionIndex: -1,
    phase: null // can be "question", "explanation", or "leaderboard"
}

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

app.get('/openai', async (req, res) => {
    const client = new openai.OpenAI()
    const response = await client.responses.create({
        model: "o4-mini",
        input: "Write a one-sentence bedtime story about a unicorn.",
    })

    res.json({ text: response.output_text })
})

server.listen(PORT, () => {
    console.log(`AI Quiz server app listening on port ${PORT}`)
})

function startNewGlobalGame() {
  // Reset game state
  gameState.active = true
  gameState.currentQuestionIndex = -1

  // Reset scores for all players in the global game room
  for (const [nickname, player] of users) {
    if (player.room === 'global game') {
      player.score = 0;
      users.set(nickname, player);
    }
  }

  nextQuestion()
}

function nextQuestion() {
  gameState.currentQuestionIndex++;

  if (gameState.currentQuestionIndex >= quizQuestions.length) {
    endGame()
    return
  }

  const currentQuestion = quizQuestions[gameState.currentQuestionIndex];
  gameState.phase = "question"

    let remainingTime = 20

  // Send the current question to clients (without the answer)
  io.to('global game').emit('next global game question', {
      theme: gameState.theme,
      difficulty: gameState.difficulty,
      questionIndex: gameState.currentQuestionIndex,
      totalQuestions: quizQuestions.length,
      question: currentQuestion.question,
      options: currentQuestion.options,
      remainingTime: remainingTime
  })

  const timerInterval = setInterval(() => {
    remainingTime--
    io.to('global game').emit('global game timer update', { remainingTime })

    if (remainingTime <= 0) {
        clearInterval(timerInterval)
        revealAnswer()
    }
  }, 1000)
}

function revealAnswer() {
    gameState.phase = "explanation"
    const currentQuestion = quizQuestions[gameState.currentQuestionIndex]

  // Send the answer and explanation to clients
  io.to('global game').emit('reveal global game answer', {
      theme: gameState.theme,
      difficulty: gameState.difficulty,
      questionIndex: gameState.currentQuestionIndex,
      totalQuestions: quizQuestions.length,
      question: currentQuestion.question,
      options: currentQuestion.options,
      correctAnswerIndex: currentQuestion.correctAnswer,
      explanation: currentQuestion.explanation
  });

    let remainingTime = 5
    const timerInterval = setInterval(() => {
        remainingTime--;
        io.to('global game').emit('global game timer update', { remainingTime });

        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            nextQuestion()
        }
    }, 1000)
}

function endGame() {
  gameState.active = false;
  gameState.phase = "leaderboard";

  const leaderboard = generateLeaderboard();

  io.to('global game').emit('global game over', {
      theme: gameState.theme,
      difficulty: gameState.difficulty,
      leaderboard
  })

    let remainingTime = 10;
    const timerInterval = setInterval(() => {
        remainingTime--
        io.to('global game').emit('global game timer update', { remainingTime })

        if (remainingTime <= 0) {
            clearInterval(timerInterval)
            startNewGlobalGame()
        }
    }, 1000)
}

function generateLeaderboard() {
  const leaderboard = []

  // Collect scores for all players in the global game room
  for (const [nickname, player] of users) {
    if (player.room === 'global game') {
      leaderboard.push({
        nickname,
        country: player.country,
        score: player.score || 0
      })
    }
  }

  leaderboard.sort((a, b) => b.score - a.score)

  return leaderboard
}

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

        users.set(nickname, { ...(existing || {}), socketId: socket.id, country, score: 0 })

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

        // Send current game state to the player if a game is in progress
        if (gameState.active) {
            const currentQuestion = quizQuestions[gameState.currentQuestionIndex];

            if (gameState.phase === "question") {
                socket.emit('next global game question', {
                    theme: gameState.theme,
                    difficulty: gameState.difficulty,
                    questionIndex: gameState.currentQuestionIndex,
                    totalQuestions: quizQuestions.length,
                    question: currentQuestion.question,
                    options: currentQuestion.options
                })
            } else if (gameState.phase === "explanation") {
                socket.emit('reveal global game answer', {
                    theme: gameState.theme,
                    difficulty: gameState.difficulty,
                    questionIndex: gameState.currentQuestionIndex,
                    totalQuestions: quizQuestions.length,
                    question: currentQuestion.question,
                    options: currentQuestion.options,
                    correctAnswerIndex: currentQuestion.correctAnswer,
                    explanation: currentQuestion.explanation
                })
            } else if (gameState.phase === "leaderboard") {
                socket.emit('global game over', {
                    theme: gameState.theme,
                    difficulty: gameState.difficulty,
                    leaderboard: generateLeaderboard()
                })
            }
        }
    })

    // Handle player submitting an answer
    socket.on('submit global game answer', (answerIndex) => {
        if (!socket.nickname) return
        if (!gameState.active || gameState.phase !== "question") {
            return
        }

        const player = users.get(socket.nickname);
        if (!player || player.room !== 'global game') {
            return
        }

        const currentQuestion = quizQuestions[gameState.currentQuestionIndex]
        const isCorrect = answerIndex === currentQuestion.correctAnswer

        player.score = (player.score || 0) + isCorrect ? 100 : 0
        users.set(socket.nickname, player)
    });

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

startNewGlobalGame()