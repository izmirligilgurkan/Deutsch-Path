/**
 * Deterministic exercise generators.
 *
 * Every generator is a pure function of sourced data: a Wiktionary form table
 * or a Tatoeba sentence. None of them writes German. A generator that cannot
 * build a correct item from the data returns nothing rather than improvising,
 * and each item it does produce records the generator's id so any exercise can
 * be traced back to the rule and the record that produced it.
 */
import type { Exercise, Form, Lemma, Sentence } from '../../src/lib/content-types.ts';
import { formKey, tokenize } from '../../src/lib/tokenize.ts';
import { mulberry32, pick, seedFrom, shuffled } from './random.ts';
import { shortGloss } from '../../src/lib/gloss.ts';

export interface GenContext {
  unit: number;
  topic: string;
  /** Lemmas taught in this unit. */
  lemmas: Lemma[];
  /** All lemmas at or below this unit's level, for plausible distractors. */
  pool: Lemma[];
  /** Level-appropriate sentences. */
  sentences: Sentence[];
}

const ARTICLE_FORMS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines',
]);

/**
 * After a two-way preposition both the accusative and the dative are
 * grammatical ("in das Haus" / "in dem Haus"), so a swapped article there is
 * not reliably an error. Sentences like these are excluded from the
 * error-spotting and article drills.
 */
const TWO_WAY_PREPOSITIONS = new Set([
  'in', 'an', 'auf', 'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen',
]);

function id(parts: (string | number)[]): string {
  return parts.join(':');
}

function hasTags(form: Form, ...tags: string[]): boolean {
  return tags.every((t) => form.tags.includes(t));
}

/**
 * Finds a form by tags, preferring the main-clause variant.
 *
 * Wiktionary lists a separable verb twice: "komme aus" for a main clause and
 * "auskomme" tagged `subordinate-clause`. Taking whichever came first would
 * label the subordinate form as the plain present tense.
 */
function findForm(lemma: Lemma, ...tags: string[]): string | undefined {
  const matches = lemma.forms.filter((f) => hasTags(f, ...tags));
  const mainClause = matches.find((f) => !f.tags.includes('subordinate-clause'));
  return (mainClause ?? matches[0])?.form;
}

/** `die Brücke` — the article is required when producing a noun (spec §4.3). */
export function withArticle(lemma: Lemma): string {
  if (lemma.pos !== 'noun') return lemma.lemma;
  if (lemma.pluralOnly) return `die ${lemma.lemma}`;
  const article = lemma.gender === 'm' ? 'der' : lemma.gender === 'f' ? 'die' : 'das';
  return `${article} ${lemma.lemma}`;
}

// ── Vocabulary ─────────────────────────────────────────────────────────────

export function genGender(ctx: GenContext): Exercise[] {
  return ctx.lemmas
    .filter((l) => l.pos === 'noun' && l.gender && !l.pluralOnly)
    .map((l) => ({
      id: id(['u', ctx.unit, 'gender', l.id]),
      unit: ctx.unit,
      topic: 'noun-gender',
      type: 'gender' as const,
      prompt: l.lemma,
      answer: l.gender === 'm' ? 'der' : l.gender === 'f' ? 'die' : 'das',
      distractors: ['der', 'die', 'das'].filter(
        (a) => a !== (l.gender === 'm' ? 'der' : l.gender === 'f' ? 'die' : 'das'),
      ),
      refs: { lemmaIds: [l.id] },
      generator: 'gender-from-wiktionary-sense-tags',
    }));
}

export function genPlural(ctx: GenContext): Exercise[] {
  return ctx.lemmas
    .filter((l) => l.pos === 'noun' && l.plural)
    .map((l) => ({
      id: id(['u', ctx.unit, 'plural', l.id]),
      unit: ctx.unit,
      topic: 'plural-patterns',
      type: 'plural' as const,
      prompt: withArticle(l),
      answer: l.plural!,
      refs: { lemmaIds: [l.id] },
      generator: 'plural-from-wiktionary-head-forms',
    }));
}

export function genPrincipalParts(ctx: GenContext): Exercise[] {
  return ctx.lemmas
    .filter((l) => l.pos === 'verb' && l.principalParts?.partizip2 && l.principalParts.auxiliary)
    .map((l) => {
      const p = l.principalParts!;
      // "hat gemacht" / "ist gegangen" — the auxiliary is part of the answer.
      const aux = p.auxiliary === 'sein' ? 'ist' : 'hat';
      return {
        id: id(['u', ctx.unit, 'pp', l.id]),
        unit: ctx.unit,
        topic: ctx.topic,
        type: 'principal-parts' as const,
        prompt: l.lemma,
        answer: [p.thirdSg ?? '', p.praeteritum ?? '', `${aux} ${p.partizip2!}`].filter(Boolean),
        refs: { lemmaIds: [l.id] },
        generator: 'principal-parts-from-wiktionary-head-forms',
      };
    });
}

export function genVocabMc(ctx: GenContext): Exercise[] {
  const out: Exercise[] = [];
  for (const l of ctx.lemmas) {
    const full = l.glosses[0];
    if (!full) continue;
    // The card shows the head of the sense, not the whole Wiktionary entry:
    // four paragraph-length options are a reading test, not a vocabulary one.
    const gloss = shortGloss(full);
    // Distractors are glosses of other words of the same part of speech, so
    // the choice tests the word rather than the grammar. Shortening can make
    // two senses read alike, and an option that is also correct is worse than
    // no question, so matching ones are skipped.
    const rng = mulberry32(seedFrom(`mc:${l.id}`));
    const others = ctx.pool.filter(
      (o) => o.pos === l.pos && o.id !== l.id && o.glosses[0] && shortGloss(o.glosses[0]) !== gloss,
    );
    const distractors = pick(others, 3, rng).map((o) => shortGloss(o.glosses[0]!));
    if (new Set([gloss, ...distractors]).size < 4) continue;

    out.push({
      id: id(['u', ctx.unit, 'mc', l.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'mc-de-en',
      prompt: withArticle(l),
      answer: gloss,
      distractors,
      refs: { lemmaIds: [l.id] },
      generator: 'mc-de-en-from-wiktionary-glosses',
    });
  }
  return out;
}

export function genVocabTyped(ctx: GenContext): Exercise[] {
  return ctx.lemmas
    .filter((l) => l.glosses[0])
    .map((l) => ({
      id: id(['u', ctx.unit, 'type', l.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'type-en-de' as const,
      prompt: shortGloss(l.glosses[0]!),
      // A noun is only right with its article.
      answer: withArticle(l),
      refs: { lemmaIds: [l.id] },
      generator: 'type-en-de-from-wiktionary-glosses',
    }));
}

// ── Sentence-based drills ──────────────────────────────────────────────────

/** Sentences that use one of this unit's lemmas, newest ids last for stability. */
function sentencesForUnit(ctx: GenContext, limit: number): Sentence[] {
  const wanted = new Set(ctx.lemmas.map((l) => l.id));
  return ctx.sentences.filter((s) => s.lemmas.some((l) => wanted.has(l))).slice(0, limit);
}

export function genCloze(ctx: GenContext, limit = 12): Exercise[] {
  const out: Exercise[] = [];
  const wanted = new Map(ctx.lemmas.map((l) => [l.id, l]));

  for (const s of sentencesForUnit(ctx, limit * 3)) {
    if (out.length >= limit) break;
    const tokens = tokenize(s.de);
    // Blank a token belonging to one of this unit's lemmas. The answer is the
    // token exactly as the sentence writes it — never a computed form.
    const target = tokens.find((t) => {
      if (t.start === 0) return false; // keep the sentence-initial capital intact
      return [...wanted.keys()].some((lemmaId) => {
        const lemma = wanted.get(lemmaId)!;
        return (
          formKey(lemma.lemma) === formKey(t.text) ||
          lemma.forms.some((f) => formKey(f.form) === formKey(t.text))
        );
      });
    });
    if (!target) continue;

    const lemma = [...wanted.values()].find(
      (l) =>
        formKey(l.lemma) === formKey(target.text) ||
        l.forms.some((f) => formKey(f.form) === formKey(target.text)),
    );
    if (!lemma) continue;

    out.push({
      id: id(['u', ctx.unit, 'cloze', s.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'cloze',
      prompt: `${s.de.slice(0, target.start)}____${s.de.slice(target.end)}`,
      answer: target.text,
      refs: { lemmaIds: [lemma.id], sentenceId: s.id },
      generator: 'cloze-blank-unit-lemma-in-tatoeba-sentence',
    });
  }
  return out;
}

export function genWordOrder(ctx: GenContext, limit = 8): Exercise[] {
  const out: Exercise[] = [];
  for (const s of sentencesForUnit(ctx, limit * 4)) {
    if (out.length >= limit) break;
    const tokens = tokenize(s.de).map((t) => t.text);
    // Too few tokens is not a puzzle; too many does not fit a phone screen.
    if (tokens.length < 4 || tokens.length > 10) continue;

    const rng = mulberry32(seedFrom(`order:${s.id}`));
    const scrambled = shuffled(tokens, rng);
    if (scrambled.join(' ') === tokens.join(' ')) continue;

    out.push({
      id: id(['u', ctx.unit, 'order', s.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'word-order',
      prompt: scrambled.join(' '),
      answer: tokens,
      refs: { sentenceId: s.id },
      generator: 'word-order-shuffle-tatoeba-sentence',
    });
  }
  return out;
}

export function genArticleCase(ctx: GenContext, limit = 10): Exercise[] {
  const out: Exercise[] = [];
  for (const s of sentencesForUnit(ctx, limit * 5)) {
    if (out.length >= limit) break;
    const tokens = tokenize(s.de);

    const index = tokens.findIndex((t, i) => {
      if (!ARTICLE_FORMS.has(formKey(t.text))) return false;
      const prev = tokens[i - 1];
      // Skip two-way prepositions: both cases would be correct there.
      return !(prev && TWO_WAY_PREPOSITIONS.has(formKey(prev.text)));
    });
    if (index === -1) continue;
    const target = tokens[index]!;

    out.push({
      id: id(['u', ctx.unit, 'article', s.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'article-case',
      prompt: `${s.de.slice(0, target.start)}____${s.de.slice(target.end)}`,
      answer: target.text,
      distractors: [...ARTICLE_FORMS]
        .filter((a) => a !== formKey(target.text) && a[0] === formKey(target.text)[0])
        .slice(0, 3),
      refs: { sentenceId: s.id },
      generator: 'article-case-blank-from-tatoeba-sentence',
    });
  }
  return out;
}

/**
 * Error spotting, by one documented rule: replace a definite or indefinite
 * article with a different form of the same paradigm. The rule is recorded on
 * the item so a wrong item can be traced to it.
 */
export function genErrorSpotting(ctx: GenContext, limit = 6): Exercise[] {
  const out: Exercise[] = [];
  const DEFINITE = ['der', 'die', 'das', 'den', 'dem', 'des'];
  const INDEFINITE = ['ein', 'eine', 'einen', 'einem', 'einer', 'eines'];

  for (const s of sentencesForUnit(ctx, limit * 6)) {
    if (out.length >= limit) break;
    const tokens = tokenize(s.de);

    const index = tokens.findIndex((t, i) => {
      const key = formKey(t.text);
      if (!ARTICLE_FORMS.has(key)) return false;
      const prev = tokens[i - 1];
      return !(prev && TWO_WAY_PREPOSITIONS.has(formKey(prev.text)));
    });
    if (index === -1) continue;
    const target = tokens[index]!;
    const key = formKey(target.text);

    const paradigm = DEFINITE.includes(key) ? DEFINITE : INDEFINITE.includes(key) ? INDEFINITE : null;
    if (!paradigm) continue;

    const rng = mulberry32(seedFrom(`err:${s.id}`));
    const replacement = pick(paradigm.filter((a) => a !== key), 1, rng)[0];
    if (!replacement) continue;

    // Preserve the sentence's capitalisation at that position.
    const wrong =
      target.text[0] === target.text[0]?.toUpperCase()
        ? replacement[0]!.toUpperCase() + replacement.slice(1)
        : replacement;

    out.push({
      id: id(['u', ctx.unit, 'error', s.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'error-spotting',
      prompt: `${s.de.slice(0, target.start)}${wrong}${s.de.slice(target.end)}`,
      answer: target.text,
      refs: { sentenceId: s.id },
      generator: 'error-spotting-rule:article-case-swap',
    });
  }
  return out;
}

// ── Paradigm tables ────────────────────────────────────────────────────────

const PRESENT_PERSONS: [string, string[]][] = [
  ['ich', ['first-person', 'singular', 'indicative', 'present']],
  ['du', ['second-person', 'singular', 'indicative', 'present']],
  ['er/sie/es', ['third-person', 'singular', 'indicative', 'present']],
  ['wir', ['first-person', 'plural', 'indicative', 'present']],
  ['ihr', ['second-person', 'plural', 'indicative', 'present']],
  ['sie/Sie', ['third-person', 'plural', 'indicative', 'present']],
];

export function genConjugationTable(ctx: GenContext, limit = 6): Exercise[] {
  const out: Exercise[] = [];
  for (const l of ctx.lemmas.filter((v) => v.pos === 'verb')) {
    if (out.length >= limit) break;
    const cells = PRESENT_PERSONS.map(([, tags]) => findForm(l, ...tags));
    // Only build the table when Wiktionary gives every cell.
    if (cells.some((c) => !c)) continue;

    out.push({
      id: id(['u', ctx.unit, 'conj', l.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'conjugation-table',
      prompt: `${l.lemma} — Präsens: ${PRESENT_PERSONS.map(([p]) => p).join(', ')}`,
      answer: cells as string[],
      refs: { lemmaIds: [l.id] },
      generator: 'conjugation-table-present-from-wiktionary',
    });
  }
  return out;
}

const NOUN_CASES: [string, string[]][] = [
  ['Nominativ Singular', ['nominative', 'singular']],
  ['Genitiv Singular', ['genitive', 'singular']],
  ['Dativ Singular', ['dative', 'singular']],
  ['Akkusativ Singular', ['accusative', 'singular']],
];

export function genDeclensionTable(ctx: GenContext, limit = 6): Exercise[] {
  const out: Exercise[] = [];
  for (const l of ctx.lemmas.filter((n) => n.pos === 'noun' && !n.pluralOnly)) {
    if (out.length >= limit) break;
    const cells = NOUN_CASES.map(([, tags]) => findForm(l, ...tags));
    if (cells.some((c) => !c)) continue;

    out.push({
      id: id(['u', ctx.unit, 'decl', l.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'declension-table',
      prompt: `${withArticle(l)} — ${NOUN_CASES.map(([c]) => c).join(', ')}`,
      answer: cells as string[],
      refs: { lemmaIds: [l.id] },
      generator: 'declension-table-singular-from-wiktionary',
    });
  }
  return out;
}

/** Multiple choice over one paradigm: other case forms of the same word. */
export function genChooseForm(ctx: GenContext, limit = 8): Exercise[] {
  const out: Exercise[] = [];
  for (const l of ctx.lemmas.filter((n) => n.pos === 'noun' && !n.pluralOnly)) {
    if (out.length >= limit) break;
    const dative = findForm(l, 'dative', 'singular');
    const accusative = findForm(l, 'accusative', 'singular');
    const genitive = findForm(l, 'genitive', 'singular');
    if (!dative || !accusative || !genitive) continue;
    const options = [...new Set([dative, accusative, genitive])];
    // Two options where the dative and accusative coincide is not a choice
    // worth presenting.
    if (options.length < 3) continue;

    out.push({
      id: id(['u', ctx.unit, 'choose', l.id]),
      unit: ctx.unit,
      topic: ctx.topic,
      type: 'choose-form',
      prompt: `${l.lemma} — Genitiv Singular`,
      answer: genitive,
      distractors: options.filter((o) => o !== genitive),
      refs: { lemmaIds: [l.id] },
      generator: 'choose-form-same-paradigm-from-wiktionary',
    });
  }
  return out;
}
