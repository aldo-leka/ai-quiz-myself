import './config.js'
import express from 'express'
import OpenAI from 'openai'
import { GoogleGenAI } from "@google/genai"

const router = express.Router()
const gemini = new GoogleGenAI({})

router.get('/generate-quiz', async (req, res) => {
    const client = new OpenAI()

    const type = "multiple choice"
    const theme = "general knowledge"
    const moneyLadder = [500, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000, 100000, 250000, 500000, 1000000]
    const questionCount = moneyLadder.length
    const difficultyInstructions = `The difficulty level per question should match the money amount of that question
     for the given money ladder: ${moneyLadder.map(m => "$" + m).join(', ')} starting from easiest to hardest.`
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
        model: "gemini-2.5-flash",
        contents: prompt,
    })

    const json = JSON.parse(response.text.replace(/^```json\s*|\s*```$/g, '').trim())
    res.json({
        theme: theme,
        questions: json.questions
    })
})

router.get('/gemini', async (req, res) => {
    res.json({
        "theme": "general knowledge",
        "questions": [
            {
                "question": "What is the capital city of Australia?",
                "options": [
                    "Sydney",
                    "Melbourne",
                    "Canberra",
                    "Brisbane"
                ],
                "correctAnswer": "Canberra",
                "explanations": [
                    "Sydney is Australia's largest city and a major port, but it is not the capital.",
                    "Melbourne is a significant cultural hub and former capital, but Canberra holds the current status.",
                    "Canberra was specifically designed and established as the federal capital of Australia in 1908.",
                    "Brisbane is the capital of the state of Queensland, but not the national capital."
                ]
            },
            {
                "question": "Which large fruit is famous for being a good source of potassium?",
                "options": [
                    "Apple",
                    "Orange",
                    "Banana",
                    "Grape"
                ],
                "correctAnswer": "Banana",
                "explanations": [
                    "Apples are known for fiber and Vitamin C, but not primarily for potassium.",
                    "Oranges are rich in Vitamin C, but bananas contain significantly more potassium.",
                    "Bananas are widely recognized as an excellent source of potassium, essential for heart and muscle function.",
                    "Grapes are high in antioxidants and vitamins, but less so in potassium compared to a banana."
                ]
            },
            {
                "question": "Which gas do plants absorb from the atmosphere for photosynthesis?",
                "options": [
                    "Oxygen",
                    "Nitrogen",
                    "Carbon Dioxide",
                    "Hydrogen"
                ],
                "correctAnswer": "Carbon Dioxide",
                "explanations": [
                    "Plants release Oxygen as a byproduct of photosynthesis, they do not absorb it for the process.",
                    "Nitrogen is crucial for plant growth, but it's absorbed from the soil, not directly from the atmosphere for photosynthesis.",
                    "Carbon Dioxide is the primary gas absorbed by plants from the atmosphere, which they use along with water and sunlight to create food.",
                    "Hydrogen is a component of water, which plants use, but they do not absorb elemental hydrogen gas from the atmosphere."
                ]
            },
            {
                "question": "Who wrote the classic novel 'To Kill a Mockingbird'?",
                "options": [
                    "J.K. Rowling",
                    "Harper Lee",
                    "Ernest Hemingway",
                    "F. Scott Fitzgerald"
                ],
                "correctAnswer": "Harper Lee",
                "explanations": [
                    "J.K. Rowling is famous for the 'Harry Potter' series, a different literary genre.",
                    "Harper Lee is the celebrated author of the Pulitzer Prize-winning novel 'To Kill a Mockingbird'.",
                    "Ernest Hemingway wrote classics like 'The Old Man and the Sea', but not 'To Kill a Mockingbird'.",
                    "F. Scott Fitzgerald is known for 'The Great Gatsby', another American literary staple."
                ]
            },
            {
                "question": "Which of the following is NOT one of the Seven Wonders of the Ancient World?",
                "options": [
                    "The Great Pyramid of Giza",
                    "The Colossus of Rhodes",
                    "The Great Wall of China",
                    "The Lighthouse of Alexandria"
                ],
                "correctAnswer": "The Great Wall of China",
                "explanations": [
                    "The Great Pyramid of Giza is indeed the only Ancient Wonder still largely intact today.",
                    "The Colossus of Rhodes, a giant statue of the sun god Helios, was one of the Seven Wonders.",
                    "The Great Wall of China, while an incredible ancient construction, was not included in the original list of the Seven Wonders of the Ancient World.",
                    "The Lighthouse of Alexandria, a monumental lighthouse, was a prominent Ancient Wonder."
                ]
            },
            {
                "question": "What is the chemical symbol for the element gold?",
                "options": [
                    "Ag",
                    "Fe",
                    "Au",
                    "Pb"
                ],
                "correctAnswer": "Au",
                "explanations": [
                    "Ag is the chemical symbol for Silver.",
                    "Fe is the chemical symbol for Iron.",
                    "Au is the correct chemical symbol for Gold, derived from its Latin name 'aurum'.",
                    "Pb is the chemical symbol for Lead."
                ]
            },
            {
                "question": "In which year did the first human land on the Moon?",
                "options": [
                    "1965",
                    "1969",
                    "1972",
                    "1975"
                ],
                "correctAnswer": "1969",
                "explanations": [
                    "While a significant year in the space race, 1965 was too early for the first moon landing.",
                    "On July 20, 1969, Neil Armstrong became the first person to walk on the Moon during the Apollo 11 mission.",
                    "1972 saw the final Apollo mission, Apollo 17, but not the first landing.",
                    "1975 was the year of the Apollo-Soyuz Test Project, a joint US-Soviet space mission, well after the initial moon landing."
                ]
            },
            {
                "question": "Which of these famous figures is credited with discovering penicillin?",
                "options": [
                    "Louis Pasteur",
                    "Marie Curie",
                    "Alexander Fleming",
                    "Jonas Salk"
                ],
                "correctAnswer": "Alexander Fleming",
                "explanations": [
                    "Louis Pasteur is known for pasteurization and vaccines, not penicillin.",
                    "Marie Curie is famous for her groundbreaking work in radioactivity, discovering polonium and radium.",
                    "Alexander Fleming accidentally discovered penicillin in 1928, observing its antibacterial properties.",
                    "Jonas Salk developed one of the first successful polio vaccines."
                ]
            },
            {
                "question": "Which mountain range separates Europe and Asia?",
                "options": [
                    "The Alps",
                    "The Himalayas",
                    "The Ural Mountains",
                    "The Andes"
                ],
                "correctAnswer": "The Ural Mountains",
                "explanations": [
                    "The Alps are a major mountain range in Central Europe, but they do not separate Europe from Asia.",
                    "The Himalayas are located in Asia, forming a natural border between the Indian subcontinent and the Tibetan Plateau.",
                    "The Ural Mountains are traditionally considered the natural boundary between Europe and Asia.",
                    "The Andes are the longest continental mountain range in the world, located along the western coast of South America."
                ]
            },
            {
                "question": "What is the name of the ancient trade route that connected the East and West?",
                "options": [
                    "The Spice Route",
                    "The Amber Road",
                    "The Silk Road",
                    "The Royal Road"
                ],
                "correctAnswer": "The Silk Road",
                "explanations": [
                    "The Spice Route was a network of sea routes connecting the East with Europe, primarily for spices.",
                    "The Amber Road was an ancient trade route for the transfer of amber from the North Sea and Baltic Sea to Southern Europe.",
                    "The Silk Road was an extensive network of trade routes, crucial for cultural and commercial exchange between Asia and Europe, predominantly for silk.",
                    "The Royal Road was an ancient highway reorganized and rebuilt by the Persian king Darius the Great in the 5th century BC, mainly within the Persian Empire."
                ]
            },
            {
                "question": "Which literary character famously lives in a house called '221B Baker Street'?",
                "options": [
                    "Hercule Poirot",
                    "Miss Marple",
                    "Sherlock Holmes",
                    "James Bond"
                ],
                "correctAnswer": "Sherlock Holmes",
                "explanations": [
                    "Hercule Poirot is another famous detective, created by Agatha Christie, but he does not reside at 221B Baker Street.",
                    "Miss Marple, also by Agatha Christie, is a beloved elderly amateur sleuth, but not associated with Baker Street.",
                    "Sherlock Holmes, the iconic consulting detective created by Sir Arthur Conan Doyle, is famously associated with his residence at 221B Baker Street in London.",
                    "James Bond is a fictional British Secret Service agent, created by Ian Fleming, whose headquarters are in MI6, not Baker Street."
                ]
            },
            {
                "question": "Which scientific principle states that 'for every action, there is an equal and opposite reaction'?",
                "options": [
                    "Newton's First Law of Motion",
                    "Newton's Second Law of Motion",
                    "Newton's Third Law of Motion",
                    "The Law of Conservation of Energy"
                ],
                "correctAnswer": "Newton's Third Law of Motion",
                "explanations": [
                    "Newton's First Law (Inertia) states that an object at rest stays at rest, and an object in motion stays in motion with the same speed and in the same direction unless acted upon by an unbalanced force.",
                    "Newton's Second Law (Force and Acceleration) states that the acceleration of an object as produced by a net force is directly proportional to the magnitude of the net force, in the same direction as the net force, and inversely proportional to the mass of the object (F=ma).",
                    "Newton's Third Law of Motion precisely states that for every action (force) in nature, there is an equal and opposite reaction.",
                    "The Law of Conservation of Energy states that energy can neither be created nor destroyed, only converted from one form to another."
                ]
            },
            {
                "question": "Which country is the world's leading producer of coffee?",
                "options": [
                    "Colombia",
                    "Vietnam",
                    "Ethiopia",
                    "Brazil"
                ],
                "correctAnswer": "Brazil",
                "explanations": [
                    "Colombia is renowned for its high-quality Arabica coffee, but it is not the largest producer globally.",
                    "Vietnam is a major producer, especially of Robusta coffee, ranking second globally but not first.",
                    "Ethiopia is considered the birthplace of coffee and has a rich coffee culture, but its production volume is not the highest.",
                    "Brazil has been the world's largest producer of coffee for over 150 years, largely due to its vast plantations and favorable climate."
                ]
            },
            {
                "question": "What is the name of the deepest known point in the Earth's oceans?",
                "options": [
                    "Puerto Rico Trench",
                    "Java Trench",
                    "Mariana Trench",
                    "Kermadec Trench"
                ],
                "correctAnswer": "Mariana Trench",
                "explanations": [
                    "The Puerto Rico Trench is the deepest point in the Atlantic Ocean, but not globally.",
                    "The Java Trench (also known as the Sunda Trench) is the deepest point in the Indian Ocean, not the world.",
                    "The Mariana Trench, located in the western Pacific Ocean near the Mariana Islands, contains the Challenger Deep, which is the deepest known point on Earth.",
                    "The Kermadec Trench is a deep ocean trench in the South Pacific, but it is not the deepest overall."
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

export default router;