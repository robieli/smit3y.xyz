import { useRef, useEffect } from "react";

type RGB = { r: number; g: number; b: number };

type Cell = {
  char: string;
  rgb: RGB;
  targetRgb: RGB;
  colorProgress: number;
};

interface Props {
  className?: string;
  characters?: string;
  fallSpeed?: number;
  glitchSpeed?: number;
}

const DEFAULT_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789";
const DEFAULT_COLORS = ["#8791ff", "#5ea1f2", "#17bfd1"];
const FALLBACK_RGB: RGB = { r: 255, g: 255, b: 255 };

const FONT_SIZE = 13;
const CHAR_WIDTH = 9;
const CHAR_HEIGHT = 17;

const readThemeColors = (): string[] => {
  if (typeof window === "undefined") return DEFAULT_COLORS;
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => {
    const v = style.getPropertyValue(name).trim();
    return v || fallback;
  };
  return [pick("--g1", DEFAULT_COLORS[0]), pick("--g2", DEFAULT_COLORS[1]), pick("--g3", DEFAULT_COLORS[2])];
};

const hexToRgb = (hex: string): RGB | null => {
  if (!hex) return null;
  if (hex.startsWith("rgb")) {
    const m = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
  }
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const h = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const interpolateRgb = (start: RGB, end: RGB, factor: number): RGB => ({
  r: Math.round(start.r + (end.r - start.r) * factor),
  g: Math.round(start.g + (end.g - start.g) * factor),
  b: Math.round(start.b + (end.b - start.b) * factor),
});

/**
 * A narrow-column sibling to LetterGlitchWaves: same charset, same
 * theme-color palette and smooth color-interpolation glitch, but the grid
 * continuously scrolls downward (a true "falling" waterfall) instead of
 * being swept by static wave bands — the wave-band math doesn't read as
 * anything in a strip only a few characters wide.
 */
const GlyphRain = ({
  className = "",
  characters = DEFAULT_CHARACTERS,
  fallSpeed = 22,
  glitchSpeed = 90,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const cells = useRef<Cell[]>([]);
  const grid = useRef({ columns: 0, rows: 0 });
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const lastGlitchTime = useRef(0);
  const lastFrameTime = useRef(0);
  const fallOffsetRef = useRef(0);
  const colorsRef = useRef<string[]>(DEFAULT_COLORS);
  const visibleRef = useRef(true);

  const chars = Array.from(characters);
  const getRandomChar = () => chars[Math.floor(Math.random() * chars.length)];
  const pickRandomRgb = (): RGB => {
    const pool = colorsRef.current;
    const hex = pool[Math.floor(Math.random() * pool.length)];
    return hexToRgb(hex) ?? FALLBACK_RGB;
  };

  const initCells = (columns: number, rows: number) => {
    // One extra row so freshly-scrolled-in content is already populated.
    const total = columns * (rows + 1);
    grid.current = { columns, rows };
    cells.current = Array.from({ length: total }, () => ({
      char: getRandomChar(),
      rgb: pickRandomRgb(),
      targetRgb: pickRandomRgb(),
      colorProgress: 1,
    }));
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    if (context.current) context.current.setTransform(dpr, 0, 0, dpr, 0, 0);

    const columns = Math.max(1, Math.floor(rect.width / CHAR_WIDTH));
    const rows = Math.ceil(rect.height / CHAR_HEIGHT);
    initCells(columns, rows);
  };

  const rollGrid = () => {
    // Shift every row down one and regenerate the top row, so the newly
    // revealed row (about to scroll into view) has fresh content.
    const { columns, rows } = grid.current;
    const items = cells.current;
    for (let row = rows; row > 0; row -= 1) {
      for (let col = 0; col < columns; col += 1) {
        items[row * columns + col] = items[(row - 1) * columns + col];
      }
    }
    for (let col = 0; col < columns; col += 1) {
      items[col] = {
        char: getRandomChar(),
        rgb: pickRandomRgb(),
        targetRgb: pickRandomRgb(),
        colorProgress: 1,
      };
    }
  };

  const mutateRandomCells = () => {
    const items = cells.current;
    if (items.length === 0) return;
    const count = Math.max(1, Math.floor(items.length * 0.008));
    for (let i = 0; i < count; i += 1) {
      const idx = Math.floor(Math.random() * items.length);
      const cell = items[idx];
      cell.char = getRandomChar();
      cell.targetRgb = pickRandomRgb();
      cell.colorProgress = 0;
    }
  };

  const handleSmoothTransitions = () => {
    for (const cell of cells.current) {
      if (cell.colorProgress >= 1) continue;
      cell.colorProgress = Math.min(1, cell.colorProgress + 0.06);
      cell.rgb =
        cell.colorProgress >= 1
          ? cell.targetRgb
          : interpolateRgb(cell.rgb, cell.targetRgb, cell.colorProgress);
    }
  };

  const draw = () => {
    const ctx = context.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    const { columns, rows } = grid.current;
    const items = cells.current;
    const offset = fallOffsetRef.current;

    for (let row = 0; row <= rows; row += 1) {
      const y = row * CHAR_HEIGHT + offset - CHAR_HEIGHT;
      if (y < -CHAR_HEIGHT || y > height) continue;
      for (let col = 0; col < columns; col += 1) {
        const cell = items[row * columns + col];
        if (!cell) continue;
        const x = col * CHAR_WIDTH + CHAR_WIDTH / 2;
        const c = cell.rgb;
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.fillText(cell.char, x, y);
      }
    }
  };

  const animate = () => {
    if (!visibleRef.current) {
      animationRef.current = null;
      return;
    }

    const now = performance.now();
    const dt = lastFrameTime.current > 0 ? (now - lastFrameTime.current) / 1000 : 0;
    lastFrameTime.current = now;

    fallOffsetRef.current += fallSpeed * dt;
    if (fallOffsetRef.current >= CHAR_HEIGHT) {
      fallOffsetRef.current -= CHAR_HEIGHT;
      rollGrid();
    }

    if (now - lastGlitchTime.current >= glitchSpeed) {
      mutateRandomCells();
      lastGlitchTime.current = now;
    }
    handleSmoothTransitions();

    draw();
    animationRef.current = requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    if (animationRef.current !== null) return;
    lastFrameTime.current = 0;
    lastGlitchTime.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    colorsRef.current = readThemeColors();
    const canvas = canvasRef.current;
    if (!canvas) return;
    context.current = canvas.getContext("2d");
    resizeCanvas();
    startAnimation();

    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (animationRef.current !== null) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        resizeCanvas();
        startAnimation();
      }, 120);
    };
    window.addEventListener("resize", handleResize);

    const root = document.documentElement;
    const themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (
          m.attributeName === "data-theme" ||
          m.attributeName === "data-palette" ||
          m.attributeName === "style"
        ) {
          colorsRef.current = readThemeColors();
          break;
        }
      }
    });
    themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette", "style"],
    });

    const intersection = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) startAnimation();
        else if (animationRef.current !== null) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      },
      { threshold: 0 },
    );
    intersection.observe(canvas);

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", handleResize);
      themeObserver.disconnect();
      intersection.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
};

export default GlyphRain;
