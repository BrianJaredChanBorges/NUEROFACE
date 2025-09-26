// app/simetry/live/page.tsx
"use client";

import React from "react";
import FaceAnalyzer from "../components/FaceAnalyzer";

export default function LiveSimetryPage() {
  return (
    <main className="min-h-dvh p-4 md:p-8">
      <header className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold">Análisis en vivo</h1>
        <p className="text-muted-foreground">
          Permite el acceso a tu cámara para evaluar tu simetría facial en tiempo real.
        </p>
      </header>

      <section className="mx-auto max-w-3xl">
        <FaceAnalyzer />
      </section>
    </main>
  );
}
