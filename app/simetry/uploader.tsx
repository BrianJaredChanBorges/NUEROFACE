"use client";

import * as React from "react";
import * as FileUpload from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";

// Subida de 1 archivo con progreso usando XMLHttpRequest (permite onprogress)
async function uploadSingleFile(
  file: File,
  {
    onProgress,
    onSuccess,
    onError,
  }: {
    onProgress: (file: File, pct: number) => void;
    onSuccess: (file: File) => void;
    onError: (file: File, err: Error) => void;
  }
) {
  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(file, pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onSuccess(file);
      } else {
        onError(file, new Error(`Upload failed (${xhr.status})`));
      }
      resolve();
    };

    xhr.onerror = () => {
      onError(file, new Error("Network error"));
      resolve();
    };

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export default function Uploader() {
  const files = FileUpload.useFileUpload((s) => Array.from(s.files.keys()));

  return (
    <FileUpload.Root
      className="space-y-4"
      label="Subir archivos"
      accept="image/*,video/*"
      multiple
      maxSize={10 * 1024 * 1024} // 10 MB por archivo (ajústalo a tu gusto)
      onUpload={async (acceptedFiles, { onProgress, onSuccess, onError }) => {
        // Sube en paralelo con progreso individual
        await Promise.all(
          acceptedFiles.map((file) =>
            uploadSingleFile(file, { onProgress, onSuccess, onError })
          )
        );
      }}
      onFileReject={(file, message) => {
        console.warn("Rechazado:", file.name, message);
      }}
    >
      {/* Zona de drop / click */}
      <FileUpload.Dropzone className="h-40 w-full rounded-lg border-2 border-dashed flex items-center justify-center text-sm text-muted-foreground">
        Arrastra y suelta aquí, o haz clic para seleccionar
      </FileUpload.Dropzone>

      {/* Disparador opcional (botón) */}
      <FileUpload.Trigger asChild>
        <Button variant="secondary">Elegir archivos</Button>
      </FileUpload.Trigger>

      {/* Lista de archivos */}
      <FileUpload.List className="space-y-2">
        {files.map((file) => (
          <FileUpload.Item key={file.name} value={file} className="p-3 gap-3">
            <FileUpload.ItemPreview />
            <FileUpload.ItemMetadata />
            <FileUpload.ItemProgress />
            <FileUpload.ItemDelete asChild>
              <Button variant="destructive" size="sm" className="ml-auto">
                Eliminar
              </Button>
            </FileUpload.ItemDelete>
          </FileUpload.Item>
        ))}
      </FileUpload.List>

      {/* Limpiar todo */}
      <FileUpload.Clear asChild forceMount>
        <Button variant="outline">Limpiar lista</Button>
      </FileUpload.Clear>
    </FileUpload.Root>
  );
}
