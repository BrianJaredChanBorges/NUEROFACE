"use client";

import dynamic from "next/dynamic";

const UploadMount = dynamic(() => import("./UploadMount"), { ssr: false });

export default function ClientOnlyUpload() {
  return <UploadMount />;
}
