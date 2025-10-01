// app/simetry/components/FaceAnalyzer.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Uploader, { UploaderProps } from "./Uploader";


type Landmark = { x: number; y: number; z?: number };
type Scores = { global: number; eyes: number; mouth: number; jaw: number; framesProcessed?: number };
// 1) En la definición del componente, añade las props:
type FaceAnalyzerProps = {
  className?: string;
  autoStart?: boolean;           // <--- NUEVO
  onReady?: () => void;          // <--- NUEVO (opcional)
};

let FilesetResolver: any = null;
let FaceLandmarkerClass: any = null;
let DrawingUtilsClass: any = null;

// ---------- UI helpers (solo presentación) ----------
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Cuenta hacia arriba de forma suave hasta "to" */
function CountUp({ to, decimals = 0, duration = 900 }: { to: number; decimals?: number; duration?: number }) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const t = clamp01((performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(to * eased);
      if (t < 1) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{val.toFixed(decimals)}</>;
}

/** Medidor circular con conic-gradient (0–100) */
function GaugeRing({ value, size = 160 }: { value: number; size?: number }) {
  const pct = clamp01(value / 100);
  const angle = pct * 360;
  const ring = {
    background: `conic-gradient(hsl(var(--primary)) ${angle}deg, hsl(var(--muted)) ${angle}deg)`,
    width: size,
    height: size,
  } as React.CSSProperties;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <div className="rounded-full" style={{ ...ring, borderRadius: "9999px" }} />
      <div className="absolute rounded-full bg-background shadow-sm" style={{ width: size - 36, height: size - 36 }} />
      <div className="absolute text-center">
        <div className="text-4xl font-extrabold">
          <CountUp to={value} decimals={1} />%
        </div>
        <div className="text-xs text-muted-foreground -mt-1">Índice global</div>
      </div>
    </div>
  );
}

/** Barra horizontal animada (0–100) */
function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.toFixed(1)}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${clamp01(value / 100) * 100}%` }}
        />
      </div>
    </div>
  );
}

function badgeFromScore(v: number) {
  if (v >= 75) return { text: "Simetría alta", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (v >= 45) return { text: "Simetría media", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { text: "Simetría baja", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
}

export default function FaceAnalyzer({
  className,
  autoStart = false,
  onReady,
}: FaceAnalyzerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const landmarkerRef = useRef<any | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const frameBufferRef = useRef<number[][]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
  const MODEL_PATH = "models/face_landmarker.task"; 

  useEffect(() => {
    (async () => {
      try {
        try {
          const mod = await import("@mediapipe/tasks-vision");
          FilesetResolver = mod.FilesetResolver;
          FaceLandmarkerClass = mod.FaceLandmarker;
          DrawingUtilsClass = mod.DrawingUtils;
        } catch (npmErr) {
          if (typeof window !== "undefined" && (window as any).FilesetResolver && (window as any).FaceLandmarker) {
            FilesetResolver = (window as any).FilesetResolver;
            FaceLandmarkerClass = (window as any).FaceLandmarker;
            DrawingUtilsClass = (window as any).DrawingUtils;
          } else {
            throw new Error(
              "No se encontró @mediapipe/tasks-vision en node_modules y tampoco el bundle global. " +
                "Instala @mediapipe/tasks-vision o añade el script CDN en tu layout."
            );
          }
        }

        // 2) En el useEffect donde inicializas la cámara, añade el auto-start.
// Si no tienes ese efecto, crea este (sin duplicar inicializaciones):


        const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);

        landmarkerRef.current = await FaceLandmarkerClass.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        setReady(true);
      } catch (err: any) {
        console.error("Error inicializando FaceLandmarker:", err);
        setLoadError(
          String(err.message ?? err) +
            ". Si no instalaste el paquete, agrega el script CDN en app/layout.tsx"
        );
      }
    })();

      return () => {
      // cleanup asíncrono seguro
      (async () => {
        try {
          // detener cámara (sincrónico)
          stopCamera();

          // si existe la instancia, intenta cerrarla de forma asíncrona y esperar a que termine
          if (landmarkerRef.current) {
            // algunos builds exponen close() como async, otros no; await funciona con ambos.
            try {
              await landmarkerRef.current.close?.();
            } catch (closeErr) {
              console.warn("Warning: error al cerrar faceLandmarker:", closeErr);
            }
          }
        } catch (err) {
          console.warn("Error en cleanup de FaceAnalyzer:", err);
        } finally {
          // limpiar referencia
          landmarkerRef.current = null;
        }
      })();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enableCam() {
    if (!landmarkerRef.current || !ready) return;
    if (webcamRunning) {
      stopCamera();
      setWebcamRunning(false);
      return;
    }
    try {
      const constraints = { video: { facingMode: "user" }, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setWebcamRunning(true);
      requestAnimationFrame(predictWebcam);
    } catch (err) {
      console.error("Error al iniciar cámara:", err);
      alert("No se pudo acceder a la cámara. Revisa permisos.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
    clearCanvas();
    frameBufferRef.current = [];
  }

  let lastVideoTime = -1;
  async function predictWebcam() {
    if (!landmarkerRef.current || !videoRef.current) {
      if (webcamRunning) requestAnimationFrame(predictWebcam);
      return;
    }
    try {
      const video = videoRef.current!;
      const canvas = canvasRef.current!;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const startTimeMs = performance.now();
      if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        const results = await landmarkerRef.current.detectForVideo(video, startTimeMs);
        if (results?.faceLandmarks?.length) {
          if (DrawingUtilsClass) {
            const ctx = canvas.getContext("2d")!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const drawingUtils = new DrawingUtilsClass(ctx);
            for (const landmarks of results.faceLandmarks) {
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarkerClass.FACE_LANDMARKS_TESSELATION,
                { color: "#C0C0C070", lineWidth: 1 }
              );
              drawingUtils.drawConnectors(landmarks, FaceLandmarkerClass.FACE_LANDMARKS_RIGHT_EYE, { color: "#FF3030" });
              drawingUtils.drawConnectors(landmarks, FaceLandmarkerClass.FACE_LANDMARKS_LEFT_EYE, { color: "#30FF30" });
              drawingUtils.drawConnectors(landmarks, FaceLandmarkerClass.FACE_LANDMARKS_FACE_OVAL, { color: "#E0E0E0" });
              drawingUtils.drawConnectors(landmarks, FaceLandmarkerClass.FACE_LANDMARKS_LIPS, { color: "#E0E0E0" });
            }
          } else {
            drawPoints(results.faceLandmarks[0]);
          }

          const pj = normalizeLandmarks2D(results.faceLandmarks[0], video.videoWidth, video.videoHeight);
          frameBufferRef.current.push(pj.flat());
          if (frameBufferRef.current.length > 80) frameBufferRef.current.shift();

          if (frameBufferRef.current.length % 8 === 0) {
            const avg = averageFrame(frameBufferRef.current);
            const sc: Scores = computeAsymmetryScores(avg);
            sc.framesProcessed = frameBufferRef.current.length;
            setScores(sc);
          }
        } else {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    } catch (err) {
      console.error("Error detectando en webcam:", err);
    } finally {
      if (webcamRunning) requestAnimationFrame(predictWebcam);
    }
  }

  // Reemplaza la función handleFiles existente por esta
async function handleFiles(files: File[]) {
  if (!files || !files.length || !landmarkerRef.current) return;
  setProcessing(true);

  // recordamos si la webcam estaba corriendo para restaurarla luego
  const wasWebcamRunning = webcamRunning;

  try {
    // Si la webcam estaba activa, detenla temporalmente para evitar conflictos
    if (wasWebcamRunning) {
      stopCamera();
      setWebcamRunning(false);
    }

    // Cambiar el modo a IMAGE para poder usar detect()
    if (landmarkerRef.current.setOptions) {
      try {
        await landmarkerRef.current.setOptions({ runningMode: "IMAGE" });
      } catch (err) {
        console.warn("No se pudo setOptions to IMAGE, intentando continuar:", err);
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const img = await fileToImage(file);

      // ahora detect() en modo IMAGE
      const res = await landmarkerRef.current.detect(img);
      if (res?.faceLandmarks?.[0]) {
        drawStaticImageWithLandmarks(img, res.faceLandmarks[0]);
        const pts = normalizeLandmarks2D(res.faceLandmarks[0], img.width, img.height);
        const sc: Scores = computeAsymmetryScores(pts.flat());
        sc.framesProcessed = 1;
        setScores(sc);
      } else {
        clearCanvas();
        setScores(null);
      }
    }
  } catch (err) {
    console.error("Error procesando imagen:", err);
  } finally {
    // Restaurar modo a VIDEO si es posible (y reanudar cámara si estaba antes)
    try {
      if (landmarkerRef.current?.setOptions) {
        await landmarkerRef.current.setOptions({ runningMode: "VIDEO" });
      }
    } catch (err) {
      console.warn("No se pudo setOptions to VIDEO:", err);
    }

    if (wasWebcamRunning) {
      // re-iniciar cámara y loop
      await enableCam();
      // enableCam ya pone webcamRunning true y arranca predictWebcam
    }

    setProcessing(false);
  }
}


  function drawPoints(landmarks: Landmark[]) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = "rgba(0,120,255,0.9)";
    ctx.lineWidth = 1;
    for (const p of landmarks) {
      const x = p.x * canvas.width;
      const y = p.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawStaticImageWithLandmarks(img: HTMLImageElement, landmarks: Landmark[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = "rgba(0,200,120,0.95)";
    ctx.lineWidth = 1;
    for (const p of landmarks) {
      const x = p.x * canvas.width;
      const y = p.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function fileToImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  function normalizeLandmarks2D(landmarks: Landmark[], width: number, height: number): number[][] {
    const pts = landmarks.map((p) => [p.x * width, p.y * height]);
    const leftIdx = [33, 133, 159, 145];
    const rightIdx = [362, 263, 386, 374];
    const mean = (idxs: number[]) => {
      const sel = idxs.map((i) => pts[i]);
      const cx = sel.reduce((s, p) => s + p[0], 0) / sel.length;
      const cy = sel.reduce((s, p) => s + p[1], 0) / sel.length;
      return [cx, cy];
    };
    const L = mean(leftIdx);
    const R = mean(rightIdx);
    const mid = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2];
    const d = Math.hypot(L[0] - R[0], L[1] - R[1]) || 1;
    const ang = Math.atan2(R[1] - L[1], R[0] - L[0]);
    const cos = Math.cos(-ang);
    const sin = Math.sin(-ang);
    return pts.map(([x, y]) => {
      const tx = (x - mid[0]) / d;
      const ty = (y - mid[1]) / d;
      return [tx * cos - ty * sin, tx * sin + ty * cos];
    });
  }

  function averageFrame(buf: number[][]) {
    if (!buf.length) return [];
    const n = buf.length;
    const m = buf[0].length;
    const out = new Array(m).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[j] += buf[i][j];
    return out.map((v) => v / n);
  }

  // ahora devuelve Scores (incluye framesProcessed opcional)
  function computeAsymmetryScores(avgFlat: number[]): Scores {
    const pts: number[][] = [];
    for (let i = 0; i < avgFlat.length; i += 2) pts.push([avgFlat[i], avgFlat[i + 1]]);

    const pairsEyes: Array<[number, number]> = [
      [33, 263],
      [133, 362],
      [159, 386],
      [145, 374],
    ];
    const pairsMouth: Array<[number, number]> = [
      [61, 291],
      [78, 308],
      [13, 14],
      [0, 17],
    ];
    const pairsJaw: Array<[number, number]> = [
      [172, 397],
      [58, 288],
      [132, 361],
    ];

    const pairMeanDistance = (pairs: Array<[number, number]>) => {
      const ds = pairs.map(([iL, iR]) => {
        const L = pts[iL] ?? [0, 0];
        const R = pts[iR] ?? [0, 0];
        const Rm = [-R[0], R[1]];
        return Math.hypot(L[0] - Rm[0], L[1] - Rm[1]);
      });
      const sum = ds.reduce((a, b) => a + b, 0);
      return ds.length ? sum / ds.length : 0;
    };

    const sEyes = pairMeanDistance(pairsEyes);
    const sMouth = pairMeanDistance(pairsMouth);
    const sJaw = pairMeanDistance(pairsJaw);

    const k = 200;
    const eyes = Math.min(100, sEyes * k);
    const mouth = Math.min(100, sMouth * k);
    const jaw = Math.min(100, sJaw * k);
    const global = Math.min(100, mouth * 0.5 + eyes * 0.25 + jaw * 0.25);

    return { global, eyes, mouth, jaw };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          className={`px-3 py-1 rounded ${webcamRunning ? "bg-red-600 text-white" : "bg-blue-600 text-white"}`}
          onClick={enableCam}
          disabled={!ready}
        >
          {webcamRunning ? "Detener cámara" : "Enable webcam"}
        </button>

        <Uploader
          onFiles={async (files: File[]) => {
            await handleFiles(files);
          }}
        />

        <div className="ml-auto text-sm">
          {loadError ? <span className="text-red-500">{loadError}</span> : ready ? "Modelo listo" : "Cargando modelo..."}
        </div>
      </div>

      <div className="relative max-w-xl">
        <video ref={videoRef} className={`rounded w-full ${webcamRunning ? "block" : "hidden"}`} playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full rounded pointer-events-none" />
      </div>

      {/* ----- RESULTADOS VISUALES ----- */}
<div className="relative">
  {/* Overlay de procesamiento */}
  {processing && (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-background/70 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2 animate-ping rounded-full bg-primary" />
        Procesando imagen…
      </div>
    </div>
  )}

  {scores ? (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Tarjeta 1: Gauge + badge */}
      <div className="rounded-xl border p-6 bg-card/60">
        <div className="flex items-start justify-between">
          <GaugeRing value={scores.global} />
          {(() => {
            const b = badgeFromScore(scores.global);
            return (
              <span className={`border px-2.5 py-1 rounded-full text-xs font-medium mt-2 ${b.cls}`}>
                {b.text}
              </span>
            );
          })()}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Frames analizados: {scores.framesProcessed ?? 0}
        </p>
      </div>

      {/* Tarjeta 2: barras por zona */}
      <div className="rounded-xl border p-6 bg-card/60 space-y-4">
        <h4 className="font-semibold">Áreas evaluadas</h4>
        <StatBar label="Ojos" value={scores.eyes} />
        <StatBar label="Boca" value={scores.mouth} />
        <StatBar label="Mandíbula" value={scores.jaw} />

        {/* tips simples basados en el peor valor */}
        {(() => {
          const items = [
            { k: "Ojos", v: scores.eyes, tip: "Mantén la cabeza recta al tomar la foto para reducir inclinación." },
            { k: "Boca", v: scores.mouth, tip: "Relaja los labios y evita sonreír ampliamente para medir mejor." },
            { k: "Mandíbula", v: scores.jaw, tip: "Procura iluminación frontal para evitar sombras laterales." },
          ];
          const worst = items.sort((a, b) => b.v - a.v)[2];
          return (
            <div className="mt-2 text-xs text-muted-foreground">
              Sugerencia rápida ({worst.k}): {worst.tip}
            </div>
          );
        })()}
      </div>
    </div>
  ) : (
    <div className="rounded-xl border p-6 bg-card/60 text-sm text-muted-foreground">
      Sube una imagen o enciende la cámara para ver tu análisis.
    </div>
  )}
</div>


      <div className="flex gap-2">
        <button
          className="px-3 py-1 rounded bg-green-600 text-white"
          onClick={() => {
            const c = canvasRef.current;
            if (!c) return;
            const dataUrl = c.toDataURL("image/png");
            console.log("Snapshot (base64...) ->", dataUrl.slice(0, 80));
            alert("Snapshot capturado (ver consola).");
          }}
        >
          Capturar snapshot
        </button>
      </div>
    </div>
  );
}
