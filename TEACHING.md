# How this app teaches

The app had a syllabus, sourced explanations and a scheduler, but no method:
it presented German rather than teaching it. This is the method it follows
now, what each principle means concretely, and which parts are still missing.

Every claim here is about *pedagogy*, which is a design decision. It is
separate from [the content rule](README.md#the-content-rule): the German
itself still comes from a sourced, human-authored origin, and nothing in this
document licenses writing German content by hand.

## The problem being solved

A learner read a whole A1 unit, started the drill, and could not answer. Three
causes, all real and all now fixed or in progress:

1. **The first thing asked was the hardest thing.** A unit dealt its items in
   random order, so "write this in German" for a word never seen could come
   first. No ramp existed at all.
2. **Some prompts were unanswerable.** Vocabulary cards took Wiktionary's first
   sense, which for `sein` is "forms the present perfect and past perfect
   tenses of certain verbs". The learner was asked to produce the German for
   that.
3. **Answering taught nothing.** A correct cloze moved straight to the next
   item. The sentence was never explained, so a learner could pass a card
   without understanding a word of it.

## The five principles

### 1. Worked examples before problems, with support faded

Sweller and Cooper (1985) and Renkl's later work on the *worked-example
effect*: novices learn more from studying a worked solution than from
attempting an equivalent problem, because a problem they lack the schema for
spends all their working memory on search rather than on learning. The effect
reverses as expertise grows — the *expertise-reversal effect* (Kalyuga et al.,
2003) — so support has to fade rather than stay.

**In the app:** a unit's practice is a ladder (`ladderOrder` in
`src/lib/test-builder.ts`), not a shuffle.

| Stage | What it asks | Card types |
|---|---|---|
| **Recognise** | Pick the meaning or the form out of four | `mc-de-en`, `gender`, `article-case`, `choose-form` |
| **Complete** | The sentence is in front of you; supply the missing part | `cloze`, `word-order`, `error-spotting` |
| **Produce** | Nothing to lean on; write the German | `type-en-de`, `plural`, `conjugation-table`, `principal-parts` |

A word is therefore always recognised before it has to be produced.

The unit is not three long blocks, though. Every card about one word lands in
the same cycle of about five words, so a unit reads as several short passes —
meet five words, use them in sentences, write them, then the next five — rather
than thirty-five multiple-choice cards followed by thirty of something else.

### 2. Retrieval practice, not review

Roediger and Karpicke (2006): being tested on material produces far better
retention than restudying it for the same time. The act of recalling is what
strengthens the memory, and this holds even when learners believe restudying
worked better.

**In the app:** every item is a retrieval attempt with an answer the learner
commits to, including the recognition stage. Reading a grammar explanation is
never counted as practice.

### 3. Spacing and interleaving

Cepeda et al. (2006) on distributed practice; Rohrer and Taylor (2007) on
interleaving. Spreading practice out beats massing it, and mixing item types
within a session beats doing one type at a time, even though blocked practice
*feels* more productive while you do it.

**In the app:** FSRS (`ts-fsrs`) schedules each card's next review from its own
difficulty and history. The ladder blocks only *between* stages — within a
stage the card types stay interleaved, so a run of twenty identical cards never
happens.

### 4. Elaborated feedback, not verification

Shute (2008) reviewing formative feedback: telling a learner *why* an answer is
what it is outperforms telling them whether they were right, and the gap is
largest for material the learner has not yet automatised.

**In the app:** answering a sentence item opens a word-by-word breakdown — the
translation, then each word with its dictionary form, its meaning, and the form
it is in ("1st or 3rd person singular Präteritum"). It is derived, not written:
meanings are Wiktionary glosses, and the grammatical labels are a plain-English
reading of the wiktextract tags on the matching row of the word's form table.
Where the data does not say, the app says nothing rather than guessing — an
ambiguous form shows every reading it has, up to three, and drops none of them
silently. 96% of the words in the corpus resolve; a name or a loanword that has
no entry is left blank.

Function words needed a fix of their own to get there. Wiktionary gives `der`
no declension table: *die*, *das*, *den*, *dem* and *des* are separate entries
saying which form of `der` they are, and the personal pronouns are built the
same way. Those entries are now merged into the lemma they point at, so the
commonest words in German have a paradigm at all. The article itself is a
*reference* lemma — in the lexicon to be read, never drilled, because "write
the German for *the*" has six right answers.

### 5. Comprehensible input: nothing should be a wall

Krashen's input hypothesis is contested in its strong form, but the weak claim
is not seriously disputed: material a learner cannot decode teaches nothing.

**In the app:** vocabulary is Goethe-list-ordered and units unlock in sequence,
so what a unit drills is what it has taught. Card prompts use the head of a
sense rather than Wiktionary's full entry (`shortGloss`), so an option is a
word, not a paragraph.

## What is still missing

Listed so the gaps are visible rather than implied.

- **A "meet the word" step.** The ladder starts at recognition, which is still
  a test. The worked-example research argues the first encounter should be a
  presentation — the word, its article, its meaning, one sentence — with
  nothing to answer. This does not exist yet.
- **Sentences are not gated by unit.** A unit's sentence items are drawn from
  any sentence using that unit's vocabulary, so a unit 1 cloze can be an
  idiomatic B1 sentence whose *words* happen to be A1.
- **No "why" in the breakdown.** It names the case a word is in but not what
  put it there. Preposition case government is a closed, sourceable set, so
  "dative, because *mit* takes the dative" is derivable — it is not derived yet.
- **One explanation serves several topics.** Twelve of the 42 sourced grammar
  topics excerpt the same Wikibooks page as another topic, because the map
  records a page but not a section.

## Sources

Pedagogy, not German content. Nothing from these is quoted in the app.

- Sweller, J. & Cooper, G. (1985). The use of worked examples as a substitute
  for problem solving. *Cognition and Instruction*, 2(1).
- Kalyuga, S., Ayres, P., Chandler, P. & Sweller, J. (2003). The expertise
  reversal effect. *Educational Psychologist*, 38(1).
- Roediger, H. L. & Karpicke, J. D. (2006). Test-enhanced learning.
  *Psychological Science*, 17(3).
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T. & Rohrer, D. (2006).
  Distributed practice in verbal recall tasks. *Psychological Bulletin*, 132(3).
- Rohrer, D. & Taylor, K. (2007). The shuffling of mathematics problems improves
  learning. *Instructional Science*, 35.
- Shute, V. J. (2008). Focus on formative feedback. *Review of Educational
  Research*, 78(1).
- Nation, I. S. P. (2013). *Learning Vocabulary in Another Language*, 2nd ed.
  Cambridge University Press — on recognition before recall, and on how many
  encounters a word needs.
