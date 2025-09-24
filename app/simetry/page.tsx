import * as React from "react";
import ClientOnlyUpload from "./ClientOnlyUpload";
import { HeroSection } from "./heroS";

export default function SimetryPage() {
  return (
    <>
      <section className="container w-full py-12">
        <h2 className="text-2xl font-bold mb-4">Sube tus archivos</h2>
        <p className="text-muted-foreground mb-6">
          Adjunta aquí tus imágenes para el análisis de simetría.
        </p>
        <ClientOnlyUpload />
      </section>
      <HeroSection />
    </>
  );
}
