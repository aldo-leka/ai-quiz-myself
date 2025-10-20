import './config.js'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import log from './log.js'
import api from './api.js'
import pool from "./db/client.js";
import {GLOBAL_COUNTRY_CODE} from "./constants.js";

const PORT = process.env.PORT
const CORS_ORIGIN = process.env.CORS_ORIGIN

const app = express()
app.use(cors({origin: CORS_ORIGIN, credentials: true}))
app.use(express.json())
app.use('/api', api);

const server = createServer(app)
const io = new Server(server, {
    cors: {
        origin: CORS_ORIGIN,
        methods: ["GET", "POST"],
        credentials: true
    }
})

let users = new Map() // key: nickname, value: { socketId, countryCode, room, score, etc. }
let disconnects = new Map() // key: nickname, value: timer id

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

// Game timing constants (in seconds)
const GAME_TIMERS = {
    QUESTION_DURATION: 15,
    EXPLANATION_DURATION: 5,
    LEADERBOARD_DURATION: 8
}

let gameState = {
    active: false,
    theme: "Programming",
    difficulty: "Medium",
    currentQuestionIndex: -1,
    phase: null // can be "question", "explanation", or "leaderboard"
}

app.get('/api/users-by-country', (req, res) => {
    const {code} = req.query // e.g. ?code=global game
    const countryCounts = {}

    for (const [, player] of users) {
        if (code && player.room !== code) {
            continue;
        }

        const countryCode = player.countryCode || GLOBAL_COUNTRY_CODE;
        countryCounts[countryCode] = (countryCounts[countryCode] || 0) + 1;
    }

    res.json(countryCounts);
})

server.listen(PORT, () => {
    log(`AI Quiz server app listening on port ${PORT}`)
})

function startNewGlobalGame() {
    // Reset game state
    gameState.active = true
    gameState.currentQuestionIndex = -1

    // Reset scores for all players in the global game room
    for (const [nickname, player] of users) {
        if (player.room === 'global game') {
            player.score = 0
            users.set(nickname, player)
        }
    }

    const shuffledQuestions = [...quizQuestions].sort(() => Math.random() - 0.5)

    // Shuffle the answers for each question and update the correct answer index
    shuffledQuestions.forEach(question => {
        // Create pairs of [option, isCorrect] to track correct answer
        const optionPairs = question.options.map((option, index) =>
            [option, index === question.correctAnswer]
        )

        // Shuffle the pairs
        const shuffledPairs = optionPairs.sort(() => Math.random() - 0.5)

        // Update the question with shuffled options
        question.options = shuffledPairs.map(pair => pair[0])

        // Find the new index of the correct answer
        question.correctAnswer = shuffledPairs.findIndex(pair => pair[1])
    })

    // Replace the original questions with shuffled ones
    quizQuestions.length = 0
    shuffledQuestions.forEach(q => quizQuestions.push(q))

    io.to('global game').emit('global game started', {
        theme: gameState.theme,
        difficulty: gameState.difficulty
    })

    setTimeout(nextQuestion, 3000)
}

function nextQuestion() {
    gameState.currentQuestionIndex++;

    if (gameState.currentQuestionIndex >= quizQuestions.length) {
        endGame()
        return
    }

    const currentQuestion = quizQuestions[gameState.currentQuestionIndex];
    gameState.phase = "question"

    let remainingTime = GAME_TIMERS.QUESTION_DURATION

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
        io.to('global game').emit('global game timer update', {remainingTime})

        if (remainingTime <= 0) {
            clearInterval(timerInterval)
            revealAnswer()
        }
    }, 1000)
}

function revealAnswer() {
    gameState.phase = "explanation"
    const currentQuestion = quizQuestions[gameState.currentQuestionIndex]

    updatePlayerScores()

    let remainingTime = GAME_TIMERS.EXPLANATION_DURATION

    io.to('global game').emit('reveal global game answer', {
        theme: gameState.theme,
        difficulty: gameState.difficulty,
        questionIndex: gameState.currentQuestionIndex,
        totalQuestions: quizQuestions.length,
        question: currentQuestion.question,
        options: currentQuestion.options,
        correctAnswerIndex: currentQuestion.correctAnswer,
        explanation: currentQuestion.explanation,
        remainingTime: remainingTime
    });

    const timerInterval = setInterval(() => {
        remainingTime--;
        io.to('global game').emit('global game timer update', {remainingTime});

        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            nextQuestion()
        }
    }, 1000)
}

function updatePlayerScores() {
    for (const [nickname, player] of users) {
        if (player.room === 'global game') {
            if (player.isCorrect) {
                player.score = (player.score || 0) + 100
                player.isCorrect = false
                users.set(nickname, player)
                io.sockets.sockets.get(player.socketId).emit('update global game score', {score: player.score})
            }
        }
    }
}

function endGame() {
    gameState.active = false;
    gameState.phase = "leaderboard";

    const leaderboard = generateLeaderboard();

    let remainingTime = GAME_TIMERS.LEADERBOARD_DURATION;

    io.to('global game').emit('global game over', {
        theme: gameState.theme,
        difficulty: gameState.difficulty,
        leaderboard,
        remainingTime: remainingTime
    })

    const timerInterval = setInterval(() => {
        remainingTime--
        io.to('global game').emit('global game timer update', {remainingTime})

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
                countryCode: player.countryCode,
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

            log(`${nickname} from ${existing.countryCode} reconnected before timeout`);
        }

        socket.nickname = nickname

        let ip =
            socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() ||
            socket.handshake.address

        const countryCode = existing?.countryCode || await getCountryCodeFromIP(ip)

        users.set(nickname, {
            ...(existing || {}),
            socketId: socket.id,
            countryCode: countryCode
        })

        log(`on register nickname: ${nickname} connected from ${countryCode} (ip: ${ip})`)

        try {
            // upsert a stat
            await pool.query(
                `INSERT INTO stats (nickname, country_code, last_seen_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (nickname)
                 DO UPDATE SET
                    country_code = EXCLUDED.country_code,
                    last_seen_at = EXCLUDED.last_seen_at`,
                [nickname, countryCode]
            )
        } catch (error) {
            log(`Error adding stat: ${error}`)
        }

        socket.emit('nickname accepted')
    })

    socket.on('join global game', () => {
        if (!socket.nickname) {
            log('Socket tried to join global game without nickname')
            return
        }

        socket.join('global game')
        log(`${socket.nickname} joined global game room`)

        const player = users.get(socket.nickname)
        if (!player) {
            log(`on join global game: Player ${socket.nickname} not found in users map`)
            return
        }

        player.room = 'global game'
        users.set(socket.nickname, player)
        log(`Set ${socket.nickname}'s room to 'global game': ${JSON.stringify(player)}`)

        socket.to('global game').emit('player joined global game', {nickname: socket.nickname, ...player})

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
                    options: currentQuestion.options,
                    remainingTime: GAME_TIMERS.QUESTION_DURATION
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
                    explanation: currentQuestion.explanation,
                    remainingTime: GAME_TIMERS.EXPLANATION_DURATION
                })
            } else if (gameState.phase === "leaderboard") {
                socket.emit('global game over', {
                    theme: gameState.theme,
                    difficulty: gameState.difficulty,
                    leaderboard: generateLeaderboard(),
                    remainingTime: GAME_TIMERS.LEADERBOARD_DURATION
                })
            }
        }
    })

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

        player.isCorrect = isCorrect
        users.set(socket.nickname, player)
    });

    socket.on('leave global game', () => {
        if (!socket.nickname) return

        const player = users.get(socket.nickname)
        if (!player) {
            log(`on leave global game: Player ${socket.nickname} not found in users map`)
            return
        }

        player.room = null
        users.set(socket.nickname, player)
    })

    socket.on('disconnect', () => {
        const nickname = socket.nickname
        if (!nickname) {
            log('Socket tried to disconnect without nickname')
            return
        }

        const timeoutId = setTimeout(() => {
            const countryCode = users.get(nickname).countryCode
            users.delete(nickname)
            disconnects.delete(nickname)
            log(`${nickname} from ${countryCode} (ip: ${socket.handshake.address}) removed after timeout`)
        }, 30_000)

        disconnects.set(nickname, timeoutId)
    })
})

async function getCountryCodeFromIP(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}`)
        const data = await res.json()
        if (data.status === 'success') return data.countryCode
    } catch (err) {
        log(`Geo lookup failed: ${err.message}`)
    }
    return null
}

startNewGlobalGame()