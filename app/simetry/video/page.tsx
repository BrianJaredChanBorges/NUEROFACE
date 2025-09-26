// app/simetry/video/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Pause, Play, Upload, LineChart as LineChartIcon, Download } from "lucide-react";

type FaceLandmark = { x: number; y: number; z: number };
type FaceResult = { faceLandmarks?: FaceLandmark[][] };

declare global {
  interface Window {
    FaceLandmarker: any;
    FilesetResolver: any;
    Vision: any;
  }
}

// ✅ Pínchalo a una versión estable para evitar sorpresas del "latest"
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm";
// IMPORTANTE: el modelo debe estar en /public/models/face_landmarker.task
const MODEL_PATH = "/models/face_landmarker.task";



export default function VideoSimetryPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [videoURL, setVideoURL] = useState<string | null>(null);

  const [loadingModel, setLoadingModel] = useState(false);
  const [ready, setReady] = useState(false);
  const landmarkerRef = useRef<any>(null);

  const rafRef = useRef<number | null>(null);
  const usingRVFC = useRef<boolean>(false);
  const [running, setRunning] = useState(false);

  const [fps, setFps] = useState(0);
  const lastTimeRef = useRef<number>(0);
  const [score, setScore] = useState<number | null>(null);

  // Buffer de serie temporal [{t, score}]
  const [series, setSeries] = useState<{ t: number; score: number }[]>([]);
  const t0Ref = useRef<number>(0);
const [loadError, setLoadError] = useState<string | null>(null);

  // ====== Modelo ======
const loadModel = useCallback(async () => {
  if (landmarkerRef.current || loadingModel) return;
  setLoadingModel(true);
  setLoadError(null);
  try {
    // 1) Pre-chequear que el modelo exista y no devuelva 404/403
    const head = await fetch(MODEL_PATH, { method: "HEAD" });
    if (!head.ok) {
      throw new Error(
        `No se encontró el modelo en "${MODEL_PATH}" (status ${head.status}). ` +
        `Colócalo en /public/models/face_landmarker.task o ajusta MODEL_PATH.`
      );
    }

    // 2) Importar paquete (sin globals)
    const mod = await import("@mediapipe/tasks-vision");
    const { FilesetResolver, FaceLandmarker } = mod as any;

    // 3) Construir con timeout (evita "cargando" infinito si el WASM no responde)
    const createTask = (async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    })();

    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Timeout cargando WASM/modelo. Revisa conexión/CORS/CSP.")), 15000)
    );

    const faceLandmarker = await Promise.race([createTask, timeout]);

    landmarkerRef.current = faceLandmarker;
    setReady(true);
  } catch (e: any) {
    console.error("Error cargando modelo de MediaPipe:", e);
    setLoadError(String(e?.message || e));
  } finally {
    setLoadingModel(false);
  }
}, [loadingModel]);


  // ====== Selección de video ======
  const onSelectVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoURL(url);
    setRunning(false);
    setSeries([]);
    t0Ref.current = 0;
    setScore(null);
    setFps(0);
  };

  // ====== Dibujo y score ======
  const drawOverlay = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    result?: FaceResult
  ) => {
    ctx.clearRect(0, 0, w, h);

    // Guía leve
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const x = (w / 3) * i;
      const y = (h / 3) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (!result?.faceLandmarks?.length) return;

    const lm = result.faceLandmarks[0];
    const toPx = (p: FaceLandmark) => ({ x: p.x * w, y: p.y * h });

    const idx = { leftEyeOuter: 130, rightEyeOuter: 359, noseTip: 1, mouthLeft: 61, mouthRight: 291 };
    const pts = {
      leftEyeOuter: toPx(lm[idx.leftEyeOuter]),
      rightEyeOuter: toPx(lm[idx.rightEyeOuter]),
      noseTip: toPx(lm[idx.noseTip]),
      mouthLeft: toPx(lm[idx.mouthLeft]),
      mouthRight: toPx(lm[idx.mouthRight]),
    };

    // puntos
    ctx.fillStyle = "#0b5fff";
    Object.values(pts).forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // línea de simetría vertical
    ctx.strokeStyle = "#0a0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts.noseTip.x, 0);
    ctx.lineTo(pts.noseTip.x, h);
    ctx.stroke();

    // segmentos ojos y boca
    ctx.strokeStyle = "#f00";
    ctx.beginPath();
    ctx.moveTo(pts.leftEyeOuter.x, pts.leftEyeOuter.y);
    ctx.lineTo(pts.rightEyeOuter.x, pts.rightEyeOuter.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pts.mouthLeft.x, pts.mouthLeft.y);
    ctx.lineTo(pts.mouthRight.x, pts.mouthRight.y);
    ctx.stroke();
  };

  const computeSymmetryScore = (result?: FaceResult, w = 1, h = 1) => {
    if (!result?.faceLandmarks?.length) return null;
    const lm = result.faceLandmarks[0];
    const toPx = (p: FaceLandmark) => ({ x: p.x * w, y: p.y * h });

    const P = {
      L: toPx(lm[130]),
      R: toPx(lm[359]),
      N: toPx(lm[1]),
      ML: toPx(lm[61]),
      MR: toPx(lm[291]),
    };
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
    const midEyes = mid(P.L, P.R);
    const midMouth = mid(P.ML, P.MR);

    const dxEyes = Math.abs(midEyes.x - P.N.x);
    const dxMouth = Math.abs(midMouth.x - P.N.x);
    const nx = (dxEyes + dxMouth) / (2 * w); // normaliza por ancho
    const raw = 1 - Math.min(1, nx / 0.05);  // 5 % de ancho tolerancia
    return Math.round(Math.max(0, Math.min(1, raw)) * 100);
  };

  // ====== Loop ======
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    const w = video.videoWidth || video.clientWidth;
    const h = video.videoHeight || video.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const now = performance.now();
    const result: FaceResult = landmarker.detectForVideo(video, now);

    drawOverlay(ctx, w, h, result);
    const s = computeSymmetryScore(result, w, h);
    if (s !== null) {
      setScore(s);
      if (!t0Ref.current) t0Ref.current = now;
      const t = (now - t0Ref.current) / 1000; // segundos
      // Mantener serie acotada (p.ej. últimos 5 minutos ~ 18000 puntos a 60fps sería mucho)
      // Guardamos ~10 muestras por segundo:
      const last = series.at(-1);
      if (!last || t - last.t >= 0.1) {
        setSeries((prev) => [...prev, { t, score: s }].slice(-3000)); // ~5 min a 10 Hz
      }
    }

    if (lastTimeRef.current) {
      const delta = now - lastTimeRef.current;
      setFps(Math.round(1000 / Math.max(1, delta)));
    }
    lastTimeRef.current = now;

    if (running) {
      if (usingRVFC.current && "requestVideoFrameCallback" in HTMLVideoElement.prototype) {
        // @ts-ignore
        (video as any).requestVideoFrameCallback(() => processFrame());
      } else {
        rafRef.current = requestAnimationFrame(() => processFrame());
      }
    }
  }, [running, series]);

  const start = () => {
    const video = videoRef.current;
    if (!video || !ready || !videoURL) return;
    setRunning(true);
    usingRVFC.current = !!(HTMLVideoElement.prototype as any).requestVideoFrameCallback;
    if (usingRVFC.current && "requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      // @ts-ignore
      (video as any).requestVideoFrameCallback(() => processFrame());
    } else {
      rafRef.current = requestAnimationFrame(() => processFrame());
    }
    video.play().catch(() => {});
  };

  const stop = () => {
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    videoRef.current?.pause();
  };

  useEffect(() => {
    return () => {
      stop();
      if (videoURL) URL.revokeObjectURL(videoURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== Exportación CSV ======
  const csvHref = useMemo(() => {
    if (!series.length) return null;
    const header = "time_sec,score\n";
    const rows = series.map((p) => `${p.t.toFixed(2)},${p.score}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    return URL.createObjectURL(blob);
  }, [series]);

  // ====== Gráfico SVG simple ======
  const Chart = () => {
    const width = 800;
    const height = 220;
    const pad = 24;

    const data = series;
    if (!data.length) {
      return (
        <div className="text-sm text-muted-foreground px-2 py-3">
          El gráfico aparecerá cuando inicies el análisis.
        </div>
      );
    }
    const tMin = data[0].t;
    const tMax = data[data.length - 1].t;
    const xScale = (t: number) =>
      pad + ((t - tMin) / Math.max(0.001, tMax - tMin)) * (width - 2 * pad);
    const yScale = (s: number) => pad + (1 - s / 100) * (height - 2 * pad);

    const path = data
      .map((p, i) => `${i ? "L" : "M"} ${xScale(p.t).toFixed(1)} ${yScale(p.score).toFixed(1)}`)
      .join(" ");

    // Ejes
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[220px]">
        <rect x="0" y="0" width={width} height={height} fill="none" />
        {/* Eje Y (0–100) */}
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="currentColor" strokeWidth="1" />
        {/* Eje X */}
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="currentColor"
          strokeWidth="1"
        />
        {/* Ticks Y */}
        {[0, 25, 50, 75, 100].map((y) => (
          <g key={y}>
            <text x={4} y={yScale(y) + 4} className="text-[10px] fill-current">
              {y}
            </text>
            <line
              x1={pad}
              y1={yScale(y)}
              x2={width - pad}
              y2={yScale(y)}
              stroke="currentColor"
              strokeOpacity="0.1"
            />
          </g>
        ))}
        {/* Línea */}
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  };

  return (
    <main className="min-h-dvh p-3 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5" />
              Análisis de Video
            </CardTitle>
            <CardDescription>
              Sube un video y calcularemos tu simetría facial cuadro a cuadro, con gráfico y exportación CSV.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="file"
                  accept="video/*"
                  onChange={onSelectVideo}
                  className="hidden"
                  id="video-input"
                />
                <Button asChild variant="secondary" className="gap-2">
                  <label htmlFor="video-input" className="cursor-pointer">
                    <Upload className="h-4 w-4" />
                    Seleccionar video
                  </label>
                </Button>
              </label>

              <Button
                onClick={start}
                disabled={!videoURL || !ready || running}
                className="gap-2"
                title="Iniciar análisis"
              >
                <Play className="h-4 w-4" />
                Iniciar
              </Button>
              <Button
                onClick={stop}
                disabled={!running}
                variant="secondary"
                className="gap-2"
                title="Pausar"
              >
                <Pause className="h-4 w-4" />
                Pausar
              </Button>

              <div className="text-sm text-muted-foreground">
                {loadingModel ? "Cargando modelo…" : ready ? "Modelo listo" : "Esperando modelo…"}
              </div>

              <div className="ml-auto flex items-center gap-4 text-sm">
                <div><span className="font-semibold">FPS:</span> {fps}</div>
                <div><span className="font-semibold">Score:</span> {score ?? "—"}/100</div>
                {csvHref && (
                  <Button asChild variant="outline" className="gap-2">
                    <a href={csvHref} download="simetry_timeseries.csv">
                      <Download className="h-4 w-4" />
                      Exportar CSV
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <div className="relative w-full bg-black rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                src={videoURL ?? undefined}
                className="w-full h-auto block"
                controls
                playsInline
                onPlay={() => {
                  if (!running && ready) start();
                }}
                onPause={() => {
                  if (running) stop();
                }}
                onLoadedMetadata={() => {
                  const v = videoRef.current!;
                  const c = canvasRef.current!;
                  c.width = v.videoWidth;
                  c.height = v.videoHeight;
                }}
              />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            </div>

            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolución del score (0–100)</CardTitle>
                <CardDescription>Actualiza ~10 veces por segundo</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart />
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Consejo: usa videos bien iluminados, rostro frontal y sin oclusiones para mejores resultados.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
