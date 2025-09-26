// app/simetry/page.tsx
"use client";

import React from "react";
import FaceAnalyzer from "./components/FaceAnalyzer";
import { HeroSection } from "./heroS";

export default function SimetryPage() {
  const abrirNuevaVentana = () => {
    const features = [
      "popup=yes",
      "noopener",
      "noreferrer",
      "width=1024",
      "height=800",
      "resizable=yes",
    ].join(",");
    window.open("/simetry/live", "simetry-live", features);
  };

  return (
    <main className="p-6">
      <HeroSection />

      <section className="my-8 max-w-4xl mx-auto space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={abrirNuevaVentana}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground hover:opacity-90"
          >
            Abrir análisis en una nueva ventana
          </button>
          <span className="text-sm text-muted-foreground">
            También puedes analizar aquí mismo debajo 👇
          </span>
        </div>

        <FaceAnalyzer />
      </section>
    </main>
  );
}
