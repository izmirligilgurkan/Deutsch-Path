/**
 * Umlaut keys above the phone keyboard (spec §4.6).
 *
 * Phone keyboards hide ä/ö/ü/ß behind a long-press, which is slow and easy to
 * miss. These insert at the caret and keep focus in the field, so typing is
 * not interrupted.
 */
const KEYS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'] as const;

export function UmlautRow({ target }: { target: { current: HTMLInputElement | null } }) {
  function insert(char: string) {
    const input = target.current;
    if (!input) return;

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + char + input.value.slice(end);
    // Put the caret after the inserted character, not at the end of the field.
    input.setSelectionRange(start + char.length, start + char.length);
    // Preact listens for input events; setting .value alone does not fire one.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  return (
    <div class="umlaut-row" role="group" aria-label="German characters">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          class="umlaut-key"
          // Keeps the keyboard open: mousedown would blur the field first.
          onMouseDown={(e) => { e.preventDefault(); }}
          onClick={() => { insert(key); }}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
