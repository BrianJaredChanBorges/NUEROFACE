// app/simetry/page.tsx
import * as React from "react";
import dynamic from "next/dynamic";
import { HeroSection } from "./heroS"; // heroS exporta named, está bien【:contentReference[oaicite:6]{index=6}】

const UploadMount = dynamic(() => import("./UploadMount"), { ssr: false });

export default function SimetryPage() {
  return (
    <>
      <HeroSection />
      <section className="container w-full py-12">
        <h2 className="text-2xl font-bold mb-4">Sube tus archivos</h2>
        <p className="text-muted-foreground mb-6">
          Adjunta aquí tus imágenes o videos para el análisis de simetría.
        </p>
        <UploadMount />
      </section>
    </>
  );
}
