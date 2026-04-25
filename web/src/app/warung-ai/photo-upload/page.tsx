"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Camera, Sparkles, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { StatusBar } from "@/components/services/StatusBar";
import { PageNav } from "@/components/warung-ai/PageNav";
import { uploadOnboardingImage, ApiError } from "@/queries/onboarding";

export default function PhotoUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(f: File) {
    const url = URL.createObjectURL(f);
    setPreview(url);
    setFile(f);
    setError(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function handleSubmit() {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const items = await uploadOnboardingImage(file);
      sessionStorage.setItem("warungAi.draftItems", JSON.stringify(items));
      // TODO: router.push("/warung-ai/menu-verify") once verify page exists
      console.log("AI draft items:", items);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 415
            ? "Unsupported image format. Use JPG, PNG, WebP, or GIF."
            : err.status === 400
            ? "Please upload a photo first."
            : err.status === 502
            ? "Our AI is temporarily unavailable. Please try again."
            : "Couldn't read the menu. Please try again."
        );
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[390px] mx-auto min-h-screen flex flex-col relative">
        <div className="bg-white px-5 pt-4">
          <StatusBar time="9:41" show4G={false} theme="dark" />
        </div>

        <PageNav title="Add via Photo" backHref="/warung-ai/choose-method" />

        <div className={`flex flex-col gap-5 px-5 pt-6 ${preview ? "pb-32" : "pb-8"}`}>
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
            className="w-full h-60 rounded-2xl bg-[#F8F9FE] border-2 border-[#BBDEFB] flex flex-col items-center justify-center gap-3 transition-colors hover:bg-[#EFF4FD] overflow-hidden relative group"
          >
            {preview ? (
              <>
                <div className="relative w-full h-full rounded-2xl overflow-hidden">
                  <Image src={preview} alt="Uploaded menu" fill className="object-cover" />
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-[#1565C0] text-xs font-semibold shadow-sm">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Replace photo
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-[#E3F2FD] flex items-center justify-center">
                  <ImagePlus className="w-8 h-8 text-[#1565C0]" />
                </div>
                <span className="text-[#1565C0] text-sm font-semibold">Tap to upload a photo</span>
                <span className="text-[#9E9E9E] text-xs">JPG, PNG up to 10MB</span>
              </>
            )}
          </button>

          {!preview && (
            <>
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
            </>
          )}

          {preview && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="self-center inline-flex items-center gap-1.5 text-[#1565C0] text-sm font-semibold hover:underline"
            >
              <RefreshCw className="w-4 h-4" />
              Replace photo
            </button>
          )}
        </div>

        {/* Sticky submit CTA — visible after upload */}
        {preview && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#F0F0F0] px-5 py-4 pb-8 animate-in slide-in-from-bottom-4 fade-in duration-300">
            {error && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5 text-[#B91C1C] text-[13px] leading-snug">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-14 rounded-[28px] bg-[#1565C0] text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-[#1565C0]/90 transition-colors shadow-[0_8px_24px_-8px_rgba(21,101,192,0.45)] disabled:bg-[#1565C0]/70 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Reading menu…
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Read Menu with AI
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
