// app/simetry/UploadMount.tsx
"use client";

import * as FileUpload from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";

// Subir un archivo con progreso (XHR para tener e.upload.onprogress)
async function uploadSingleFile(
  file: File,
  {
    onProgress,
    onSuccess,
    onError,
  }: {
    onProgress: (file: File, pct: number) => void;
    onSuccess: (file: File, payload: any) => void;
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
      try {
        if (xhr.status >= 200 && xhr.status < 300) {
          const payload = JSON.parse(xhr.responseText);
          onSuccess(file, payload);
        } else {
          onError(file, new Error(`Upload failed (${xhr.status})`));
        }
      } catch (e: any) {
        onError(file, new Error(e?.message || "Upload parse error"));
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

// Lista de archivos (hook DENTRO del provider)
function FilesList() {
  const files = FileUpload.useFileUpload((s) => Array.from(s.files.keys()));

  return (
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
  );
}

export default function UploadMount() {
  return (
    <FileUpload.Root
      className="space-y-4"
      accept="image/*,video/*"
      multiple
      label="Sube tus archivos"
      maxSize={10 * 1024 * 1024} // 10MB
      onUpload={async (acceptedFiles, { onProgress, onSuccess, onError }) => {
        // sube en paralelo con progreso individual
        await Promise.all(
          acceptedFiles.map((file) =>
            uploadSingleFile(file, {
              onProgress,
              onSuccess: (f, payload) => {
                // payload = fila insertada en "images" (incluye url si bucket público)
                onSuccess(f);
                // Aquí podrías disparar un toast con payload.url o guardar en estado si lo necesitas
                // console.log("Subido:", payload);
              },
              onError,
            })
          )
        );
      }}
      onFileReject={(file, message) => {
        console.warn("Rechazado:", file.name, message);
      }}
    >
      <FileUpload.Dropzone className="h-40 w-full rounded-lg border-2 border-dashed flex items-center justify-center text-sm text-muted-foreground">
        Arrastra y suelta aquí (jpg, png, jpeg, mov) o haz clic para seleccionar
      </FileUpload.Dropzone>

      <FileUpload.Trigger asChild>
        <Button variant="secondary">Dame mi analisis!</Button>
      </FileUpload.Trigger>

      <FilesList />

      <FileUpload.Clear asChild forceMount>
        <Button variant="outline">Limpiar lista</Button>
      </FileUpload.Clear>
    </FileUpload.Root>
  );
}
