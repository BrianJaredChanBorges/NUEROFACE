"use client";

import React, {
  PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Direction = "left" | "right";
type FadeConfig =
  | boolean
  | {
      left?: boolean; // default: true
      right?: boolean; // default: true
      width?: number | string; // px o CSS length (default: 48)
    };

type Props = PropsWithChildren<{
  /** Velocidad en píxeles por segundo. Default: 80 */
  speed?: number;
  /** Espacio entre ítems en px. Si se omite, NO forzamos gap (se usan tus clases). */
  gap?: number;
  pauseOnHover?: boolean; // default: true
  direction?: Direction; // default: "left"
  className?: string; // contenedor externo
  innerClassName?: string; // contenedor interno (tus ítems)
  fade?: FadeConfig; // true u objeto para máscara
}>;

/**
 * Marquee 0-deps (React 18/19) con:
 * - Velocidad basada en ancho real del contenido (scrollWidth).
 * - Loop infinito duplicando el contenido.
 * - Respeta tus clases de gap; sólo lo fuerza si pasas `gap` (número).
 * - Fade opcional con mask.
 * - Pausa al hover.
 */
export default function Marquee({
  children,
  speed = 80,
  gap,
  pauseOnHover = true,
  direction = "left",
  className = "",
  innerClassName = "",
  fade = false,
}: Props) {
  const baseRef = useRef<HTMLDivElement>(null); // una sola “tira” de items
  const [contentWidth, setContentWidth] = useState<number>(1000);

  // Mide ancho real del contenido y recalcula en resize
  useEffect(() => {
    const el = baseRef.current;
    if (!el) return;

    const measure = () => {
      // ancho de una tira
      const w = el.scrollWidth;
      // evita 0
      setContentWidth(Math.max(1, w));
    };

    measure();

    // ResizeObserver para contenido dinámico
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;

    if (ro) ro.observe(el);

    // window resize
    const onResize = () => measure();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, [children]);

  // duración = distancia (ancho de una tira) / velocidad
  const duration = useMemo(() => {
    const seconds = contentWidth / Math.max(1, speed);
    // clamp suave para evitar loops demasiado rápidos o lentos
    return Math.max(4, Math.min(120, seconds));
  }, [contentWidth, speed]);

  const dir = direction === "left" ? "normal" : "reverse";

  // Fade config
  const fadeCfg =
    typeof fade === "boolean"
      ? { left: fade, right: fade, width: 48 }
      : {
          left: fade?.left ?? true,
          right: fade?.right ?? true,
          width: fade?.width ?? 48,
        };

  const fadeStyle: React.CSSProperties | undefined = (() => {
    if (!fade) return undefined;
    const w =
      typeof fadeCfg.width === "number" ? `${fadeCfg.width}px` : fadeCfg.width;
    const leftStops = fadeCfg.left
      ? `transparent 0, black ${w}`
      : `black 0, black ${w}`;
    const rightStops = fadeCfg.right
      ? `black calc(100% - ${w}), transparent 100%`
      : `black calc(100% - ${w}), black 100%`;
    const mask = `linear-gradient(to right, ${leftStops}, ${rightStops})`;
    return {
      maskImage: mask,
      WebkitMaskImage: mask as any,
      maskSize: "100% 100%",
      WebkitMaskSize: "100% 100%",
      maskRepeat: "no-repeat",
      WebkitMaskRepeat: "no-repeat",
    };
  })();

  // Si pasas gap numérico, lo aplicamos por inline-style; si no, respetamos tus clases.
  const gapStyle: React.CSSProperties | undefined =
    typeof gap === "number" ? { columnGap: `${gap}px`, gap: `${gap}px` } : undefined;

  return (
    <div
      className={[
        "relative overflow-hidden w-full",
        pauseOnHover ? "group" : "",
        className,
      ].join(" ")}
      style={{ ...fadeStyle }}
    >
      {/* Track que se mueve: dos copias del contenido */}
      <div
        className="marquee-track flex items-center w-max will-change-transform"
        style={
          {
            animationDuration: `${duration}s`,
            animationDirection: dir as any,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
          } as React.CSSProperties
        }
      >
        {/* Copia A */}
        <div
          ref={baseRef}
          className={["inline-flex items-center", innerClassName].join(" ")}
          style={gapStyle}
        >
          {children}
        </div>
        {/* Copia B */}
        <div
          className={["inline-flex items-center", innerClassName].join(" ")}
          style={gapStyle}
        >
          {children}
        </div>
      </div>

      <style jsx>{`
        @keyframes marquee-slide {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(-50%, 0, 0);
          }
        }
        .marquee-track {
          animation-name: marquee-slide;
        }
        .group:hover .marquee-track {
          animation-play-state: ${pauseOnHover ? "paused" : "running"};
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
