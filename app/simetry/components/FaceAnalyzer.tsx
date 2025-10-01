// app/simetry/components/FaceAnalyzer.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Uploader, { UploaderProps } from "./Uploader";


type Landmark = { x: number; y: number; z?: number };
type Scores = {
  global: number;
  eyes: number;
  mouth: number;
  jaw: number;
  framesProcessed?: number;
  meta?: { rollDeg: number; rollOk: boolean };
  clinical?: ClinicalMetrics;     // 👈 NUEVO
};

type ClinicalMetrics = {
  // Ojos
  eyesApertL: number;
  eyesApertR: number;
  eyesApertDiff: number;    // |L - R|  (0..1 en coords normalizadas)
  // Boca
  mouthAngleDeg: number;    // ángulo de la línea de comisuras
  mouthVertDiff: number;    // |yL - yR| / ref
  dentalProxy: number;      // (ancho boca * apertura) / ref^2
  smileLikely: boolean;
  // Cejas
  browEyeDistL: number;     // distancia vertical ceja-ojo / ref
  browEyeDistR: number;
  browAsym: number;         // |L - R|
  // Eje medio (para overlay)
  midX: number;
};

// 1) En la definición del componente, añade las props:
type FaceAnalyzerProps = {
  className?: string;
  autoStart?: boolean;           // <--- NUEVO
  onReady?: () => void;          // <--- NUEVO (opcional)
};

let FilesetResolver: any = null;
let FaceLandmarkerClass: any = null;
let DrawingUtilsClass: any = null;


// ====== Utils de precisión (simetría geométrica + corrección de roll) ======
type XYZ = { x: number; y: number; z?: number };

// Indices de FaceMesh más estables (MediaPipe) para puntos clínicos
// (Si tu build cambia indices, ajusta aquí sin tocar lo demás)
const IDX = {
  eyeOuterL: 33,     // comisura externa ojo izq (puede invertirse según espejo)
  eyeOuterR: 263,    // comisura externa ojo der
  eyeInnerL: 133,
  eyeInnerR: 362,
  mouthCornerL: 61,  // comisura labial izq
  mouthCornerR: 291, // comisura labial der
  jawL: 172,         // mandíbula izq aprox
  jawR: 397,         // mandíbula der aprox
  noseTip: 1,        // punta nasal
  noseBaseL: 98,     // ala nasal izq
  noseBaseR: 327,    // ala nasal der
};
 

// Utilidades geométricas
const v = {
  sub: (a: XYZ, b: XYZ) => ({ x: a.x - b.x, y: a.y - b.y }),
  add: (a: XYZ, b: XYZ) => ({ x: a.x + b.x, y: a.y + b.y }),
  mul: (a: XYZ, k: number) => ({ x: a.x * k, y: a.y * k }),
  dot: (a: XYZ, b: XYZ) => a.x * b.x + a.y * b.y,
  len: (a: XYZ) => Math.hypot(a.x, a.y),
  mid: (a: XYZ, b: XYZ) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
};

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function toDeg(rad: number) { return (rad * 180) / Math.PI; }

// Rota en 2D alrededor de "c" (para quitar roll)
function rotateAround(p: XYZ, c: XYZ, deg: number): XYZ {
  const r = toRad(deg);
  const s = Math.sin(r), ccos = Math.cos(r);
  const t = v.sub(p, c);
  return { x: t.x * ccos - t.y * s + c.x, y: t.x * s + t.y * ccos + c.y };
}

// Obtiene punto seguro (si no existe, vuelve al 0)
function P(ls: XYZ[], i: number): XYZ {
  return ls[i] ?? { x: 0, y: 0, z: 0 };
}

// Normaliza landmarks quitando roll (inclinación) usando línea de ojos
function deroll(landmarks: XYZ[]) {
  const L = P(landmarks, IDX.eyeOuterL);
  const R = P(landmarks, IDX.eyeOuterR);
  const center = v.mid(L, R);
  const angle = toDeg(Math.atan2(R.y - L.y, R.x - L.x)); // 0° = horizontal
  // Si la línea de ojos sube a la derecha, angle > 0 → rotamos -angle
  const corrected = landmarks.map((p) => rotateAround(p, center, -angle));
  return { corrected, rollDeg: angle };
}

// Métrica 0–100 a partir de diferencia absoluta respecto al eje medio
function pairScore(a: XYZ, b: XYZ, midX: number, ref: number) {
  // Si el promedio de |(a.x - d)| y |(b.x - d)| es pequeño → más simétrico
  const da = Math.abs(a.x - midX);
  const db = Math.abs(b.x - midX);
  const diff = Math.abs(da - db);            // diferencia de distancias al eje
  const norm = Math.min(diff / ref, 1);      // 0 = perfecto, 1 = muy asimétrico
  return 100 * (1 - norm);
}

// Calcula puntajes por zona + global (simple y estable)
export function computeSymmetryEnhanced(landmarks: XYZ[]) {
  // 1) Quitar roll con la línea de ojos
  const { corrected, rollDeg } = deroll(landmarks);

  // Referencias y eje medio
  const L = P(corrected, IDX.eyeOuterL);
  const R = P(corrected, IDX.eyeOuterR);
  const mid = v.mid(L, R);
  const ref = Math.max(0.04, v.len(v.sub(R, L))); // interpupilar (0..1)

  // --- Simetría horizontal (X) como base ---
  const eyesX  = pairScore(P(corrected, IDX.eyeInnerL),  P(corrected, IDX.eyeInnerR),  mid.x, ref);
  const mouthX = pairScore(P(corrected, IDX.mouthCornerL), P(corrected, IDX.mouthCornerR), mid.x, ref);
  const jawX   = pairScore(P(corrected, IDX.jawL),         P(corrected, IDX.jawR),        mid.x, ref);
  const noseX  = pairScore(P(corrected, IDX.noseBaseL),    P(corrected, IDX.noseBaseR),   mid.x, ref);

  // --- Métricas clínicas anti-sesgo ---
  // Apertura de ojos (párpado inferior - superior)
  const LE_up = P(corrected, 159), LE_down = P(corrected, 145);
  const RE_up = P(corrected, 386), RE_down = P(corrected, 374);
  const aperL = Math.max(LE_down.y - LE_up.y, 0);
  const aperR = Math.max(RE_down.y - RE_up.y, 0);
  const aperDiff = Math.abs(aperL - aperR);
  const aperRatioDiff = aperDiff / Math.max(Math.max(aperL, aperR), 1e-6);
  const eyesApertScore = 100 * (1 - Math.min(aperRatioDiff, 1));

  // Boca: desnivel vertical y ángulo
  const mouthL = P(corrected, IDX.mouthCornerL);
  const mouthR = P(corrected, IDX.mouthCornerR);
  const mouthVertDiff = Math.abs(mouthL.y - mouthR.y) / ref;     // normalizado
  const mouthVertScore = 100 * (1 - Math.min(mouthVertDiff, 1));
  const angDeg = Math.abs((Math.atan2(mouthR.y - mouthL.y, mouthR.x - mouthL.x) * 180) / Math.PI);
  const angleLimit = 12;
  const mouthAngleScore = 100 * (1 - Math.min(angDeg / angleLimit, 1));

  // Proxy área dental (sonrisa): ancho boca * apertura (labio sup 13, inf 14)
  const upperLip = P(corrected, 13), lowerLip = P(corrected, 14);
  const mouthOpen = Math.max(lowerLip.y - upperLip.y, 0);
  const mouthWidth = Math.max(v.len(v.sub(mouthR, mouthL)), 1e-6);
  const dentalProxy = (mouthWidth * mouthOpen) / (ref * ref); // 0..~>1
  const smileLikely = dentalProxy > 0.25; // umbral empírico (ajustable)

  // Cejas: ápices aprox 105 (izq) y 334 (der); centro de ojo = media de 4 puntos
  const mean = (idxs: number[]) => {
    const pts = idxs.map((i) => P(corrected, i));
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  };
  const eyeLC = mean([33, 133, 159, 145]);
  const eyeRC = mean([362, 263, 386, 374]);
  const browL = P(corrected, 105), browR = P(corrected, 334);
  const browEyeDistL = Math.max(browL.y - eyeLC.y, 0) / ref;
  const browEyeDistR = Math.max(browR.y - eyeRC.y, 0) / ref;
  const browAsym = Math.abs(browEyeDistL - browEyeDistR);

  // --- Combinar por zonas ---
  const eyesScore  = eyesX * 0.5 + eyesApertScore * 0.5;
  // Si se detecta sonrisa, reducimos el peso del componente de boca vertical
  const mouthVertWeight = smileLikely ? 0.2 : 0.4;
  const mouthAngleWeight = smileLikely ? 0.1 : 0.2;
  const mouthXWeight = 1 - mouthVertWeight - mouthAngleWeight; // 0.7 u 0.4
  const mouthScore = mouthX * mouthXWeight + mouthVertScore * mouthVertWeight + mouthAngleScore * mouthAngleWeight;

  const jawScore   = jawX;
  const noseScore  = noseX;

  // Global con anclaje en señales clínicas
  let global = eyesScore * 0.32 + mouthScore * 0.38 + jawScore * 0.18 + noseScore * 0.12;
  const criticalMin = Math.min(eyesApertScore, mouthVertScore, mouthAngleScore);
  global = Math.min(global, criticalMin * 0.6 + global * 0.4);

  return {
    global: +global.toFixed(1),
    eyes: +eyesScore.toFixed(1),
    mouth: +mouthScore.toFixed(1),
    jaw: +jawScore.toFixed(1),
    nose: +noseScore.toFixed(1),
    quality: { rollDeg: +rollDeg.toFixed(1), rollOk: Math.abs(rollDeg) <= 5 },
    clinical: {
      eyesApertL: +aperL.toFixed(4),
      eyesApertR: +aperR.toFixed(4),
      eyesApertDiff: +aperDiff.toFixed(4),
      mouthAngleDeg: +angDeg.toFixed(1),
      mouthVertDiff: +mouthVertDiff.toFixed(3),
      dentalProxy: +dentalProxy.toFixed(3),
      smileLikely,
      browEyeDistL: +browEyeDistL.toFixed(3),
      browEyeDistR: +browEyeDistR.toFixed(3),
      browAsym: +browAsym.toFixed(3),
      midX: +mid.x.toFixed(4),
    },
  };
}


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
  const [clinicalMode, setClinicalMode] = useState(false);
 

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

  // --- Helpers de canvas para modo clínico ---
function px(canvas: HTMLCanvasElement, nx: number) { return nx * canvas.width; }
function py(canvas: HTMLCanvasElement, ny: number) { return ny * canvas.height; }

/**
 * Dibuja guías clínicas sobre el canvas:
 * - Eje medio facial (rojo)
 * - Línea de comisuras de la boca (naranja)
 * - Aperturas de ambos ojos (azul)
 * - Distancia ceja-ojo en ambos lados (morado)
 * - Región dental aproximada (verde)
 */
function drawClinicalGuides(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  ls: Landmark[]
) {
  if (!ls?.length) return;

  ctx.save();
  ctx.lineWidth = 2;

  // 1) Eje medio entre ojos externos (rojo)
  const L = ls[33], R = ls[263];
  if (L && R) {
    const midx = (L.x + R.x) / 2;
    ctx.strokeStyle = "rgba(255,80,80,0.9)";
    ctx.beginPath();
    ctx.moveTo(px(canvas, midx), 0);
    ctx.lineTo(px(canvas, midx), canvas.height);
    ctx.stroke();
  }

  // 2) Línea de comisuras (naranja)
  const ML = ls[61], MR = ls[291];
  if (ML && MR) {
    ctx.strokeStyle = "rgba(255,160,50,0.95)";
    ctx.beginPath();
    ctx.moveTo(px(canvas, ML.x), py(canvas, ML.y));
    ctx.lineTo(px(canvas, MR.x), py(canvas, MR.y));
    ctx.stroke();
  }

  // 3) Aperturas de ojos (azul)  (sup, inf): izq (159,145), der (386,374)
  const pairs: Array<[number, number]> = [[159,145],[386,374]];
  ctx.strokeStyle = "rgba(80,160,255,0.95)";
  for (const [up, down] of pairs) {
    const U = ls[up], D = ls[down];
    if (U && D) {
      ctx.beginPath();
      ctx.moveTo(px(canvas, U.x), py(canvas, U.y));
      ctx.lineTo(px(canvas, D.x), py(canvas, D.y));
      ctx.stroke();
    }
  }

  // 4) Distancia ceja-ojo (morado): ápices 105 (izq) y 334 (der)
  const eyeLC = (ls[33] && ls[133] && ls[159] && ls[145])
    ? { x:(ls[33].x+ls[133].x+ls[159].x+ls[145].x)/4, y:(ls[33].y+ls[133].y+ls[159].y+ls[145].y)/4 }
    : null;
  const eyeRC = (ls[362] && ls[263] && ls[386] && ls[374])
    ? { x:(ls[362].x+ls[263].x+ls[386].x+ls[374].x)/4, y:(ls[362].y+ls[263].y+ls[386].y+ls[374].y)/4 }
    : null;
  const browL = ls[105], browR = ls[334];
  ctx.strokeStyle = "rgba(180,90,255,0.9)";
  if (browL && eyeLC) {
    ctx.beginPath();
    ctx.moveTo(px(canvas, browL.x), py(canvas, browL.y));
    ctx.lineTo(px(canvas, eyeLC.x), py(canvas, eyeLC.y));
    ctx.stroke();
  }
  if (browR && eyeRC) {
    ctx.beginPath();
    ctx.moveTo(px(canvas, browR.x), py(canvas, browR.y));
    ctx.lineTo(px(canvas, eyeRC.x), py(canvas, eyeRC.y));
    ctx.stroke();
  }

  // 5) Región dental aproximada (verde): rectángulo entre comisuras y labio sup/inf (13,14)
  const upper = ls[13], lower = ls[14];
  if (ML && MR && upper && lower) {
    const x1 = px(canvas, Math.min(ML.x, MR.x));
    const x2 = px(canvas, Math.max(ML.x, MR.x));
    const y1 = py(canvas, upper.y);
    const y2 = py(canvas, lower.y);
    ctx.strokeStyle = "rgba(60,200,120,0.9)";
    ctx.strokeRect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
  }

  ctx.restore();
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

  // Dibuja el mallado estándar
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

  // 👇 Ahora sí, AL FINAL, superponemos las guías clínicas sobre la primera cara
  if (clinicalMode) {
    const ctx2 = canvas.getContext("2d")!; // mismo contexto
    drawClinicalGuides(ctx2, canvas, results.faceLandmarks[0] as any);
  }
} else {
  // Fallback de puntos
  drawPoints(results.faceLandmarks[0] as any);
  // 👇 También aquí, para que el modo clínico funcione cuando no hay DrawingUtils
  if (clinicalMode) {
    const ctx = canvas.getContext("2d")!;
    drawClinicalGuides(ctx, canvas, results.faceLandmarks[0] as any);
  }
}

            
        // Cálculo mejorado directamente desde los landmarks (más preciso al corregir roll)
const enh = computeSymmetryEnhanced(results.faceLandmarks[0] as any);

// Si quieres mantener un poquito de suavizado temporal, mezclamos 20% con el valor previo
setScores((prev: any) => {
  const blend = (a: number, b: number) => (prev ? a * 0.8 + b * 0.2 : a);
  return {
    global: +blend(enh.global, prev?.global ?? enh.global).toFixed(1),
    eyes:   +blend(enh.eyes,   prev?.eyes   ?? enh.eyes).toFixed(1),
    mouth:  +blend(enh.mouth,  prev?.mouth  ?? enh.mouth).toFixed(1),
    jaw:    +blend(enh.jaw,    prev?.jaw    ?? enh.jaw).toFixed(1),
    framesProcessed: (prev?.framesProcessed ?? 0) + 1,
    meta: { rollDeg: enh.quality.rollDeg, rollOk: enh.quality.rollOk },
  };
});

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
       const enh = computeSymmetryEnhanced(res.faceLandmarks[0] as any);
setScores({
  global: enh.global,
  eyes: enh.eyes,
  mouth: enh.mouth,
  jaw: enh.jaw,
  framesProcessed: 1,
  meta: { rollDeg: enh.quality.rollDeg, rollOk: enh.quality.rollOk },
});

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
    function px(canvas: HTMLCanvasElement, nx: number) { return nx * canvas.width; }
function py(canvas: HTMLCanvasElement, ny: number) { return ny * canvas.height; }

function drawClinicalGuides(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, ls: Landmark[]) {
  // Eje medio (entre ojos externos)
  const L = ls[33], R = ls[263];
  if (!L || !R) return;
  const midx = (L.x + R.x) / 2;

  ctx.save();
  ctx.lineWidth = 2;

  // 1) Eje medio (rojo)
  ctx.strokeStyle = "rgba(255,80,80,0.9)";
  ctx.beginPath();
  ctx.moveTo(px(canvas, midx), 0);
  ctx.lineTo(px(canvas, midx), canvas.height);
  ctx.stroke();

  // 2) Línea de boca (naranja)
  const ML = ls[61], MR = ls[291];
  if (ML && MR) {
    ctx.strokeStyle = "rgba(255,160,50,0.95)";
    ctx.beginPath();
    ctx.moveTo(px(canvas, ML.x), py(canvas, ML.y));
    ctx.lineTo(px(canvas, MR.x), py(canvas, MR.y));
    ctx.stroke();
  }

  // 3) Aperturas de ojos (azul)
  const pairs = [[159,145],[386,374]] as const; // (sup, inf) left/right
  ctx.strokeStyle = "rgba(80,160,255,0.95)";
  for (const [up, down] of pairs) {
    const U = ls[up], D = ls[down];
    if (U && D) {
      ctx.beginPath();
      ctx.moveTo(px(canvas, U.x), py(canvas, U.y));
      ctx.lineTo(px(canvas, D.x), py(canvas, D.y));
      ctx.stroke();
    }
  }

  // 4) Cejas: línea vertical hasta centro de ojo (morado)
  const browIdx = [105, 334]; // ápices aprox
  const eyeCenters = [
    [(33+133+159+145)/4, (33+133+159+145)/4], // solo marcador; no se usa directamente
  ];
  ctx.strokeStyle = "rgba(180,90,255,0.9)";
  const eyeLC = { x:(ls[33].x+ls[133].x+ls[159].x+ls[145].x)/4, y:(ls[33].y+ls[133].y+ls[159].y+ls[145].y)/4 };
  const eyeRC = { x:(ls[362].x+ls[263].x+ls[386].x+ls[374].x)/4, y:(ls[362].y+ls[263].y+ls[386].y+ls[374].y)/4 };
  const browL = ls[105], browR = ls[334];
  if (browL) {
    ctx.beginPath();
    ctx.moveTo(px(canvas, browL.x), py(canvas, browL.y));
    ctx.lineTo(px(canvas, eyeLC.x), py(canvas, eyeLC.y));
    ctx.stroke();
  }
  if (browR) {
    ctx.beginPath();
    ctx.moveTo(px(canvas, browR.x), py(canvas, browR.y));
    ctx.lineTo(px(canvas, eyeRC.x), py(canvas, eyeRC.y));
    ctx.stroke();
  }

  // 5) Región dental (verde): rectángulo aproximado
  const upper = ls[13], lower = ls[14];
  if (ML && MR && upper && lower) {
    const x1 = px(canvas, Math.min(ML.x, MR.x));
    const x2 = px(canvas, Math.max(ML.x, MR.x));
    const y1 = py(canvas, upper.y);
    const y2 = py(canvas, lower.y);
    ctx.strokeStyle = "rgba(60,200,120,0.9)";
    ctx.strokeRect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
  }

  ctx.restore();
}

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
      if (clinicalMode) {
  drawClinicalGuides(ctx, canvas, landmarks as any);
}

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
<button
  onClick={() => setClinicalMode((v) => !v)}
  className={`px-3 py-1 rounded border ${clinicalMode ? "bg-purple-600 text-white" : "bg-transparent text-purple-300"}`}
>
  {clinicalMode ? "Modo clínico: ON" : "Modo clínico: OFF"}
</button>

        <div className="ml-auto text-sm">
          {loadError ? <span className="text-red-500">{loadError}</span> : ready ? "Todo listo para ayudarte" : "Cargando modelo..."}
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

      {/* ▸ Panel clínico (una sola vez, debajo, abarcando 2 columnas) */}
      {clinicalMode && scores?.clinical && (
        <div className="md:col-span-2 rounded-xl border p-6 bg-card/60 mt-2">
          <div className="flex items-start justify-between gap-4">
            <h4 className="font-semibold">Modo clínico</h4>

            {/* Alertas rápidas */}
            <div className="flex flex-wrap gap-2 text-xs">
              {!scores.meta?.rollOk && (
                <span className="border rounded-full px-2 py-0.5 text-amber-300 border-amber-500/40">
                  Cabeza inclinada {scores.meta?.rollDeg}°
                </span>
              )}
              {scores.clinical.smileLikely && (
                <span className="border rounded-full px-2 py-0.5 text-emerald-300 border-emerald-500/40">
                  Sonrisa detectada (área dental activa)
                </span>
              )}
              {scores.clinical.browAsym > 0.05 && (
                <span className="border rounded-full px-2 py-0.5 text-fuchsia-300 border-fuchsia-500/40">
                  Ceño / elevación de ceja (asimetría)
                </span>
              )}
            </div>
          </div>

          {/* Métricas en rejilla */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 text-sm">
            {/* Ojos */}
            <div><span className="text-muted-foreground">Apertura ojo izq:</span> {scores.clinical.eyesApertL}</div>
            <div><span className="text-muted-foreground">Apertura ojo der:</span> {scores.clinical.eyesApertR}</div>
            <div><span className="text-muted-foreground">Δ aperturas ojos:</span> {scores.clinical.eyesApertDiff}</div>

            {/* Boca */}
            <div><span className="text-muted-foreground">Ángulo de boca:</span> {scores.clinical.mouthAngleDeg}°</div>
            <div><span className="text-muted-foreground">Desnivel comisuras (norm):</span> {scores.clinical.mouthVertDiff}</div>
            <div className={scores.clinical.smileLikely ? "text-emerald-300" : "text-muted-foreground"}>
              Área dental (proxy): {scores.clinical.dentalProxy} {scores.clinical.smileLikely ? "— sonrisa" : ""}
            </div>

            {/* Cejas */}
            <div><span className="text-muted-foreground">Ceja-ojo izq (norm):</span> {scores.clinical.browEyeDistL}</div>
            <div><span className="text-muted-foreground">Ceja-ojo der (norm):</span> {scores.clinical.browEyeDistR}</div>
            <div><span className="text-muted-foreground">Asimetría cejas (norm):</span> {scores.clinical.browAsym}</div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            * “norm” = normalizado por distancia interpupilar. Con Modo clínico ON verás las guías (eje medio, línea de boca, aperturas, ceja-ojo y región dental) sobre la imagen.
          </p>
        </div>
      )}
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
