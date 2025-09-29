import './config.js'
import express from 'express'
import OpenAI from 'openai'
import { GoogleGenAI } from "@google/genai"
import log from "./log.js";

const router = express.Router()

log(process.env.GEMINI_API_KEY)
const gemini = new GoogleGenAI({})

router.get('/openai', async (req, res) => {
    const client = new OpenAI()
    const response = await client.responses.create({
        model: "gpt-5-nano",
        input: "Write a one-sentence bedtime story about a unicorn.",
    })

    res.json({text: response.output_text})
})

router.get('/gemini', async (req, res) => {
    const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: "Write a one-sentence bedtime story about a unicorn.",
    })

    res.json({text: response.text})
})

router.get('/generate-quiz', async (req, res) => {
    const client = new OpenAI()

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

    const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: prompt,
    })

    const json = JSON.parse(response.text.replace(/^```json\s*|\s*```$/g, '').trim())
    res.json({
        theme: theme,
        questions: json.questions
    })
})

router.get('/fake-quiz-2', async (req, res) => {
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

router.get('/fake-quiz', async (req, res) => {
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

router.get('/quiz', async (req, res) => {
    const client = new OpenAI()

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

export default router;