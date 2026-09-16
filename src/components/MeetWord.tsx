import type { Lemma, Sentence } from '~/lib/content-types.ts';
import { markOccurrence, principalPartsOf } from '~/lib/meet-cards.ts';
import { splitGloss } from '~/lib/gloss.ts';

/**
 * A word's first appearance: shown, with nothing to answer.
 *
 * Everything on it is sourced — the article comes from the noun's gender, the
 * principal parts from the verb's head line, the meaning from the gloss and
 * the example from Tatoeba. The card writes none of it.
 */

export function MeetWord({
  word,
  meaning,
  lemma,
  example,
  onContinue,
}: {
  /** The word as it is taught: "das Buch", "aufstehen". */
  word: string;
  meaning: string;
  lemma?: Lemma;
  example?: Sentence;
  onContinue: () => void;
}) {
  const { head, qualifier } = splitGloss(meaning);
  const parts = lemma ? principalPartsOf(lemma) : '';
  const marked =
    example && lemma ? markOccurrence(example.de, lemma, (lemma.forms ?? []).map((f) => f.form)) : null;

  return (
    <>
      <div class="card meet">
        <div class="prompt-label">New word</div>
        <div class="meet-word" lang="de">{word}</div>
        <div class="meet-meaning" lang="en">{head}</div>
        {qualifier ? <div class="prompt-qualifier">{qualifier}</div> : null}
        {parts ? <div class="meet-parts" lang="de">{parts}</div> : null}
      </div>

      {example ? (
        <div class="card meet-example">
          <p lang="de" class="meet-example-de">
            {marked ? (
              <>
                {marked[0]}
                <strong>{marked[1]}</strong>
                {marked[2]}
              </>
            ) : (
              example.de
            )}
          </p>
          <p lang="en" class="meet-example-en">{example.en}</p>
        </div>
      ) : null}

      <button class="btn btn-primary btn-block" onClick={onContinue}>
        Got it
      </button>
    </>
  );
}
