//app\api\upload\route.ts

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs"; // Asegura entorno Node para usar fs

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
// Evita Buffer: pasa un ArrayBufferView

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  
    const filepath = path.join(uploadDir, filename);
await writeFile(filepath, new Uint8Array(bytes));


    const url = `/uploads/${filename}`;
    return NextResponse.json({ url, name: file.name, size: file.size, type: file.type });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}
