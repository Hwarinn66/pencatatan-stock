"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ScanLine,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { write, ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Product } from "@/types";
import type { Html5Qrcode } from "html5-qrcode";
type ScanResult = {
  product: Product;
  transaction_number: string;
  mode: string;
  status: string;
};
export function Scanner() {
  const [mode, setMode] = useState<"IN" | "OUT" | null>(null);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult>();
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const [attempt, setAttempt] = useState(0);
  const scanner = useRef<Html5Qrcode | null>(null);
  const gate = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const unlockAudio = () => {
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {}
  };
  const feedback = (success: boolean) => {
    try {
      const ctx = audio.current;
      if (ctx) {
        const oscillator = ctx.createOscillator(),
          gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.frequency.value = success ? 1050 : 240;
        gain.gain.value = 0.12;
        oscillator.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
        oscillator.stop(ctx.currentTime + 0.15);
      }
      navigator.vibrate?.(success ? 70 : [70, 50, 70]);
    } catch {}
  };
  const send = async (token: string) => {
    if (!mode || gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      try {
        scanner.current?.pause(true);
      } catch {}
      const value = await write<ScanResult>("scan", {
        qr_token: token.trim(),
        mode,
      });
      setResult(value);
      feedback(true);
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.code === "VALIDATION_ERROR"
          ? "QR TIDAK TERDAFTAR — QR harus berisi token UUID barang."
          : err.message,
      );
      feedback(false);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!mode) return;
    let disposed = false;
    let instance: Html5Qrcode | undefined;
    setCameraError("");
    setCamera(false);
    gate.current = false;
    const run = async () => {
      try {
        if (!window.isSecureContext)
          throw new Error(
            "Kamera membutuhkan HTTPS yang dipercaya HP. HTTP melalui IP LAN tidak mendukung kamera. Ikuti setup HTTPS di README.",
          );
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Browser tidak mendukung kamera. Gunakan browser modern atau scanner fisik.",
          );
        const { Html5Qrcode } = await import("html5-qrcode");
        if (disposed) return;
        instance = new Html5Qrcode("qr-reader");
        scanner.current = instance;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 230, height: 230 } },
          (text) => {
            if (!disposed) void send(text);
          },
          () => {},
        );
        if (disposed) {
          await instance.stop();
          instance.clear();
        } else setCamera(true);
      } catch (e) {
        if (!disposed) {
          const message = String(e);
          setCameraError(
            /NotAllowed|Permission|denied/i.test(message)
              ? "Izin kamera ditolak. Izinkan kamera pada pengaturan browser lalu coba lagi."
              : /NotFound|device/i.test(message)
                ? "Kamera tidak tersedia. Periksa perangkat Anda."
                : message,
          );
        }
      }
    };
    void run();
    return () => {
      disposed = true;
      if (instance?.isScanning)
        void instance
          .stop()
          .then(() => instance?.clear())
          .catch(() => {});
      scanner.current = null;
    };
    // Scanner is rebuilt only on an explicit mode change/retry. Database locks decide whether a scan is accepted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, attempt]);
  const next = () => {
    setResult(undefined);
    setError("");
    setManual("");
    gate.current = false;
    try {
      scanner.current?.resume();
    } catch {
      setAttempt((v) => v + 1);
    }
  };
  return (
    <main className="min-h-dvh bg-slate-950 text-white p-5 max-w-lg mx-auto">
      <header className="flex items-center justify-between py-4 mb-8">
        <div className="flex items-center gap-2 font-bold tracking-wide text-sm">
          <ScanLine className="text-emerald-400" />
          WAREHOUSE SCANNER
        </div>
        <button
          aria-label="Logout"
          onClick={async () => {
            try {
              await write("auth/logout");
              location.href = "/login?next=/scanner";
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <LogOut size={18} />
        </button>
      </header>
      {!mode ? (
        <>
          <p className="text-xs tracking-[.2em] text-slate-500 mb-3">
            MULAI SCANNING
          </p>
          <h1 className="text-3xl font-semibold mb-3">Pilih mode transaksi</h1>
          <p className="text-slate-400 text-sm mb-8">
            Scan QR pada rak. Quantity dan approval dilakukan di komputer.
          </p>
          {(["IN", "OUT"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                unlockAudio();
                setMode(m);
              }}
              className={`w-full text-left p-6 rounded-xl mb-4 border ${m === "IN" ? "bg-emerald-950 border-emerald-700" : "bg-slate-900 border-slate-700"}`}
            >
              {m === "IN" ? (
                <ArrowDownToLine className="text-emerald-400 mb-5" />
              ) : (
                <ArrowUpFromLine className="text-blue-400 mb-5" />
              )}
              <span className="text-xl font-bold block">
                {m === "IN" ? "+ BARANG MASUK" : "− BARANG KELUAR"}
              </span>
              <span className="text-xs text-slate-400 mt-2 block">
                Mode {m} · Scan label QR barang
              </span>
            </button>
          ))}
        </>
      ) : (
        <>
          <div
            className={`rounded-xl p-4 flex justify-between items-center mb-5 ${mode === "IN" ? "bg-emerald-900" : "bg-blue-900"}`}
          >
            <div>
              <p className="text-[10px] tracking-widest opacity-60 mb-1">
                MODE AKTIF
              </p>
              <h1 className="font-bold">
                {mode === "IN" ? "BARANG MASUK / IN" : "BARANG KELUAR / OUT"}
              </h1>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setMode(null);
                setResult(undefined);
                setError("");
                gate.current = false;
              }}
            >
              Ganti Mode
            </Button>
          </div>
          <div
            id="qr-reader"
            className="rounded-xl overflow-hidden bg-black min-h-64"
          />
          {!camera && !cameraError && (
            <p className="text-center text-slate-400 text-sm mt-4">
              Mengaktifkan kamera belakang…
            </p>
          )}
          {cameraError && (
            <div
              role="alert"
              className="p-4 mt-4 rounded-lg bg-amber-950 text-amber-100 text-sm"
            >
              <p>{cameraError}</p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => setAttempt((v) => v + 1)}
              >
                <RefreshCw />
                Coba kamera lagi
              </Button>
            </div>
          )}
          {busy && (
            <p role="status" className="mt-5 text-center">
              Memvalidasi QR…
            </p>
          )}
          {result && (
            <div
              role="status"
              className="bg-emerald-950 border border-emerald-700 rounded-xl p-5 mt-5"
            >
              <CheckCircle2 className="text-emerald-400 mb-3" />
              <h2 className="font-bold">QR BERHASIL DIBACA</h2>
              <p className="text-lg mt-3">{result.product.name}</p>
              <p className="text-xs text-emerald-100/70 mt-2">
                SKU: {result.product.sku}
                <br />
                Rak: {result.product.location_code}
                <br />
                Stok: {result.product.stock} {result.product.unit}
                <br />
                Mode: {result.mode}
                <br />
                {result.transaction_number}
              </p>
              <p className="mt-4 font-bold text-xs text-emerald-300">
                MENUNGGU PROSES DI KOMPUTER
              </p>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mt-5 p-5 rounded-xl bg-red-950 border border-red-800"
            >
              <AlertTriangle className="mb-3 text-red-400" />
              <p className="text-sm leading-6">{error}</p>
            </div>
          )}
          {(result || error) && (
            <Button className="w-full mt-4" onClick={next}>
              Scan berikutnya
            </Button>
          )}
          <p className="text-center text-xs text-slate-500 mt-5">
            Scan tidak langsung mengubah stok.
          </p>
          <details className="mt-8 text-xs text-slate-500">
            <summary>Input token / scanner fisik untuk pengujian</summary>
            <form
              className="flex gap-2 mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                unlockAudio();
                void send(manual);
              }}
            >
              <Input
                aria-label="QR token"
                className="text-slate-900"
                placeholder="UUID QR token"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <Button disabled={busy || !!result || !!error}>Kirim</Button>
            </form>
          </details>
        </>
      )}
      <footer className="mt-12 text-center text-xs text-slate-600">
        <Link href="/">Buka dashboard komputer →</Link>
      </footer>
    </main>
  );
}
