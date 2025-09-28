const dotenv = require('dotenv')
dotenv.config()

const express = require('express');
const cors = require('cors')
const openai = require('openai')

const app = express()

const PORT = process.env.PORT
const CORS_ORIGIN = process.env.CORS_ORIGIN

function log(message) {
    // Create a date object in UTC
    const date = new Date()
    const timestamp = date.toLocaleString('en-GB', {
        timeZone: 'Europe/Paris', // CET timezone
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false  // Use 24-hour format
    }).replace(',', '')

    console.log(`[${timestamp}] ${message}`)
}

const {Server} = require('socket.io')
const {createServer} = require('node:http')
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

app.use(cors({origin: CORS_ORIGIN, credentials: true}))

app.get('/users-by-country', (req, res) => {
    const {code} = req.query // e.g. ?code=global game
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
        model: "gpt-5-nano",
        input: "Write a one-sentence bedtime story about a unicorn.",
    })

    res.json({text: response.output_text})
})

app.get('/generate-quiz', async (req, res) => {
    const client = new openai.OpenAI()

    const type = "multiple choice"
    const theme = "general knowledge"
    const moneyLadder = [500, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000, 100000, 250000, 500000, 1000000]
    const questionCount = moneyLadder.length
    const difficultyInstructions = `The difficulty level per question should match the money amount of that question
     for the given money ladder: ${moneyLadder.map(m => "$" + m).join(', ')}`
    const prompt = `You are an expert game show producer that creates and devises quiz shows. 
    Always respond with valid JSON.
    Create a ${type} quiz about ${theme} with ${questionCount} questions. ${difficultyInstructions}
    Return the response as a JSON object with the following structure:
    {
        "questions": [
            {
                "question": "Question text",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswer": "Correct answer",
                "explanations": [
                    "Explanation why A is wrong or right",
                    "Explanation why B is wrong or right", 
                    "Explanation why C is wrong or right", 
                    "Explanation why D is wrong or right"
                ]
            }
        ]
    }
    For multiple choice questions:
        - Each question should have exactly 4 options
        - Only one option should be correct
        - The correctAnswer should be the exact text of the correct option
        - Make the questions engaging
    `;

    const response = await client.responses.create({
        model: "gpt-5-nano",
        input: prompt
    })

    const json = JSON.parse(response.output_text)
    res.json({
        theme: theme,
        questions: json.questions
    })
})

app.get('/fake-quiz-2', async (req, res) => {
    res.json({
        "theme": "general knowledge",
        "questions": [
        {
            "question": "What is the capital city of France?",
            "options": [
                "Madrid",
                "Berlin",
                "Paris",
                "Rome"
            ],
            "correctAnswer": "Paris",
            "explanations": [
                "Incorrect. Madrid is the capital of Spain.",
                "Incorrect. Berlin is the capital of Germany.",
                "Correct. Paris is the capital and largest city of France.",
                "Incorrect. Rome is the capital of Italy."
            ]
        },
        {
            "question": "Which planet is known as the Red Planet?",
            "options": [
                "Earth",
                "Mars",
                "Jupiter",
                "Venus"
            ],
            "correctAnswer": "Mars",
            "explanations": [
                "Earth is not the Red Planet.",
                "Correct. Mars is known as the Red Planet due to its iron oxide.",
                "Incorrect. Jupiter is a gas giant.",
                "Incorrect. Venus is Earth's neighbor but not the Red Planet."
            ]
        },
        {
            "question": "In which year did World War II end?",
            "options": [
                "1939",
                "1945",
                "1944",
                "1950"
            ],
            "correctAnswer": "1945",
            "explanations": [
                "1939 is the year World War II began.",
                "Correct. The war ended in 1945.",
                "Incorrect. 1944 was a significant year but not the official end.",
                "Incorrect. 1950 is after the war ended."
            ]
        },
        {
            "question": "Which language has the most native speakers?",
            "options": [
                "English",
                "Mandarin Chinese",
                "Spanish",
                "Hindi"
            ],
            "correctAnswer": "Mandarin Chinese",
            "explanations": [
                "Incorrect. English has many speakers but not the most native speakers.",
                "Correct. Mandarin Chinese has more native speakers than any other language.",
                "Incorrect. Spanish has a large number of speakers but fewer native speakers than Mandarin.",
                "Incorrect. Hindi is widely spoken but not the most native speakers."
            ]
        },
        {
            "question": "What is the chemical symbol for Gold?",
            "options": [
                "Au",
                "Ag",
                "Go",
                "Gd"
            ],
            "correctAnswer": "Au",
            "explanations": [
                "Incorrect. Au is the symbol for gold.",
                "Incorrect. Ag is the symbol for silver.",
                "Incorrect. 'Go' is not a chemical symbol.",
                "Incorrect. Gd stands for gadolinium."
            ]
        },
        {
            "question": "Which is the largest ocean on Earth?",
            "options": [
                "Atlantic",
                "Indian",
                "Pacific",
                "Arctic"
            ],
            "correctAnswer": "Pacific",
            "explanations": [
                "Incorrect. The Atlantic is large but not the largest.",
                "Incorrect. The Indian Ocean is smaller than the Pacific.",
                "Correct. The Pacific Ocean is the largest on Earth.",
                "Incorrect. The Arctic Ocean is the smallest among the major oceans."
            ]
        },
        {
            "question": "Who wrote 'To Kill a Mockingbird'?",
            "options": [
                "Harper Lee",
                "Mark Twain",
                "J.K. Rowling",
                "Ernest Hemingway"
            ],
            "correctAnswer": "Harper Lee",
            "explanations": [
                "Incorrect. Mark Twain wrote earlier works like 'The Adventures of Tom Sawyer'.",
                "Correct. Harper Lee authored 'To Kill a Mockingbird' published in 1960.",
                "Incorrect. J.K. Rowling wrote the Harry Potter series.",
                "Incorrect. Ernest Hemingway wrote other novels; not this one."
            ]
        },
        {
            "question": "What is the smallest prime number?",
            "options": [
                "0",
                "1",
                "2",
                "3"
            ],
            "correctAnswer": "2",
            "explanations": [
                "Incorrect. 0 is not a prime number.",
                "Incorrect. 1 is not a prime number.",
                "Correct. 2 is the smallest prime number.",
                "Incorrect. 3 is prime but larger than 2."
            ]
        },
        {
            "question": "In computing, what does CPU stand for?",
            "options": [
                "Central Processing Unit",
                "Computer Personal Unit",
                "Central Power Unit",
                "Compute Performance Utility"
            ],
            "correctAnswer": "Central Processing Unit",
            "explanations": [
                "Incorrect. The common expansion is not listed here.",
                "Correct. CPU stands for Central Processing Unit.",
                "Incorrect. 'Central Power Unit' is not a standard term.",
                "Incorrect. The last option is not a recognized term."
            ]
        },
        {
            "question": "Which country hosted the 2016 Summer Olympics?",
            "options": [
                "China",
                "Brazil",
                "UK",
                "Russia"
            ],
            "correctAnswer": "Brazil",
            "explanations": [
                "Incorrect. The 2016 Summer Olympics were held in Rio de Janeiro, Brazil.",
                "Correct. Brazil hosted the 2016 Games.",
                "Incorrect. The UK hosted the 2012 Games in London.",
                "Incorrect. Russia did not host the 2016 Summer Olympics."
            ]
        },
        {
            "question": "What is the chemical symbol for potassium?",
            "options": [
                "Na",
                "K",
                "Pt",
                "Fe"
            ],
            "correctAnswer": "K",
            "explanations": [
                "Incorrect. Na is the symbol for sodium.",
                "Correct. K is the symbol for potassium.",
                "Incorrect. Pt is platinum.",
                "Incorrect. Fe is iron."
            ]
        },
        {
            "question": "Who painted 'The Persistence of Memory'?",
            "options": [
                "Pablo Picasso",
                "Vincent van Gogh",
                "Salvador Dalí",
                "Claude Monet"
            ],
            "correctAnswer": "Salvador Dalí",
            "explanations": [
                "Incorrect. Picasso painted other famous works like Guernica.",
                "Incorrect. Van Gogh is known for Starry Night, not this piece.",
                "Correct. Salvador Dalí painted The Persistence of Memory.",
                "Incorrect. Monet is associated with Impressionism and water lilies."
            ]
        },
        {
            "question": "Which gas makes up about 78% of Earth's atmosphere?",
            "options": [
                "Oxygen",
                "Nitrogen",
                "Argon",
                "Carbon Dioxide"
            ],
            "correctAnswer": "Nitrogen",
            "explanations": [
                "Incorrect. Oxygen makes up about 21%.",
                "Correct. Nitrogen comprises roughly 78% of the atmosphere.",
                "Incorrect. Argon is a trace gas.",
                "Incorrect. Carbon dioxide is about 0.04%."
            ]
        },
        {
            "question": "Which country has the most natural lakes?",
            "options": [
                "Canada",
                "Russia",
                "USA",
                "Finland"
            ],
            "correctAnswer": "Canada",
            "explanations": [
                "Correct. Canada is renowned for its vast number of lakes.",
                "Incorrect. Russia has many lakes but not as many as Canada.",
                "Incorrect. The USA has numerous lakes but fewer than Canada.",
                "Incorrect. Finland has many lakes per area, but Canada has the most overall."
            ]
        }]
    })
})

app.get('/fake-quiz', async (req, res) => {
    res.json({
        "theme": "Programming",
        "difficulty": "Medium",
        "questions": [
            {
                "question": "Which statement correctly describes a Python list?",
                "options": [
                    "It is a mutable, ordered collection.",
                    "It is an immutable, unordered collection.",
                    "It is a key-value mapping.",
                    "It is a sequence of characters only."
                ],
                "correctAnswer": "It is a mutable, ordered collection.",
                "explanation": "Lists in Python are mutable and preserve insertion order; they can hold heterogeneous items."
            },
            {
                "question": "In JavaScript, which expression reliably checks if a value is NaN (Not a Number) without coercion?",
                "options": [
                    "Number.isNaN(value)",
                    "typeof value === 'number' && value !== value",
                    "value == NaN",
                    "isNaN(value)"
                ],
                "correctAnswer": "Number.isNaN(value)",
                "explanation": "Number.isNaN checks for NaN without coercing other types. The global isNaN coerces values to numbers, leading to false positives."
            },
            {
                "question": "Which statement about Python dictionaries is true as of Python 3.7 and later?",
                "options": [
                    "They preserve insertion order.",
                    "They always sort keys numerically.",
                    "They cannot be changed after creation.",
                    "They are immutable."
                ],
                "correctAnswer": "They preserve insertion order.",
                "explanation": "Dictionaries preserve insertion order starting with Python 3.7; they are mutable and do not sort keys automatically."
            }
        ]
    })
})

app.get('/quiz', async (req, res) => {
    const client = new openai.OpenAI()

    const type = "multiple_choice"
    const theme = "Programming"
    const questionCount = 3
    const difficulty = "Medium"
    const difficultyInstructions = `The difficulty level should be ${difficulty}`
    const prompt = `You are an expert quiz creator who creates educational and engaging quizzes. Always respond with valid JSON.
    Create a ${type} quiz about ${theme} with ${questionCount} questions. ${difficultyInstructions}
    Return the response as a JSON object with the following structure:
    {
        "questions": [
            {
                "question": "Question text",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswer": "Correct answer",
                "explanation": "Explanation of the correct answer"
            }
        ]
    }
    For multiple choice questions:
        - Each question should have exactly 4 options
        - Only one option should be correct
        - The correctAnswer should be the exact text of the correct option
        - Make the questions engaging
    `;

    const response = await client.responses.create({
        model: "gpt-5-nano",
        input: prompt
    })

    const json = JSON.parse(response.output_text)
    res.json({
        theme: theme,
        difficulty: difficulty,
        // title: json.title,
        // description: json.description,
        // TODO: Hide the correct answer.
        questions: json.questions
    })
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

            log(`${nickname} from ${existing.country} reconnected before timeout`);
        }

        socket.nickname = nickname

        let ip =
            socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() ||
            socket.handshake.address

        const country = existing?.country || await getCountryFromIP(ip)

        users.set(nickname, {
            ...(existing || {}),
            socketId: socket.id,
            country
        })

        log(`on register nickname: ${nickname} connected from ${country} (ip: ${ip})`)

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
            const country = users.get(nickname).country
            users.delete(nickname)
            disconnects.delete(nickname)
            log(`${nickname} from ${country} (ip: ${socket.handshake.address}) removed after timeout`)
        }, 30_000)

        disconnects.set(nickname, timeoutId)
    })
})

async function getCountryFromIP(ip) {
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