# Host Communication System Guide

This guide explains how to use the scene-based host communication system for the game.

## Overview

The host communication system now uses specific "action types" to trigger different scene-specific responses from the AI host. Each scene has its own tailored system prompt that guides the host's tone, style, and content.

## Available Action Types

### 1. **WELCOME** - Game Introduction
Use when the player first enters the game.

```typescript
const hostResponse = await sendAction({
    actionType: 'WELCOME',
    action: 'Player is ready to begin',
    currentQuestionIndex: 0,
})
```

**What the host will say:**
- Welcome the player warmly
- Explain the game rules (14 questions, $1M prize, 2 lifelines)
- Build excitement with the audience
- Example: "Welcome to Who Wants to Be a Millionaire! You are 14 questions away from one million dollars..."

---

### 2. **BEGIN_QUESTION** - First Question Introduction
Use when presenting the very first question of the game.

```typescript
const hostResponse = await sendAction({
    actionType: 'BEGIN_QUESTION',
    action: 'Presenting the first question',
    currentQuestion: questions[0],
    currentQuestionIndex: 0,
    remainingTime: 30
})
```

**What the host will say:**
- Introduce the question with drama
- Read out all 4 options
- Build excitement for the money value
- Example: "At your monitor, the first question for $500: [question]... A, B, C, or D?"

---

### 3. **NEXT_QUESTION** - Subsequent Questions
Use after a correct answer to transition to the next question.

```typescript
const hostResponse = await sendAction({
    actionType: 'NEXT_QUESTION',
    action: 'Moving to the next question',
    currentQuestion: questions[currentQuestionIndex],
    currentQuestionIndex: currentQuestionIndex,
    remainingTime: 30
})
```

**What the host will say:**
- Briefly congratulate on the previous answer
- Announce the new money value
- Introduce the next question
- Increase drama as values get higher
- Example: "Excellent work! You're now playing for $50,000. Let's see your next question..."

---

### 4. **FINAL_ANSWER_CONFIRM** - Answer Confirmation
Use when the player locks in their final answer.

```typescript
const currentQuestion = questions[currentQuestionIndex]
const selectedAnswer = currentQuestion.options[selectedAnswerIndex]

const hostResponse = await sendAction({
    actionType: 'FINAL_ANSWER_CONFIRM',
    action: `Player selected answer: ${selectedAnswer}. Final answer confirmed.`,
    currentQuestion,
    currentQuestionIndex,
    remainingTime,
    additionalData: {
        selectedAnswer
    }
})
```

**What the host will say:**
- React to the selection with suspense
- Build dramatic tension (more for higher money values)
- Finally reveal if correct or wrong
- Celebrate or commiserate appropriately
- Example: "You've selected B... For $100,000, let me see if that's right... And... that is CORRECT!"

---

### 5. **TIME_WARNING** - Running Out of Time
Use when you want the host to comment on time pressure (e.g., when timer is below 50%).

```typescript
const hostResponse = await sendAction({
    actionType: 'TIME_WARNING',
    action: 'Time is running low',
    currentQuestion,
    currentQuestionIndex,
    remainingTime
})
```

**What the host will say:**
- Brief, urgent comment about time
- Encourage quick decision
- Example: "Time is running out! Better make a decision soon!"

**Note:** Control frequency on the frontend to avoid spam.

---

### 6. **LIFELINE_5050** - 50-50 Lifeline
Use when player activates the 50-50 lifeline.

```typescript
// Calculate which 2 options remain (1 correct + 1 random wrong)
const correctAnswer = currentQuestion.correctAnswer
const wrongOptions = currentQuestion.options.filter(opt => opt !== correctAnswer)
const randomWrongOption = wrongOptions[Math.floor(Math.random() * wrongOptions.length)]
const remainingOptions = [correctAnswer, randomWrongOption]

const hostResponse = await sendAction({
    actionType: 'LIFELINE_5050',
    action: 'Player used 50-50 lifeline',
    currentQuestion,
    currentQuestionIndex,
    remainingTime,
    additionalData: {
        remainingOptions
    }
})
```

**What the host will say:**
- Acknowledge the lifeline usage
- Reveal which 2 options remain
- Example: "You've chosen 50-50! Let's remove two incorrect answers... That leaves you with A and C."

---

### 7. **LIFELINE_ASK_HOST** - Ask the Host Lifeline
Use when player asks the host for help.

```typescript
const hostResponse = await sendAction({
    actionType: 'LIFELINE_ASK_HOST',
    action: 'Player is asking the host for help',
    currentQuestion,
    currentQuestionIndex,
    remainingTime
})
```

**What the host will say:**
- Give a helpful hint
- Narrow down options without giving away the answer
- Be supportive but maintain challenge
- Example: "Alright, let me help you out... I can tell you it's definitely not A... And think about what makes sense historically."

---

## Integration Example

Here's a complete example showing how to integrate the host communication at different game stages:

```typescript
export default function SinglePlayer() {
    const { sendAction } = useHostCommunication({ conversationHistory, setConversationHistory })

    // 1. Welcome the player at game start
    async function welcomePlayer() {
        const hostResponse = await sendAction({
            actionType: 'WELCOME',
            action: 'Player has entered the game',
            currentQuestionIndex: 0
        })

        if (hostResponse) {
            const segments = hostResponse.split('|||').map(s => s.trim())
            displayHostMessageSegments(segments, () => showFirstQuestion())
        }
    }

    // 2. Show the first question
    async function showFirstQuestion() {
        const hostResponse = await sendAction({
            actionType: 'BEGIN_QUESTION',
            action: 'Presenting the first question',
            currentQuestion: questions[0],
            currentQuestionIndex: 0,
            remainingTime: 30
        })

        if (hostResponse) {
            const segments = hostResponse.split('|||').map(s => s.trim())
            displayHostMessageSegments(segments, () => startTimer())
        }
    }

    // 3. Confirm final answer
    async function confirmFinalAnswer() {
        const currentQuestion = questions[currentQuestionIndex]
        const selectedAnswer = currentQuestion.options[selectedAnswerIndex]

        const hostResponse = await sendAction({
            actionType: 'FINAL_ANSWER_CONFIRM',
            action: `Player selected: ${selectedAnswer}`,
            currentQuestion,
            currentQuestionIndex,
            remainingTime,
            additionalData: { selectedAnswer }
        })

        if (hostResponse) {
            const segments = hostResponse.split('|||').map(s => s.trim())
            displayHostMessageSegments(segments, () => {
                const isCorrect = selectedAnswer === currentQuestion.correctAnswer
                if (isCorrect) {
                    moveToNextQuestion()
                } else {
                    endGame()
                }
            })
        }
    }

    // 4. Move to next question after correct answer
    async function moveToNextQuestion() {
        setCurrentQuestionIndex(prev => prev + 1)
        const nextIndex = currentQuestionIndex + 1

        const hostResponse = await sendAction({
            actionType: 'NEXT_QUESTION',
            action: 'Moving to next question',
            currentQuestion: questions[nextIndex],
            currentQuestionIndex: nextIndex,
            remainingTime: 30
        })

        if (hostResponse) {
            const segments = hostResponse.split('|||').map(s => s.trim())
            displayHostMessageSegments(segments, () => startTimer())
        }
    }

    // 5. Time warning (optional, controlled by frontend)
    useEffect(() => {
        if (remainingTime !== null && remainingTime <= totalTime / 2 && !hasShownTimeWarning) {
            showTimeWarning()
            setHasShownTimeWarning(true)
        }
    }, [remainingTime])

    async function showTimeWarning() {
        const hostResponse = await sendAction({
            actionType: 'TIME_WARNING',
            action: 'Time running low',
            currentQuestion: questions[currentQuestionIndex],
            currentQuestionIndex,
            remainingTime
        })

        if (hostResponse) {
            const segments = hostResponse.split('|||').map(s => s.trim())
            displayHostMessageSegments(segments)
        }
    }
}
```

## Tips

1. **Segment Display**: All host responses use `|||` as delimiters. Split and display them with timing:
   ```typescript
   const segments = hostResponse.split('|||').map(s => s.trim())
   displayHostMessageSegments(segments, onComplete)
   ```

2. **Time Warning Frequency**: Control how often TIME_WARNING is sent from the frontend to avoid spam. Suggestion: only when timer crosses 50% threshold.

3. **Error Handling**: Always check if `hostResponse` exists before processing. Skip host talk gracefully if API fails.

4. **Conversation History**: The hook automatically maintains conversation history. This helps the AI maintain context across the game.

5. **Money Values**: Money values are automatically calculated from `currentQuestionIndex` based on the standard ladder: [500, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000, 100000, 250000, 500000, 1000000]

## Backend Structure

The backend now has scene-specific prompts defined in `server/api.js`:

```javascript
const SCENE_PROMPTS = {
    WELCOME: (moneyValue) => `...`,
    BEGIN_QUESTION: (currentSetting) => `...`,
    NEXT_QUESTION: (currentSetting) => `...`,
    FINAL_ANSWER_CONFIRM: (currentSetting, selectedAnswer, isCorrect) => `...`,
    TIME_WARNING: (currentSetting) => `...`,
    LIFELINE_5050: (currentSetting, remainingOptions) => `...`,
    LIFELINE_ASK_HOST: (currentSetting) => `...`,
}
```

Each prompt is tailored to create the right tone and content for that specific game moment.