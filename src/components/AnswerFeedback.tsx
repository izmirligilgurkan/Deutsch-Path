import { diffChars } from '~/lib/answer-check.ts';
import type { CheckResult } from '~/lib/answer-check.ts';

/** Shows the diff between what was typed and what was expected (spec §4.6). */
export function AnswerDiff({ given, expected }: { given: string; expected: string }) {
  if (!given.trim()) return <span class="mono">{expected}</span>;
  return (
    <span class="mono diff">
      {diffChars(given, expected).map((op, i) => (
        <span key={i} class={`diff-${op.type}`}>{op.text}</span>
      ))}
    </span>
  );
}

export function Verdict({
  result,
  given,
  onTypo,
  showDiff = true,
}: {
  result: CheckResult;
  given: string;
  /** Practice only: the learner marks a near-miss as correct (spec §4.6). */
  onTypo?: () => void;
  /** A diff is only useful for a typed answer; for a tap choice it is noise. */
  showDiff?: boolean;
}) {
  if (result.correct) {
    return (
      <div class="verdict verdict-ok" role="status">
        <strong>Correct</strong>
        {result.verdict === 'correct-transliterated' ? (
          <span class="small muted"> — accepted with transliteration</span>
        ) : null}
      </div>
    );
  }

  return (
    <div class="verdict verdict-bad" role="status">
      <div>
        <strong>{result.caseOnly ? 'Capitalisation' : 'Not quite'}</strong>
        {result.caseOnly ? (
          <span class="small muted"> — German capitalises nouns</span>
        ) : null}
      </div>
      <div class="small" style="margin-top:6px">
        {showDiff ? (
          <AnswerDiff given={given} expected={result.expected} />
        ) : (
          <span class="mono" style="color:var(--ok)">{result.expected}</span>
        )}
      </div>
      {onTypo ? (
        <button class="small" style="margin-top:10px" onClick={onTypo}>
          I was right (typo)
        </button>
      ) : null}
    </div>
  );
}
