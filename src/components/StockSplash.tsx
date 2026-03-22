import { useEffect, useMemo, useState } from "react";
import rawAaplCsv from "../data/AAPL_data.csv?raw";

type StockDataPoint = {
  time: number;
  value: number;
};

type ChartPoint = StockDataPoint & {
  x: number;
  y: number;
};

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 720;
const CHART_PADDING_X = 32;
const CHART_PADDING_Y = 48;
const VIEWPORT_POINT_COUNT = 34;
const STEP_DURATION_MS = 320;
const HOLD_AT_END_MS = 1800;
const HOME_CHART_HEIGHT = "calc(100vh - 9.5rem)";
const CHART_LINE_COLOR = "rgba(154, 63, 0, 0.48)";
const CHART_MARKER_GLOW = "rgba(154, 63, 0, 0.16)";
const SITE_WORDMARK_COLOR = "var(--accent)";

const toUnixDay = (dateString: string): number => {
  const parsedTime = Date.parse(dateString);
  return Number.isFinite(parsedTime)
    ? Math.floor(parsedTime / 1000)
    : Number.NaN;
};

const parseCsv = (rawCsv: string): StockDataPoint[] => {
  return rawCsv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.match(/(".*?"|[^,]+)/g) ?? [];
      const date = columns[0]?.replaceAll('"', "").trim() ?? "";
      const closeValue = Number.parseFloat(columns[4] ?? "");
      const time = toUnixDay(date);

      if (!date || !Number.isFinite(closeValue) || !Number.isFinite(time)) {
        return null;
      }

      return {
        time,
        value: closeValue,
      } satisfies StockDataPoint;
    })
    .filter((point): point is StockDataPoint => point !== null)
    .sort((a, b) => a.time - b.time);
};

const toChartPoints = (series: StockDataPoint[]): ChartPoint[] => {
  if (series.length === 0) {
    return [];
  }

  const minValue = Math.min(...series.map((point) => point.value));
  const maxValue = Math.max(...series.map((point) => point.value));
  const innerWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
  const valueRange = Math.max(1, maxValue - minValue);
  const pointCount = Math.max(1, series.length - 1);

  return series.map((point, index) => ({
    ...point,
    x: CHART_PADDING_X + (index / pointCount) * innerWidth,
    y:
      CHART_HEIGHT -
      CHART_PADDING_Y -
      ((point.value - minValue) / valueRange) * innerHeight,
  }));
};

const buildChartPath = (series: ChartPoint[]): string => {
  if (series.length === 0) {
    return "";
  }

  const coordinates = series.map(
    (point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`,
  );
  return coordinates
    .map((coordinate, index) => `${index === 0 ? "M" : "L"} ${coordinate}`)
    .join(" ");
};

const stockPoints = parseCsv(rawAaplCsv);

export default function StockSplash() {
  const [headIndex, setHeadIndex] = useState<number>(
    stockPoints.length > 0
      ? Math.min(stockPoints.length - 1, VIEWPORT_POINT_COUNT - 1)
      : 0,
  );

  useEffect(() => {
    if (stockPoints.length <= VIEWPORT_POINT_COUNT) {
      return;
    }

    let frameId = 0;
    let cycleStart = 0;
    const maxHeadIndex = stockPoints.length - 1;
    const firstHeadIndex = VIEWPORT_POINT_COUNT - 1;
    const stepCount = maxHeadIndex - firstHeadIndex;
    const animationDurationMs = stepCount * STEP_DURATION_MS;

    const animate = (now: number) => {
      if (cycleStart === 0) {
        cycleStart = now;
      }

      const cycleProgress =
        (now - cycleStart) % (animationDurationMs + HOLD_AT_END_MS);
      const nextHeadIndex =
        cycleProgress >= animationDurationMs
          ? maxHeadIndex
          : Math.min(
              maxHeadIndex,
              firstHeadIndex + Math.floor(cycleProgress / STEP_DURATION_MS),
            );

      setHeadIndex((currentHeadIndex) =>
        currentHeadIndex === nextHeadIndex ? currentHeadIndex : nextHeadIndex,
      );

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const visiblePoints = useMemo(() => {
    if (stockPoints.length === 0) {
      return [];
    }

    const startIndex = Math.max(0, headIndex - VIEWPORT_POINT_COUNT + 1);
    return stockPoints.slice(startIndex, headIndex + 1);
  }, [headIndex]);

  const chartPath = useMemo(() => {
    return buildChartPath(toChartPoints(visiblePoints));
  }, [visiblePoints]);

  const markerPoint = useMemo(() => {
    const chartPoints = toChartPoints(visiblePoints);
    return chartPoints[chartPoints.length - 1];
  }, [visiblePoints]);

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        height: HOME_CHART_HEIGHT,
        overflow: "hidden",
      }}
    >
      {stockPoints.length > 0 ? (
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            width: "100%",
            height: HOME_CHART_HEIGHT,
            maxHeight: HOME_CHART_HEIGHT,
            display: "block",
          }}
          aria-label="Apple stock chart for the last three months"
          role="img"
        >
          <path
            d={chartPath}
            fill="none"
            stroke={CHART_LINE_COLOR}
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {markerPoint ? (
            <>
              <circle
                cx={markerPoint.x}
                cy={markerPoint.y}
                r="9"
                fill={CHART_MARKER_GLOW}
              />
              <circle
                cx={markerPoint.x}
                cy={markerPoint.y}
                r="4.5"
                fill={CHART_LINE_COLOR}
              />
            </>
          ) : null}
        </svg>
      ) : (
        <div
          style={{
            color: "#FF9900",
            padding: "1rem",
          }}
        >
          No chart points found in src/data/AAPL_data.csv
        </div>
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          color: SITE_WORDMARK_COLOR,
          fontSize: "clamp(4.5rem, 13vw, 11rem)",
          fontWeight: 800,
          letterSpacing: "-0.06em",
          lineHeight: 0.9,
          textAlign: "center",
          textWrap: "balance",
        }}
      >
        smit3y.xyz
      </div>
      <div
        style={{
          position: "absolute",
          top: "1rem",
          left: "1rem",
          color: CHART_LINE_COLOR,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        AAPL
      </div>
    </section>
  );
}
