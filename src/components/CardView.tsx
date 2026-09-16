import { useEffect, useRef, useState } from 'preact/hooks';
import { checkAnswer, type CheckOptions, type CheckResult } from '~/lib/answer-check.ts';
import type { Question } from '~/srs/cards.ts';
import { splitGloss } from '~/lib/gloss.ts';
import { UmlautRow } from './UmlautRow.tsx';
import { Verdict } from './AnswerFeedback.tsx';
import { SentenceBreakdown } from './SentenceBreakdown.tsx';
import type { Sentence } from '~/lib/content-types.ts';

/**
 * Renders one question and collects the answer.
 *
 * Multiple choice and gender answer on tap; everything else is typed, with the
 * umlaut row attached. The card never grades itself — it reports the result and
 * the caller decides what that means for scheduling.
 */
/** A choice is a gloss too: definition first, qualifier smaller beneath. */
function ChoiceText({ text }: { text: string }) {
  const { head, qualifier } = splitGloss(text);
  return (
    <span>
      {head}
      {qualifier ? <span class="choice-qualifier">{qualifier}</span> : null}
    </span>
  );
}

export function CardView({
  question,
  options,
  sentence,
  onAnswered,
  onContinue,
}: {
  question: Question;
  options: CheckOptions;
  /** The sentence this question came from, if it came from one. */
  sentence?: Sentence;
  /** `correct` drives scheduling; `given` is kept for the mistake log. */
  onAnswered: (correct: boolean, given: string) => void;
  onContinue: () => void;
}) {
  const [given, setGiven] = useState('');
  const [fields, setFields] = useState<string[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [fieldResults, setFieldResults] = useState<CheckResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // Depend on the question's *content*, not its object identity: callers build
  // the question during render, so a fresh object arrives on every keystroke
  // and an identity-keyed effect would clear the field as it is being typed.
  const questionKey = `${question.cardType}|${question.prompt}`;

  // A new question resets everything and returns focus to the input.
  useEffect(() => {
    setGiven('');
    setFields([]);
    setResult(null);
    setFieldResults(null);
    const hasFields = Boolean(question.fields);
    const t = setTimeout(() => (hasFields ? firstFieldRef : inputRef).current?.focus(), 30);
    return () => { clearTimeout(t); };
  }, [questionKey]);

  const answered = result !== null || fieldResults !== null;
  const isChoice = Boolean(question.choices);
  const isGender = question.cardType === 'gender';

  function submitTyped() {
    if (answered) return;
    const r = checkAnswer(given, question.answers, options);
    setResult(r);
    onAnswered(r.correct, given);
  }

  function submitFields() {
    if (answered || !question.fields) return;
    // Each box is checked against all its accepted spellings, so a verb with
    // either auxiliary ("hat/ist gegangen") accepts both.
    const perField = question.fields.map((f, i) => checkAnswer(fields[i] ?? '', f.answers, options));
    const allCorrect = perField.every((r) => r.correct);

    setFieldResults(perField);
    setResult({
      verdict: allCorrect ? 'correct' : 'wrong',
      correct: allCorrect,
      expected: question.fields.map((f) => f.answers[0]).join(' · '),
      caseOnly: false,
    });
    onAnswered(allCorrect, fields.join(' · '));
  }

  function choose(choice: string) {
    if (answered) return;
    const r = checkAnswer(choice, question.answers, { ...options, caseSensitive: false });
    setGiven(choice);
    setResult(r);
    onAnswered(r.correct, choice);
  }

  return (
    <div>
      <div class="prompt-card">
        <div class="prompt-label">{question.label}</div>
        {/* An English prompt is a Wiktionary gloss: the definition leads, its
            usage notes follow in smaller text so they do not compete. */}
        {question.promptLang === 'en' ? (
          (() => {
            const { head, qualifier } = splitGloss(question.prompt);
            return (
              <>
                <div class="prompt-text en" lang="en">{head}</div>
                {qualifier ? <div class="prompt-qualifier">{qualifier}</div> : null}
              </>
            );
          })()
        ) : (
          <div class="prompt-text" lang="de">{question.prompt}</div>
        )}
        {question.hint && !answered ? (
          <div class="small muted" style="margin-top:8px">{question.hint}</div>
        ) : null}
      </div>

      {answered && result ? <Verdict
        result={result}
        given={given}
        showDiff={!isChoice}
        {...(options.mode === 'practice' && !result.correct && !isChoice
          ? { onTypo: () => { setResult({ ...result, correct: true, verdict: 'correct' }); onAnswered(true, given); } }
          : {})}
      /> : null}

      {/* Right or wrong, the sentence is only useful once you can read it. */}
      {answered && sentence ? <SentenceBreakdown sentence={sentence} /> : null}

      {isChoice ? (
        <div class={isGender ? 'gender-row' : ''}>
          {question.choices!.map((choice) => {
            const isCorrect = question.answers.some(
              (a) => a.toLocaleLowerCase('de-DE') === choice.toLocaleLowerCase('de-DE'),
            );
            const cls = !answered
              ? ''
              : isCorrect
                ? 'choice-correct'
                : choice === given
                  ? 'choice-wrong'
                  : '';
            return (
              <button
                key={choice}
                class={`${isGender ? '' : 'choice'} ${cls}`}
                disabled={answered}
                onClick={() => { choose(choice); }}
              >
                {isGender ? choice : <ChoiceText text={choice} />}
              </button>
            );
          })}
        </div>
      ) : question.fields ? (
        <div class="stack">
          {question.fields.map((field, i) => (
            <label key={field.label}>
              <span class="small muted">{field.label}</span>
              <input
                ref={i === 0 ? firstFieldRef : undefined}
                type="text" autocomplete="off" autocapitalize="off" spellcheck={false}
                lang="de" value={fields[i] ?? ''} disabled={answered}
                class={fieldResults ? (fieldResults[i]?.correct ? 'ok' : 'bad') : ''}
                onInput={(e) => {
                  const next = [...fields];
                  next[i] = (e.target as HTMLInputElement).value;
                  setFields(next);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') submitFields(); }}
              />
              {fieldResults && !fieldResults[i]?.correct ? (
                <span class="small mono" style="color:var(--ok)">{field.answers[0]}</span>
              ) : null}
            </label>
          ))}
          {!answered ? <UmlautRow target={firstFieldRef} /> : null}
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="text" autocomplete="off" autocapitalize="off" spellcheck={false}
            lang="de" value={given} disabled={answered}
            placeholder="Your answer"
            onInput={(e) => { setGiven((e.target as HTMLInputElement).value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submitTyped(); }}
          />
          {!answered ? <UmlautRow target={inputRef} /> : null}
        </div>
      )}

      <div style="margin-top:16px">
        {!answered ? (
          isChoice ? null : (
            <button
              class="primary btn-block"
              onClick={() => { question.fields ? submitFields() : submitTyped(); }}
            >
              Check
            </button>
          )
        ) : (
          <button class="primary btn-block" onClick={onContinue} autofocus>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
