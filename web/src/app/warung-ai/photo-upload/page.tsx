"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Camera } from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import { PageNav } from "@/components/warung-ai/PageNav";

export default function PhotoUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleFile(file: File) {
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col">
        <div className="bg-white px-5 pt-4">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>

        <PageNav title="Add via Photo" backHref="/warung-ai/choose-method" />

        <div className="flex flex-col gap-5 px-5 pt-6 pb-8">
          {/* Heading */}
          <div className="flex flex-col gap-2">
            <h1 className="text-[#1A1A2E] text-[20px] font-bold max-w-[310px] leading-snug">
              Take a photo or upload your menu
            </h1>
            <p className="text-[#757575] text-sm leading-[1.4]">
              Our AI will automatically read the item names and prices.
            </p>
          </div>

          {/* Upload box */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleChange}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="w-full h-60 rounded-2xl bg-[#F8F9FE] border-2 border-[#BBDEFB] flex flex-col items-center justify-center gap-3 transition-colors hover:bg-[#EFF4FD]"
          >
            {preview ? (
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <Image src={preview} alt="Uploaded menu" fill className="object-cover" />
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-[#E3F2FD]" />
                <ImagePlus className="w-8 h-8 text-[#1565C0] -mt-2" />
                <span className="text-[#1565C0] text-sm font-semibold">Tap to upload a photo</span>
                <span className="text-[#9E9E9E] text-xs">JPG, PNG up to 10MB</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#E0E0E0]" />
            <span className="text-[#9E9E9E] text-sm">or</span>
            <div className="flex-1 h-px bg-[#E0E0E0]" />
          </div>

          {/* Camera button */}
          <button className="w-full h-[52px] rounded-[26px] bg-[#1565C0] text-white flex items-center justify-center gap-2.5 text-[15px] font-semibold hover:bg-[#1565C0]/90 transition-colors">
            <Camera className="w-5 h-5" />
            Open Camera
          </button>
        </div>
      </div>
    </div>
  );
}
