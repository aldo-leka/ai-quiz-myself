import './config.js'
import express from 'express'
import { GoogleGenAI } from "@google/genai"

const router = express.Router()
const gemini = new GoogleGenAI({})

// Scene-specific system prompts for different parts of the game
const SCENE_PROMPTS = {
    WELCOME: (moneyValue) => `You are the charismatic host of "Who Wants to Be a Millionaire". The player just arrived on stage. Welcome them warmly and explain the game:
- The player is competing for $1,000,000
- They start at $${moneyValue} and work their way up through 14 questions
- They have 2 lifelines: 50-50 (removes 2 wrong answers) and Ask the Host (you give a hint)
- The more they get right, the more money they win
- Get the audience excited and hyped up!

Use "|||" to separate dramatic beats/pauses. Be energetic and build excitement!
Keep it to 3-5 segments maximum.
Do NOT use asterisks for actions - only speak your lines.

Example: "Welcome to Who Wants to Be a Millionaire!|||You are 14 questions away from one million dollars.|||The rules are simple: the more you get right, the more money you win.|||You have 2 lifelines to help along the way: 50-50, and ask the host.|||Are you ready to play?|||Audience, are you ready to play?|||Okay, we are ready to play. Let's play Who Wants to Be a Millionaire!"`,

    BEGIN_QUESTION: (currentSetting) => `You are the host introducing a new question. The player is ready to see the next question.

Game State:
- Money Value: $${currentSetting.moneyValue}
- Question: ${currentSetting.question}
- Options: ${currentSetting.options?.join(', ')}
- Difficulty: ${currentSetting.difficulty}

Read out the question and all 4 options dramatically. Build excitement based on the money value.
For higher values, add more tension and drama.
Use "|||" to separate dramatic beats.
Keep it to 2-4 segments.

Example: "At your monitor, the first question for $${currentSetting.moneyValue}: ${currentSetting.question}|||${currentSetting.options?.[0]}...|||${currentSetting.options?.[1]}...|||${currentSetting.options?.[2]}...|||or ${currentSetting.options?.[3]}?"`,

    NEXT_QUESTION: (currentSetting) => `You are the host transitioning to the next question after a correct answer.

Game State:
- Money Value: $${currentSetting.moneyValue}
- Question: ${currentSetting.question}
- Options: ${currentSetting.options?.join(', ')}
- Previous Money: Was less, now at $${currentSetting.moneyValue}

Congratulate them briefly on the previous answer, then introduce the next question.
Increase drama as money values get higher.
Use "|||" to separate dramatic beats.

Example: "Excellent work! You're now playing for $${currentSetting.moneyValue}|||Let's see your next question...|||${currentSetting.question}|||Is it ${currentSetting.options?.[0]}, ${currentSetting.options?.[1]}, ${currentSetting.options?.[2]}, or ${currentSetting.options?.[3]}?"`,

    FINAL_ANSWER_CONFIRM: (currentSetting, selectedAnswer, isCorrect) => `You are the host reacting to the player's final answer selection.

Game State:
- Money Value: $${currentSetting.moneyValue}
- Question: ${currentSetting.question}
- Selected Answer: ${selectedAnswer}
- Correct Answer: ${currentSetting.correctAnswer}
- Is Correct: ${isCorrect}
- Time Remaining: ${currentSetting.remainingTime}s

Build SUSPENSE before revealing if they're right or wrong:
1. React to their selection with uncertainty
2. Build dramatic tension (more for higher values)
3. Finally reveal if correct or wrong

Use "|||" to separate dramatic beats.
For correct: celebrate appropriately for the money level
For wrong: show disappointment/shock based on money level

Example (correct): "You've selected ${selectedAnswer}...|||${currentSetting.moneyValue >= 100000 ? 'For $' + currentSetting.moneyValue + ', ' : ''}Let me see if that's right...|||And... that is CORRECT!|||${selectedAnswer} is indeed the right answer!"

Example (wrong): "You've selected ${selectedAnswer}...|||Oh no...|||I'm sorry, but that's incorrect.|||The correct answer was ${currentSetting.correctAnswer}."`,

    TIME_WARNING: (currentSetting) => `You are the host commenting on the remaining time.

Game State:
- Time Remaining: ${currentSetting.remainingTime}s
- Money Value: $${currentSetting.moneyValue}

Make a brief, urgent comment about the time running out.
Keep it to 1-2 segments maximum.
Use "|||" for dramatic pause if needed.

Example: "Time is running out!|||Better make a decision soon!"`,

    LIFELINE_5050: (currentSetting, remainingOptions) => `You are the host acknowledging the player used the 50-50 lifeline.

Game State:
- Money Value: $${currentSetting.moneyValue}
- Remaining Options: ${remainingOptions?.join(', ')}

Announce the lifeline usage and reveal which 2 options remain.
Keep it brief and clear.

Example: "You've chosen 50-50!|||Let's remove two incorrect answers...|||That leaves you with ${remainingOptions?.[0]} and ${remainingOptions?.[1]}."`,

    LIFELINE_ASK_HOST: (currentSetting) => `You are the host being asked for help by the player.

Game State:
- Money Value: $${currentSetting.moneyValue}
- Question: ${currentSetting.question}
- Options: ${currentSetting.options?.join(', ')}
- Correct Answer: ${currentSetting.correctAnswer}

Give a helpful hint that narrows it down but doesn't give away the answer completely.
Be supportive but maintain the game's challenge.
Use "|||" for dramatic pauses.

Example: "Alright, let me help you out...|||I can tell you that it's definitely not ${currentSetting.options?.find(o => o !== currentSetting.correctAnswer)}...|||And between the remaining options, think about what makes sense historically."`,
}

router.post('/host', async (req, res) => {
    res.status(500).json({ error: 'Failed to communicate with host' })
    return

    const { history, currentSetting, action, actionType, additionalData } = req.body

    // Build context from history
    const conversationContext = history?.map(msg =>
        `${msg.role === 'player' ? 'Player' : 'Host'}: ${msg.content}`
    ).join('\n') || ''

    // Determine which scene prompt to use based on actionType
    let systemPrompt = ''

    switch (actionType) {
        case 'WELCOME':
            systemPrompt = SCENE_PROMPTS.WELCOME(currentSetting?.moneyValue || 500)
            break
        case 'BEGIN_QUESTION':
            systemPrompt = SCENE_PROMPTS.BEGIN_QUESTION(currentSetting)
            break
        case 'NEXT_QUESTION':
            systemPrompt = SCENE_PROMPTS.NEXT_QUESTION(currentSetting)
            break
        case 'FINAL_ANSWER_CONFIRM':
            const isCorrect = additionalData?.selectedAnswer === currentSetting?.correctAnswer
            systemPrompt = SCENE_PROMPTS.FINAL_ANSWER_CONFIRM(
                currentSetting,
                additionalData?.selectedAnswer,
                isCorrect
            )
            break
        case 'TIME_WARNING':
            systemPrompt = SCENE_PROMPTS.TIME_WARNING(currentSetting)
            break
        case 'LIFELINE_5050':
            systemPrompt = SCENE_PROMPTS.LIFELINE_5050(currentSetting, additionalData?.remainingOptions)
            break
        case 'LIFELINE_ASK_HOST':
            systemPrompt = SCENE_PROMPTS.LIFELINE_ASK_HOST(currentSetting)
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

Respond naturally as the host. Use "|||" for dramatic pauses. Keep it brief (2-3 segments).`
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
        res.status(500).json({ error: 'Failed to communicate with host' })
    }
})

router.get('/generate-quiz', async (req, res) => {
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
    An example quiz is this Matt Damon and Ken Jennings celebrity contest: ${sample1()}
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
        - Explanations must provide educational context, not just say ‘this is correct’ or ‘this is wrong’
        - The stack of 14 questions should flow from easy to hard
    `;

    const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    })

    const json = JSON.parse(response.text.replace(/^```json\s*|\s*```$/g, '').trim())
    res.json({
        questions: json.questions
    })
})

router.get('/gemini', async (req, res) => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    res.json({
        "questions": [
            {
                "question": "What is the name of the wizard who guides Frodo Baggins in \"The Lord of the Rings\"?",
                "options": [
                    "Dumbledore",
                    "Gandalf",
                    "Merlin",
                    "Alatar"
                ],
                "difficulty": "easy",
                "subject": "Pop Culture",
                "correctAnswer": "Gandalf",
                "explanations": [
                    "Albus Dumbledore is the headmaster of Hogwarts in the Harry Potter series, not Middle-earth.",
                    "Gandalf is the iconic wizard of the Istari order who serves as a mentor and guide to the Fellowship of the Ring in J.R.R. Tolkien's \"The Lord of the Rings.\"",
                    "Merlin is a legendary sorcerer from Arthurian mythology, not part of Tolkien's world.",
                    "Alatar is one of the two Blue Wizards in Tolkien's lore, but he is not the main wizard who guides Frodo."
                ]
            },
            {
                "question": "Which large marine mammal is known for its distinctive blowhole on top of its head, used for breathing?",
                "options": [
                    "Shark",
                    "Dolphin",
                    "Whale",
                    "Seal"
                ],
                "difficulty": "easy",
                "subject": "Biology",
                "correctAnswer": "Whale",
                "explanations": [
                    "Sharks are fish and breathe through gills, not blowholes.",
                    "Dolphins are marine mammals that have blowholes, but they are a specific type of toothed whale. The question broadly asks for 'a large marine mammal,' for which 'Whale' is the most encompassing and iconic answer.",
                    "Whales are large marine mammals that breathe air through a blowhole located on the top of their heads.",
                    "Seals are marine mammals that breathe air through nostrils, not a blowhole."
                ]
            },
            {
                "question": "The Eiffel Tower is a famous landmark located in which European capital city?",
                "options": [
                    "London",
                    "Rome",
                    "Paris",
                    "Berlin"
                ],
                "difficulty": "easy",
                "subject": "Geography",
                "correctAnswer": "Paris",
                "explanations": [
                    "London is the capital of England and the United Kingdom, famous for landmarks like the Tower Bridge and Buckingham Palace.",
                    "Rome is the capital of Italy, home to the Colosseum and Vatican City.",
                    "Paris is the capital of France and is famously home to the Eiffel Tower, one of the world's most recognizable structures.",
                    "Berlin is the capital of Germany, known for the Brandenburg Gate and the Reichstag Building."
                ]
            },
            {
                "question": "Which social media platform is primarily known for short-form video content and viral dance challenges?",
                "options": [
                    "Facebook",
                    "X (formerly Twitter)",
                    "TikTok",
                    "Instagram"
                ],
                "difficulty": "easy",
                "subject": "Technology",
                "correctAnswer": "TikTok",
                "explanations": [
                    "Facebook is a general social networking platform primarily focused on text, photos, and longer videos.",
                    "X (formerly Twitter) is a microblogging platform known for short text posts and real-time news.",
                    "TikTok gained immense popularity for its user-generated short-form video content, often featuring music, dance, and viral trends.",
                    "Instagram focuses primarily on photo and short video sharing, but TikTok is more synonymous with the viral dance challenge culture."
                ]
            },
            {
                "question": "In what year did the first iPhone, revolutionizing mobile technology, make its debut?",
                "options": [
                    "2005",
                    "2007",
                    "2009",
                    "2011"
                ],
                "difficulty": "medium",
                "subject": "History",
                "correctAnswer": "2007",
                "explanations": [
                    "2005 saw significant tech releases like YouTube, but not the iPhone.",
                    "Apple CEO Steve Jobs unveiled the original iPhone in January 2007, and it went on sale in June of the same year, fundamentally changing the smartphone industry.",
                    "2009 was the year the iPhone 3GS was released, an update to the second-generation iPhone.",
                    "2011 was when the iPhone 4S was introduced, notable for the debut of Siri."
                ]
            },
            {
                "question": "Which pop superstar recently broke attendance records with her \"Eras Tour,\" celebrating her entire musical career?",
                "options": [
                    "Beyoncé",
                    "Adele",
                    "Taylor Swift",
                    "Rihanna"
                ],
                "difficulty": "medium",
                "subject": "Music",
                "correctAnswer": "Taylor Swift",
                "explanations": [
                    "Beyoncé recently embarked on her highly successful \"Renaissance World Tour.\"",
                    "Adele is known for her powerful vocals and specific concert residencies, but not the \"Eras Tour.\"",
                    "Taylor Swift's \"The Eras Tour\" is a monumental stadium tour showcasing her musical journey through different albums and phases of her career, breaking numerous records.",
                    "Rihanna has had major tours in the past, but has not recently conducted a tour named the \"Eras Tour.\""
                ]
            },
            {
                "question": "What is the name of the nearest large galaxy to our Milky Way, which is on a collision course with it in billions of years?",
                "options": [
                    "Triangulum Galaxy",
                    "Sombrero Galaxy",
                    "Andromeda Galaxy",
                    "Whirlpool Galaxy"
                ],
                "difficulty": "medium",
                "subject": "Science",
                "correctAnswer": "Andromeda Galaxy",
                "explanations": [
                    "The Triangulum Galaxy (M33) is another relatively nearby galaxy but is smaller and less massive than Andromeda.",
                    "The Sombrero Galaxy (M104) is a famous unbarred spiral galaxy known for its distinctive dust lane, but it is much farther away from the Milky Way.",
                    "The Andromeda Galaxy (M31) is the closest large spiral galaxy to the Milky Way, located about 2.5 million light-years away. Scientists predict the two galaxies will collide and merge in approximately 4.5 billion years.",
                    "The Whirlpool Galaxy (M51) is a classic example of an interacting grand-design spiral galaxy, but it is too distant to be on a collision course with the Milky Way."
                ]
            },
            {
                "question": "Which British author created the best-selling \"Harry Potter\" series of fantasy novels?",
                "options": [
                    "J.R.R. Tolkien",
                    "C.S. Lewis",
                    "Roald Dahl",
                    "J.K. Rowling"
                ],
                "difficulty": "medium",
                "subject": "Literature",
                "correctAnswer": "J.K. Rowling",
                "explanations": [
                    "J.R.R. Tolkien is the author of \"The Hobbit\" and \"The Lord of the Rings,\" set in Middle-earth.",
                    "C.S. Lewis is known for \"The Chronicles of Narnia\" series.",
                    "Roald Dahl is a celebrated children's author known for classics like \"Charlie and the Chocolate Factory\" and \"Matilda.\"",
                    "J.K. Rowling is the acclaimed British author who created the incredibly popular \"Harry Potter\" series, which follows the adventures of a young wizard and his friends at Hogwarts."
                ]
            },
            {
                "question": "Which sport features a \"slam dunk\" as one of its most exciting and high-scoring plays?",
                "options": [
                    "Tennis",
                    "Soccer",
                    "Basketball",
                    "Volleyball"
                ],
                "difficulty": "medium",
                "subject": "Sports",
                "correctAnswer": "Basketball",
                "explanations": [
                    "Tennis involves serving, volleys, and groundstrokes, with points scored when the opponent fails to return the ball.",
                    "Soccer (football) involves kicking a ball into a goal, with scoring plays like headers and penalty kicks.",
                    "A \"slam dunk\" is a signature move in basketball where a player jumps and forcefully shoves the ball through the basket from above, often for two points.",
                    "Volleyball involves hitting the ball over a net, with scoring plays like spikes and blocks."
                ]
            },
            {
                "question": "What popular fermented tea drink, often marketed for its health benefits, has seen a surge in popularity in recent years?",
                "options": [
                    "Espresso",
                    "Kombucha",
                    "Smoothie",
                    "Green Tea"
                ],
                "difficulty": "medium",
                "subject": "Food & Drink",
                "correctAnswer": "Kombucha",
                "explanations": [
                    "Espresso is a concentrated coffee beverage, not a fermented tea.",
                    "Kombucha is a fermented, lightly effervescent, sweetened black or green tea drink, popular for its distinctive flavor and perceived health benefits, experiencing a significant rise in popularity.",
                    "A smoothie is a blended beverage typically made from fruit, vegetables, and often yogurt or milk, not a fermented tea.",
                    "Green Tea is a type of tea that is not fermented, though it is healthy, it doesn't fit the specific description of a 'fermented tea drink' that has recently surged in popularity in this specific way."
                ]
            },
            {
                "question": "The construction of the Berlin Wall in 1961 was primarily to prevent what?",
                "options": [
                    "An invasion from West Germany",
                    "Espionage by Western powers",
                    "Mass defection from East to West Germany",
                    "Economic collapse of East Berlin"
                ],
                "difficulty": "hard",
                "subject": "History",
                "correctAnswer": "Mass defection from East to West Germany",
                "explanations": [
                    "While Cold War tensions were high, the Berlin Wall was an internal measure by East Germany, not a defense against an external invasion.",
                    "Espionage was a constant concern during the Cold War, but the primary reason for such a massive physical barrier was not solely to stop individual spies.",
                    "The Berlin Wall was erected by the German Democratic Republic (East Germany) to physically seal off East Berlin from West Berlin, preventing the large-scale defection of its citizens, particularly skilled workers and professionals, to the capitalist West.",
                    "While the exodus of skilled labor contributed to economic instability, the immediate and direct purpose of the wall was to halt the human outflow, rather than being built solely as a response to an imminent 'economic collapse'."
                ]
            },
            {
                "question": "Which human organ is responsible for producing insulin, a hormone vital for regulating blood sugar?",
                "options": [
                    "Liver",
                    "Kidneys",
                    "Pancreas",
                    "Spleen"
                ],
                "difficulty": "hard",
                "subject": "Biology",
                "correctAnswer": "Pancreas",
                "explanations": [
                    "The liver plays a crucial role in blood sugar regulation by storing and releasing glucose, but it does not produce insulin.",
                    "The kidneys are primarily responsible for filtering waste from the blood, maintaining fluid and electrolyte balance, and producing hormones related to blood pressure and red blood cell production.",
                    "The pancreas is an organ located behind the stomach that produces digestive enzymes and hormones, including insulin and glucagon, which are essential for regulating blood glucose levels.",
                    "The spleen is an organ that filters blood, removes old red blood cells, and plays a role in the immune system, but it is not involved in insulin production."
                ]
            },
            {
                "question": "Which contemporary Japanese artist is globally recognized for her distinctive polka dot patterns and large-scale installations, including \"Infinity Mirror Rooms\"?",
                "options": [
                    "Yayoi Kusama",
                    "Mariko Mori",
                    "Takashi Murakami",
                    "Yoko Ono"
                ],
                "difficulty": "hard",
                "subject": "Arts",
                "correctAnswer": "Yayoi Kusama",
                "explanations": [
                    "Yayoi Kusama is a highly influential contemporary Japanese artist, renowned for her pervasive use of polka dots, nets, and immersive, hallucinatory environments like her famous \"Infinity Mirror Rooms.\"",
                    "Mariko Mori is a Japanese artist known for her technologically advanced and spiritually themed works that often fuse ancient Japanese culture with futuristic elements.",
                    "Takashi Murakami is a Japanese contemporary artist who works in fine arts media as well as commercial media, known for his 'Superflat' art movement and characters like Mr. DOB.",
                    "Yoko Ono is a Japanese-American artist, singer, songwriter, and peace activist, widely known for her conceptual art and experimental music, and her marriage to John Lennon."
                ]
            },
            {
                "question": "What is the term for a type of artificial intelligence that can generate new content, such as text, images, or audio, based on learned patterns?",
                "options": [
                    "Predictive AI",
                    "Generative AI",
                    "Analytical AI",
                    "Reactive AI"
                ],
                "difficulty": "hard",
                "subject": "Technology",
                "correctAnswer": "Generative AI",
                "explanations": [
                    "Predictive AI focuses on forecasting future outcomes by analyzing historical data and identifying patterns, such as predicting stock prices or customer behavior.",
                    "Generative AI is a category of artificial intelligence that can produce novel outputs like text, images, code, or audio, by learning patterns from vast datasets and creating new, original content based on that understanding.",
                    "Analytical AI is designed to analyze data, extract insights, and assist in decision-making by identifying trends and correlations, rather than creating new content.",
                    "Reactive AI is the most basic type of AI, designed to react to immediate situations based on predefined rules without memory or learning from past experiences."
                ]
            }
        ]
    })
})

router.get('/openai', async (req, res) => {
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

export default router;