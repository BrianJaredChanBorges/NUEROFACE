// app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

// ENV requeridas (server):
// NEXT_PUBLIC_SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY  (NO exponer en cliente)
// (Opcional) NEXT_PUBLIC_SUPABASE_BUCKET        -> por defecto "uploads"
// (Opcional) NEXT_PUBLIC_SUPABASE_IMAGES_TABLE  -> por defecto "images"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "uploads";
const TABLE = process.env.NEXT_PUBLIC_SUPABASE_IMAGES_TABLE || "images";

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // bytes para Storage (evita Buffer)
    const bytes = new Uint8Array(await file.arrayBuffer());

    // path con fecha + uuid
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const id = crypto.randomUUID();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const objectPath = `${yyyy}/${mm}/${dd}/${id}.${ext}`;

    // 1) Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // URL pública (si el bucket es público)
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(objectPath);
    const publicUrl = publicUrlData.publicUrl;

    // 2) Insertar metadatos en la tabla
    const { data: row, error: insertError } = await supabase
      .from(TABLE)
      .insert({
        id,                  // uuid
        name: file.name,     // nombre original
        path: objectPath,    // ruta en el bucket
        url: publicUrl,      // URL pública (o null si bucket privado)
        size: file.size,     // bytes
        type: file.type,     // MIME
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      // Opcional: limpiar el objeto si falla el insert
      // await supabase.storage.from(BUCKET).remove([objectPath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(row);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message || "Failed to upload" },
      { status: 500 }
    );
  }
}
