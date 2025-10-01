// app/simetry/page.tsx
"use client";

import React from "react";
import FaceAnalyzer from "./components/FaceAnalyzer";
import { HeroSection } from "./heroS";

export default function SimetryPage() {
  
  return (
    <main className="p-6">
      <HeroSection />

      <section className="my-8 max-w-4xl mx-auto space-y-4">
        <div className="flex flex-wrap gap-3 items-center"> 
        </div>
        <FaceAnalyzer />
      </section>
    </main>
  );
}
