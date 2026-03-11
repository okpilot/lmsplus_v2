# FSRS Patterns — LMS Plus v2

## Library
`ts-fsrs` — TypeScript FSRS-5 implementation.

## Core types
```typescript
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs'

const params = generatorParameters({ enable_fuzz: true })
const f = fsrs(params)
```

## New card (first time seeing a question)
```typescript
const card = createEmptyCard()
```

## Schedule review after answer
```typescript
const now = new Date()
const scheduling = f.repeat(card, now)

// Student rated the answer:
const result = scheduling[Rating.Good] // or Easy, Hard, Again
const nextCard = result.card
// nextCard.due — when to show again
// nextCard.stability, nextCard.difficulty — updated values
```

## Rating mapping
- Student answered correctly + easy → `Rating.Easy` or `Rating.Good`
- Student answered correctly + hard → `Rating.Hard`
- Student answered incorrectly → `Rating.Again`

## DB update after review
```typescript
// upsert to fsrs_cards table
await supabase.from('fsrs_cards').upsert({
  student_id: userId,
  question_id: questionId,
  due: nextCard.due.toISOString(),
  stability: nextCard.stability,
  difficulty: nextCard.difficulty,
  elapsed_days: nextCard.elapsed_days,
  scheduled_days: nextCard.scheduled_days,
  reps: nextCard.reps,
  lapses: nextCard.lapses,
  state: nextCard.state,
  last_review: now.toISOString(),
}, { onConflict: 'student_id,question_id' })
```

## Due queue query
```sql
SELECT * FROM fsrs_cards
WHERE student_id = auth.uid()
  AND due <= now()
ORDER BY due ASC
LIMIT 20;
```
