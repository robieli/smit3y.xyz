const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
const STEP_MS = 40;
const MAX_ITERATIONS = 6;

const randomChar = () => CHARSET[Math.floor(Math.random() * CHARSET.length)];

/** Sets each letter to a random character (in place — no reflow), for a
 * pre-jumbled resting state (e.g. before the first decode). Whitespace
 * letters are left alone so word gaps don't fill in with junk. */
export function jumbleLetters(letters: HTMLElement[]) {
  for (const letterEl of letters) {
    const final = letterEl.dataset.char ?? "";
    if (!final.trim()) continue;
    letterEl.textContent = randomChar();
  }
}

/** Wraps an element's text into per-letter spans, returning them in order. */
export function wrapLetters(el: HTMLElement): HTMLElement[] {
  const text = el.textContent ?? "";
  el.textContent = "";

  const wrapper = document.createElement("span");
  wrapper.setAttribute("aria-hidden", "true");

  const letters: HTMLElement[] = [];
  for (const ch of text) {
    const span = document.createElement("span");
    span.className = "scramble-letter";
    span.dataset.char = ch;
    span.textContent = ch;
    wrapper.appendChild(span);
    letters.push(span);
  }

  el.appendChild(wrapper);
  return letters;
}

/** Runs the scramble/decode sequence across `letters` once, immediately,
 * on a single requestAnimationFrame loop (each letter's stagger/iteration
 * derived from elapsed time, not its own timer). A pile of independent
 * setTimeout/setInterval chains — one clock per letter, per iteration —
 * drifts under any main-thread load (e.g. the hero canvas's own
 * requestAnimationFrame loop competing for frame time right at page
 * load) and reads as stutter. One rAF loop stays frame-synced with
 * everything else instead of fighting it. `onComplete` (if given) fires
 * once, after the full sequence settles. */
export function decodeLetters(letters: HTMLElement[], onComplete?: () => void) {
  const startTime = performance.now();
  const totalDuration = letters.length * STEP_MS + MAX_ITERATIONS * STEP_MS + 80;
  const lastIteration = new Array(letters.length).fill(-1);

  const frame = (now: number) => {
    const elapsed = now - startTime;

    for (let idx = 0; idx < letters.length; idx += 1) {
      const letterEl = letters[idx];
      const final = letterEl.dataset.char ?? "";
      if (!final.trim()) continue;

      const localElapsed = elapsed - idx * STEP_MS;
      if (localElapsed < 0) continue;

      const iteration = Math.min(MAX_ITERATIONS, Math.floor(localElapsed / STEP_MS));
      if (iteration === lastIteration[idx]) continue;
      lastIteration[idx] = iteration;
      letterEl.textContent = iteration >= MAX_ITERATIONS ? final : randomChar();
    }

    if (elapsed < totalDuration) {
      requestAnimationFrame(frame);
    } else {
      for (const letterEl of letters) {
        const final = letterEl.dataset.char ?? "";
        if (final.trim()) letterEl.textContent = final;
      }
      onComplete?.();
    }
  };

  requestAnimationFrame(frame);
}

/** Wires up a hover-triggered scramble/decode animation across `letters`.
 * `onComplete` (if given) fires once, after the full sequence settles. */
export function scrambleOnHover(
  trigger: HTMLElement,
  letters: HTMLElement[],
  onComplete?: () => void,
) {
  let scrambling = false;

  trigger.addEventListener("mouseenter", () => {
    if (scrambling) return;
    scrambling = true;
    decodeLetters(letters, () => {
      scrambling = false;
      onComplete?.();
    });
  });
}
