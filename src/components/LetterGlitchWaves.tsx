import { useRef, useEffect, useState } from "react";

type RGB = { r: number; g: number; b: number };

type Letter = {
  char: string;
  rgb: RGB;
  targetRgb: RGB;
  colorProgress: number;
};

interface Props {
  className?: string;
  glitchSpeed?: number;
  centerVignette?: boolean;
  outerVignette?: boolean;
  smooth?: boolean;
  characters?: string;
  waveCount?: number;
  waveSpeed?: number;
  waveBandThickness?: number;
  waveCurvature?: number;
  waveWavelength?: number;
  waveWobble?: boolean;
  waveAngleDeg?: number;
}

const DEFAULT_COLORS = ["#8791ff", "#5ea1f2", "#17bfd1"];
const FALLBACK_RGB: RGB = { r: 255, g: 255, b: 255 };

const readThemeColors = (): string[] => {
  if (typeof window === "undefined") return DEFAULT_COLORS;
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => {
    const v = style.getPropertyValue(name).trim();
    return v || fallback;
  };
  return [
    pick("--g1", DEFAULT_COLORS[0]),
    pick("--g2", DEFAULT_COLORS[1]),
    pick("--g3", DEFAULT_COLORS[2]),
  ];
};

const readBgGlitch = (): string => {
  if (typeof window === "undefined") return "#000000";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg-glitch")
    .trim();
  return v || "#000000";
};

const hexToRgb = (hex: string): RGB | null => {
  if (!hex) return null;
  if (hex.startsWith("rgb")) {
    const m = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return {
      r: parseInt(m[1], 10),
      g: parseInt(m[2], 10),
      b: parseInt(m[3], 10),
    };
  }
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  let h = hex.replace(shorthandRegex, (_m, r, g, b) => {
    return r + r + g + g + b + b;
  });
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

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const LetterGlitch = ({
  className = "",
  glitchSpeed = 50,
  centerVignette = false,
  outerVignette = false,
  smooth = true,
  characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789",
  waveCount = 2,
  waveSpeed = 0.06,
  waveBandThickness = 260,
  waveCurvature = 110,
  waveWavelength = 560,
  waveWobble = true,
  waveAngleDeg = 20,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const letters = useRef<Letter[]>([]);
  const grid = useRef({ columns: 0, rows: 0 });
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const lastGlitchTime = useRef(Date.now());
  const lastFrameTime = useRef(0);
  const waveOffsetRef = useRef(0);
  const wrapLengthRef = useRef(0);
  const perturbTableRef = useRef<Float32Array | null>(null);
  const uMinRef = useRef(0);
  const mountTimeRef = useRef(0);
  const visibleRef = useRef(true);
  const colorsRef = useRef<string[]>(DEFAULT_COLORS);
  const dirtyRef = useRef(true);
  const [bgColor, setBgColor] = useState("#000000");
  const [ready, setReady] = useState(false);

  const lettersAndSymbols = Array.from(characters);

  const fontSize = 16;
  const charWidth = 10;
  const charHeight = 20;

  const getRandomChar = () => {
    return lettersAndSymbols[
      Math.floor(Math.random() * lettersAndSymbols.length)
    ];
  };

  const pickRandomRgb = (): RGB => {
    const pool = colorsRef.current;
    const hex = pool[Math.floor(Math.random() * pool.length)];
    return hexToRgb(hex) ?? FALLBACK_RGB;
  };

  const calculateGrid = (width: number, height: number) => {
    const columns = Math.ceil(width / charWidth);
    const rows = Math.ceil(height / charHeight);
    return { columns, rows };
  };

  const initializeLetters = (columns: number, rows: number) => {
    grid.current = { columns, rows };
    const totalLetters = columns * rows;
    letters.current = Array.from({ length: totalLetters }, () => ({
      char: getRandomChar(),
      rgb: pickRandomRgb(),
      targetRgb: pickRandomRgb(),
      colorProgress: 1,
    }));
    dirtyRef.current = true;
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    if (context.current) {
      context.current.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const { columns, rows } = calculateGrid(rect.width, rect.height);
    initializeLetters(columns, rows);

    const thetaRad = (waveAngleDeg * Math.PI) / 180;
    const sinT = Math.sin(thetaRad);
    const cosT = Math.cos(thetaRad);
    const uMin = -sinT * (rows - 1) * charHeight;
    const uMax = cosT * (columns - 1) * charWidth;
    const tableSize = Math.max(2, Math.ceil(uMax - uMin) + 2);
    perturbTableRef.current = new Float32Array(tableSize);
    uMinRef.current = Math.floor(uMin);

    wrapLengthRef.current =
      sinT * rect.width +
      cosT * rect.height +
      2 * Math.max(0, waveCurvature);
  };

  const drawLetters = () => {
    if (!context.current || letters.current.length === 0) return;
    const ctx = context.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = "top";

    const cols = grid.current.columns;
    const rows = grid.current.rows;
    const items = letters.current;
    const wrap = wrapLengthRef.current;
    const offset = waveOffsetRef.current;
    const bandHalf = waveBandThickness;
    const n = waveCount;
    const segment = wrap / n;
    const curvature = Math.max(0, waveCurvature);

    const thetaRad = (waveAngleDeg * Math.PI) / 180;
    const sinT = Math.sin(thetaRad);
    const cosT = Math.cos(thetaRad);

    const centers: number[] = [];
    for (let k = 0; k < n; k++) {
      centers.push((offset + k * segment) % wrap);
    }

    const perturbTable = perturbTableRef.current;
    const uMinRounded = uMinRef.current;
    const tableSize = perturbTable ? perturbTable.length : 0;

    if (curvature > 0 && perturbTable) {
      const wavelength = Math.max(50, waveWavelength);
      const twoPi = Math.PI * 2;
      const phase1 = waveWobble && mountTimeRef.current > 0
        ? 0.37 * (performance.now() - mountTimeRef.current) / 1000
        : 0;
      const phase2 = waveWobble && mountTimeRef.current > 0
        ? 0.51 * (performance.now() - mountTimeRef.current) / 1000
        : 0;
      for (let ui = 0; ui < tableSize; ui++) {
        const u = uMinRounded + ui;
        perturbTable[ui] =
          curvature *
          (Math.sin((twoPi * u) / wavelength + phase1) +
            0.4 * Math.sin((twoPi * u) / (wavelength * 0.59) + 1.3 + phase2));
      }
    } else if (perturbTable) {
      perturbTable.fill(0);
    }

    for (let i = 0; i < items.length; i++) {
      const letter = items[i];
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * charWidth;
      const y = row * charHeight;
      const u = cosT * x - sinT * y;
      const uIdx = Math.floor(u) - uMinRounded;
      const perturb =
        perturbTable && uIdx >= 0 && uIdx < tableSize
          ? perturbTable[uIdx]
          : 0;
      const t = sinT * x + cosT * y + perturb;

      let minDist = Infinity;
      for (let k = 0; k < n; k++) {
        const c = centers[k];
        let d = t - c;
        if (d < 0) d = -d;
        const wrapped = wrap - d;
        if (wrapped < d) d = wrapped;
        if (d < minDist) minDist = d;
      }

      if (minDist >= bandHalf) continue;

      const alpha = smoothstep(bandHalf, 0, minDist);
      if (alpha <= 0.01) continue;

      ctx.globalAlpha = alpha;
      const c = letter.rgb;
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.fillText(letter.char, x, y);
    }
    ctx.globalAlpha = 1;
  };

  const updateLetters = () => {
    if (!letters.current || letters.current.length === 0) return;

    const updateCount = Math.max(1, Math.floor(letters.current.length * 0.015));

    for (let i = 0; i < updateCount; i++) {
      const index = Math.floor(Math.random() * letters.current.length);
      const letter = letters.current[index];
      if (!letter) continue;

      letter.char = getRandomChar();
      letter.targetRgb = pickRandomRgb();

      if (!smooth) {
        letter.rgb = letter.targetRgb;
        letter.colorProgress = 1;
      } else {
        letter.colorProgress = 0;
      }
    }
    dirtyRef.current = true;
  };

  const handleSmoothTransitions = () => {
    let needsRedraw = false;
    const items = letters.current;
    for (let i = 0; i < items.length; i++) {
      const letter = items[i];
      if (letter.colorProgress < 1) {
        letter.colorProgress += 0.05;
        if (letter.colorProgress > 1) {
          letter.colorProgress = 1;
          letter.rgb = letter.targetRgb;
        } else {
          letter.rgb = interpolateRgb(letter.rgb, letter.targetRgb, letter.colorProgress);
        }
        needsRedraw = true;
      }
    }
    if (needsRedraw) {
      dirtyRef.current = true;
    }
  };

  const animate = () => {
    if (!visibleRef.current) {
      animationRef.current = null;
      return;
    }

    const now = Date.now();
    const last = lastFrameTime.current;
    const dt = last > 0 ? (now - last) / 1000 : 0;
    lastFrameTime.current = now;

    const wrap = wrapLengthRef.current;
    if (wrap > 0 && dt > 0) {
      waveOffsetRef.current =
        (waveOffsetRef.current + waveSpeed * wrap * dt) % wrap;
    }

    if (now - lastGlitchTime.current >= glitchSpeed) {
      updateLetters();
      lastGlitchTime.current = now;
    }

    if (smooth) {
      handleSmoothTransitions();
    }

    dirtyRef.current = true;

    if (dirtyRef.current) {
      drawLetters();
      dirtyRef.current = false;
    }

    animationRef.current = requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    if (animationRef.current !== null) return;
    lastGlitchTime.current = Date.now();
    lastFrameTime.current = 0;
    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    colorsRef.current = readThemeColors();
    setBgColor(readBgGlitch());
    setReady(true);
    mountTimeRef.current = performance.now();

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
      }, 100);
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
          setBgColor(readBgGlitch());
          letters.current.forEach((l) => {
            l.rgb = pickRandomRgb();
            l.targetRgb = pickRandomRgb();
            l.colorProgress = 1;
          });
          dirtyRef.current = true;
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
        if (entry.isIntersecting) {
          startAnimation();
        } else if (animationRef.current !== null) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      },
      { threshold: 0 },
    );
    intersection.observe(canvas);

    const onBeforeSwap = () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      intersection.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
    document.addEventListener("astro:before-swap", onBeforeSwap, { once: true });

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      window.removeEventListener("resize", handleResize);
      intersection.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("astro:before-swap", onBeforeSwap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glitchSpeed, smooth, waveCount, waveSpeed, waveBandThickness, waveCurvature, waveWavelength, waveWobble, waveAngleDeg]);

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    backgroundColor: bgColor,
    overflow: "hidden",
  };

  const canvasStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
  };

  const outerVignetteStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    background:
      "radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,1) 100%)",
  };

  const centerVignetteStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    background:
      "radial-gradient(circle, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 60%)",
  };

  return (
    <div style={containerStyle} className={className} aria-hidden="true">
      <canvas ref={canvasRef} style={canvasStyle} />
      {outerVignette && <div style={outerVignetteStyle} />}
      {centerVignette && <div style={centerVignetteStyle} />}
      <span hidden>{ready ? "" : ""}</span>
    </div>
  );
};

export default LetterGlitch;
