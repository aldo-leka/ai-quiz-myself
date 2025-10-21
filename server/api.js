import './config.js'
import express from 'express'
import {GoogleGenAI} from "@google/genai"
import {MAX_HOST_SENTENCES, DAILY_QUIZ_GENERATION_COUNT, GLOBAL_COUNTRY_CODE} from './constants.js'
import pool from './db/client.js'

const router = express.Router()
const gemini = new GoogleGenAI({})

const SCENE_PROMPTS = {
    FINAL_ANSWER_CONFIRM: (currentSetting, selectedAnswer, isCorrect, correctAnswerExplanation, selectedAnswerExplanation) => `You are the host reacting to the player's final answer selection.

Game State:
- Money Value: $${currentSetting.moneyValue}
- Question: ${currentSetting.question}
- Selected Answer: ${selectedAnswer}
- Correct Answer: ${currentSetting.correctAnswer}
- Is Correct: ${isCorrect}
- Time Remaining: ${currentSetting.remainingTime}s

Educational Context:
- Correct Answer Explanation: ${correctAnswerExplanation}
${selectedAnswerExplanation ? `- Selected Answer Explanation: ${selectedAnswerExplanation}` : ''}

CRITICAL CONSTRAINT: Your response must be EXACTLY ${MAX_HOST_SENTENCES} sentences or less. No more than ${MAX_HOST_SENTENCES} sentences allowed.

CRITICAL INSTRUCTIONS:
1. Build brief suspense before revealing if they're right or wrong
2. If CORRECT: Use the Correct Answer Explanation to explain why it's right, leaving the player smarter
3. If WRONG: First acknowledge their choice briefly, then explain why the Selected Answer is incorrect using its explanation, THEN explain why the Correct Answer is right using its explanation - educate like a "Who Wants to Be a Millionaire" host
4. Keep the tone warm and educational, never condescending
5. Use delimiters with speed indicators: "|||fast|||", "|||medium|||", "|||slow|||"
6. Use the "|||reveal|||" delimiter to indicate that the correct answer should be revealed

Example (correct): "You've selected ${selectedAnswer}...|||slow|||That is CORRECT!|||reveal||||||medium|||${correctAnswerExplanation}"

Example (wrong): "You've selected ${selectedAnswer}...|||slow|||I'm sorry, that's incorrect.|||reveal||||||medium|||${selectedAnswerExplanation ? `${selectedAnswerExplanation}` : ''} The correct answer is ${currentSetting.correctAnswer}.|||medium|||${correctAnswerExplanation}"`,

    LIFELINE_ASK_HOST: (currentSetting, remainingOptions) => `You are the host being asked for help by the player.

Game State:
- Money Value: $${currentSetting.moneyValue}
- Question: ${currentSetting.question}
- Options: ${remainingOptions?.join(', ')}

CRITICAL CONSTRAINT: Your response must be EXACTLY ${MAX_HOST_SENTENCES} sentences or less. No more than ${MAX_HOST_SENTENCES} sentences allowed.

CRITICAL INSTRUCTIONS:
1. Start with "Here's what I think..."
2. Use your knowledge and reasoning to determine what you believe is the correct answer
3. Provide intelligent reasoning about why you think it's the right answer
4. You MUST end by saying "Final answer" after stating what you believe is correct
5. Be helpful and confident, like an intelligent game show host using their general knowledge
6. Use delimiters with speed indicators: "|||fast|||", "|||medium|||", "|||slow|||"
7. IMPORTANT: You don't know the correct answer - you're genuinely using your knowledge to help

Example: "Here's what I think...|||medium|||Based on what I know about this topic, I'm fairly confident the answer is [your best guess].|||medium|||That just makes the most sense to me.|||fast|||Final answer!"`,
}

router.post('/host', async (req, res) => {
    const {history, currentSetting, action, actionType, additionalData} = req.body

    if (actionType !== "LIFELINE_ASK_HOST" && actionType !== "FINAL_ANSWER_CONFIRM") {
        res.status(400).json({error: 'Failed to communicate with host'})
        return
    }

    // Build context from history
    const conversationContext = history?.map(msg =>
        `${msg.role === 'player' ? 'Player' : 'Host'}: ${msg.content}`
    ).join('\n') || ''

    // Determine which scene prompt to use based on actionType
    let systemPrompt = ''

    switch (actionType) {
        case 'FINAL_ANSWER_CONFIRM':
            const isCorrect = additionalData?.selectedAnswer === currentSetting?.correctAnswer
            systemPrompt = SCENE_PROMPTS.FINAL_ANSWER_CONFIRM(
                currentSetting,
                additionalData?.selectedAnswer,
                isCorrect,
                additionalData?.correctAnswerExplanation,
                additionalData?.selectedAnswerExplanation
            )
            break
        case 'LIFELINE_ASK_HOST':
            systemPrompt = SCENE_PROMPTS.LIFELINE_ASK_HOST(currentSetting, additionalData?.remainingOptions || currentSetting?.options)
            break
        default:
            // Fallback to generic host response
            const moneyValue = currentSetting?.moneyValue || 0
            const dramaLevel = moneyValue >= 100000 ? 'very high' : moneyValue >= 10000 ? 'high' : 'moderate'

            systemPrompt = `You are the charismatic host of "Who Wants to Be a Millionaire".

Game State:
- Money Value: $${moneyValue}
- Time Remaining: ${currentSetting?.remainingTime}s
- Question: ${currentSetting?.question}
- Drama level: ${dramaLevel}

Recent Conversation:
${conversationContext}

Player Action: ${action}

CRITICAL CONSTRAINT: Your response must be EXACTLY ${MAX_HOST_SENTENCES} sentences or less. No more than ${MAX_HOST_SENTENCES} sentences allowed.

Respond naturally as the host. Use "|||" for dramatic pauses.`
    }

    systemPrompt += `\n\nRecent Conversation History:\n${conversationContext}`

    try {
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: systemPrompt,
        })

        const hostMessage = response.text.trim()

        res.json({
            response: hostMessage
        })

    } catch (error) {
        console.error('Host communication error:', error)
        res.status(500).json({error: 'Failed to communicate with host'})
    }
})

// Batch generate quizzes for daily caching (called by cron job)
router.get('/batch-generate-quizzes', async (req, res) => {
    try {
        const count = DAILY_QUIZ_GENERATION_COUNT
        const generatedQuizzes = []

        for (let i = 0; i < count; i++) {
            const quiz = await generateSingleQuiz()

            // Store in database
            await pool.query(
                'INSERT INTO quizzes (questions) VALUES ($1)',
                [JSON.stringify(quiz.questions)]
            )

            generatedQuizzes.push(quiz)
        }

        res.json({
            success: true,
            message: `Successfully generated and stored ${count} quizzes`,
            count: generatedQuizzes.length
        })
    } catch (error) {
        console.error('Batch quiz generation error:', error)
        res.status(500).json({error: 'Failed to generate quizzes'})
    }
})

// Cleanup old quizzes (called by cron job)
router.get('/cleanup-old-quizzes', async (req, res) => {
    try {
        const daysToKeep = req.query.days || 7

        const result = await pool.query(
            'DELETE FROM quizzes WHERE created_at < NOW() - INTERVAL \'$1 days\' RETURNING id',
            [daysToKeep]
        )

        res.json({
            success: true,
            message: `Deleted quizzes older than ${daysToKeep} days`,
            deletedCount: result.rowCount
        })
    } catch (error) {
        console.error('Cleanup error:', error)
        res.status(500).json({error: 'Failed to cleanup old quizzes'})
    }
})

// Get a quiz from database (with session-based exclusion)
router.get('/generate-quiz', async (req, res) => {
    try {
        // Parse excluded quiz IDs from query params
        const excludeIds = req.query.exclude ? req.query.exclude.split(',').map(id => parseInt(id)) : []

        let query, params

        if (excludeIds.length > 0) {
            // Fetch a random quiz excluding the ones already seen
            query = 'SELECT * FROM quizzes WHERE id NOT IN (' + excludeIds.map((_, i) => `$${i + 1}`).join(',') + ') ORDER BY RANDOM() LIMIT 1'
            params = excludeIds
        } else {
            // Fetch any random quiz
            query = 'SELECT * FROM quizzes ORDER BY RANDOM() LIMIT 1'
            params = []
        }

        const result = await pool.query(query, params)

        if (result.rows.length === 0) {
            // No quizzes available (either all excluded or database is empty)
            return res.status(404).json({
                error: 'No quizzes available',
                message: 'All quizzes have been played or database is empty. Clear your history to play again.'
            })
        }

        const quiz = result.rows[0]
        res.json({
            id: quiz.id,
            questions: quiz.questions
        })
    } catch (error) {
        console.error('Quiz fetch error:', error)
        res.status(500).json({error: 'Failed to fetch quiz'})
    }
})

async function generateSingleQuiz() {
    const type = "multiple choice"
    const moneyLadder = [500, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000, 100000, 250000, 500000, 1000000]
    const questionCount = moneyLadder.length
    const prompt = `You are an expert game show producer creating "Who Wants to Be a Millionaire"-style quiz shows.
    Create a ${type} quiz with ${questionCount} questions. Try to cover all classic quiz subjects (biology, history, arts etc.).
    Add as many contemporary questions as possible. The show is for family entertainment so avoid unpleasant questions regarding
    dictators, terrorists and tsunamis. Put great care into choosing answer possibilities to maximise discussion and deliberation
    in the studio and for the viewers. When you as the question editor have a sizeable database of questions,
    stack them for the show in stacks of 15, so that each stack is increasingly more difficult and has questions from many subjects,
    but only one question about each subject. The aim is a varied stack going from easy to hard, so that winning the big prize
    requires very broad knowledge in both classical and contemporary subjects.
    An example quiz is this Matt Damon and Ken Jennings celebrity contest: ${JSON.stringify(sample1())}
    Always respond with valid JSON. Return the response as a JSON object with the following structure:
    {
        "questions": [
            {
                "question": "Question text",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "difficulty": "easy" | "medium" | "hard"
                "subject": "History" | "Biology" | "Arts" | "Pop Culture"
                "correctAnswer": "Correct answer",
                "explanations": [
                    "Explanation why A is wrong / right",
                    "Explanation why B is wrong / right",
                    "Explanation why C is wrong / right",
                    "Explanation why D is wrong / right"
                ]
            }
        ]
    }
    For multiple choice questions:
        - Each question should have exactly 4 options
        - Only one option should be correct
        - The correctAnswer should be the exact text of the correct option
        - Explanations must provide educational context, not just say 'this is correct' or 'this is wrong'
        - The stack of 14 questions should flow from easy to hard
    `;

    const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    })

    const json = JSON.parse(response.text.replace(/^```json\s*|\s*```$/g, '').trim())
    return {
        questions: json.questions
    }
}

// Matt Damon and Ken Jennings // Celebrity contest // https://millionaire.fandom.com/wiki/Matt_Damon_and_Ken_Jennings
function sample1() {
    return {
        "questions": [
            // {
            //     "question": "A popular role-playing game described as \"the nerdiest of nerdy pastimes\" is called \"Dungeons &\" what?",
            //     "options": [
            //         "Doritos",
            //         "Dragons",
            //         "Deodorant",
            //         "Celibacy"
            //     ],
            //     "correctAnswer": "Dragons"
            // },
            {
                "question": "Which of these words is derived from a Latin term meaning \"mother's brother\"?",
                "options": [
                    "Niece",
                    "Nephew",
                    "Sister",
                    "Uncle"
                ],
                "correctAnswer": "Uncle"
            },
            {
                "question": "Made by Nabisco, Teddy Grahams are shaped like what animals??",
                "options": [
                    "Worms",
                    "Bears",
                    "Flamingos",
                    "Crabs"
                ],
                "correctAnswer": "Bears"
            },
            {
                "question": "Achieving statehood in 1912, what is the newest state with the word \"New\" in its name?",
                "options": [
                    "New Hampshire",
                    "New York",
                    "New Mexico",
                    "New Jersey"
                ],
                "correctAnswer": "New Mexico"
            },
            {
                "question": "\"Clucking\" in at just 34 seconds, the shortest Billboard Hot 100 hit ever is Jack Black's \"Steve's Lava Chicken,\" a song from what 2025 film?",
                "options": [
                    "A Minecraft Movie",
                    "Snow White",
                    "Lilo & Stitch",
                    "Novocaine"
                ],
                "correctAnswer": "A Minecraft Movie"
            },
            {
                "question": "A rock hound is a nickname for someone who specializes in what scientific field?",
                "options": [
                    "Botany",
                    "Geology",
                    "Anatomy",
                    "Psychology"
                ],
                "correctAnswer": "Geology"
            },
            {
                "question": "Though Donatella will still serve as its Chief Brand Ambassador, what Italian fashion house was bought by rival Prada in 2025 for a reported $1.4 billion?",
                "options": [
                    "Armani",
                    "Fendi",
                    "Gucci",
                    "Versace"
                ],
                "correctAnswer": "Versace"
            },
            {
                "question": "In Philadelphia, a sculpture that reads \"YO\" from one side, but a different word from the other side, sits in front of a museum dedicated to what?",
                "options": [
                    "Astronomy",
                    "Jazz",
                    "Jewish history",
                    "Classic cars"
                ],
                "correctAnswer": "Jewish history"
            },
            {
                "question": "With stops in Maui, Taormina and Koh Samui, Four Seasons offers a jet-setting tour inspired by locations featured in what TV series?",
                "options": [
                    "The Last of Us",
                    "Succession",
                    "The Bear",
                    "The White Lotus"
                ],
                "correctAnswer": "The White Lotus"
            },
            {
                "question": "Prince wrote the hit song \"1999\" after watching a documentary about what historic figure?",
                "options": [
                    "Nostradamus",
                    "Rasputin",
                    "Plato",
                    "Charlemagne"
                ],
                "correctAnswer": "Nostradamus"
            },
            {
                "question": "Which of these acclaimed novels is the only one that was originally written in English?",
                "options": [
                    "Around the World in Eighty Days",
                    "All Quiet on the Western Front",
                    "A Passage to India",
                    "Love in the Time of Cholera"
                ],
                "correctAnswer": "A Passage to India"
            },
            {
                "question": "In a popular Spanish New Year's Eve tradition, revelers attempt to eat and swallow 12 of which food before the midnight bell tolls 12 times?",
                "options": [
                    "Pimentos",
                    "Grapes",
                    "Anchovies",
                    "Hazelnuts"
                ],
                "correctAnswer": "Grapes"
            },
            {
                "question": "Believed to help them conserve energy, \"vertical sleeping\" is a unique behavior exhibited by which of these animals?",
                "options": [
                    "Sperm whale",
                    "Bactrian camel",
                    "Canada goose",
                    "Ring-tailed lemur"
                ],
                "correctAnswer": "Sperm whale"
            },
            {
                "question": "With another career path already established, who got his first taste of the entertainment world when he entered a Steve Martin look-alike contest?",
                "options": [
                    "Dr. Oz",
                    "Jerry Springer",
                    "Bill Nye",
                    "Anthony Bourdain"
                ],
                "correctAnswer": "Bill Nye"
            },
            {
                "question": "Which of these words is often used to describe one of the most beautiful auditory effects on Earth: the sound made by the leaves of trees when wind blows through them?",
                "options": [
                    "Apricity",
                    "Petrichor",
                    "Susurrus",
                    "Eudaemonia"
                ],
                "correctAnswer": "Susurrus"
            }
        ]
    }
}

router.get('/stats',  async (req, res) => {
    const result = await pool.query('SELECT * FROM stats')
    const stats = result.rows.map(row => ({
        nickname: row.nickname,
        countryCode: row.country_code ? row.country_code : GLOBAL_COUNTRY_CODE,
        lastSeenAt: row.last_seen_at
    }))

    res.json(stats)
})

export default router