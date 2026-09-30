"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Printer, QrCode, Plus } from "lucide-react";
import { api, write, timestamp } from "@/lib/client";
import { useLive } from "@/hooks/use-live";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Product, Lookup } from "@/types";
import { Heading, State, StockBadge, Pager, useData } from "./shared";
import { HistoryPage } from "./management";
export function ProductsPage({ low = false }: { low?: boolean }) {
  const { version } = useLive();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [rack, setRack] = useState("");
  const [stock, setStock] = useState(low ? "low" : "");
  const [active, setActive] = useState("1");
  const [sort, setSort] = useState("name");
  const [direction, setDirection] = useState("asc");
  const [page, setPage] = useState(1);
  useEffect(() => {
    setQ(new URLSearchParams(location.search).get("q") || "");
  }, []);
  const params = new URLSearchParams({
    q,
    page: String(page),
    sort,
    direction,
    active,
    ...(category ? { category_id: category } : {}),
    ...(rack ? { location_id: rack } : {}),
    ...(stock ? { stock } : {}),
  });
  const list = useData<{ items: Product[]; total: number }>(
    "products?" + params,
    version,
  );
  const categories = useData<Lookup[]>("categories");
  const locations = useData<Lookup[]>("locations");
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };
  return (
    <>
      <Heading
        title={low ? "Stock menipis" : "Data barang"}
        description={
          low
            ? "Barang dengan stok 2 atau kurang. Segera periksa kebutuhan pengadaan."
            : "Kelola barang, lokasi rak, dan label QR Anda."
        }
      >
        <Button variant="outline" asChild>
          <a href={"/api/products?" + params + "&export=csv"}>
            <Download />
            Export CSV
          </a>
        </Button>
        <Button asChild>
          <Link href="/products/new">
            <Plus />
            Tambah Barang
          </Link>
        </Button>
      </Heading>
      <Card className="mb-5">
        <div className="flex flex-wrap gap-3">
          <Input
            aria-label="Cari barang"
            placeholder="Cari nama, SKU, rak…"
            className="max-w-xs"
            value={q}
            onChange={(e) => reset(() => setQ(e.target.value))}
          />
          <select
            aria-label="Kategori"
            value={category}
            onChange={(e) => reset(() => setCategory(e.target.value))}
          >
            <option value="">Semua kategori</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Rak"
            value={rack}
            onChange={(e) => reset(() => setRack(e.target.value))}
          >
            <option value="">Semua rak</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter stok"
            value={stock}
            onChange={(e) => reset(() => setStock(e.target.value))}
          >
            <option value="">Semua stok</option>
            <option value="low">Menipis ≤ 2</option>
            <option value="zero">Habis</option>
            <option value="safe">Aman &gt; 2</option>
          </select>
          <select
            aria-label="Status barang"
            value={active}
            onChange={(e) => reset(() => setActive(e.target.value))}
          >
            <option value="1">Aktif</option>
            <option value="0">Nonaktif</option>
            <option value="all">Semua status</option>
          </select>
          <select
            aria-label="Urutkan"
            value={sort}
            onChange={(e) => reset(() => setSort(e.target.value))}
          >
            <option value="name">Nama</option>
            <option value="sku">SKU</option>
            <option value="stock">Stock</option>
            <option value="location">Rak</option>
          </select>
          <select
            aria-label="Arah urutan"
            value={direction}
            onChange={(e) => reset(() => setDirection(e.target.value))}
          >
            <option value="asc">Naik</option>
            <option value="desc">Turun</option>
          </select>
        </div>
      </Card>
      <State
        error={list.error}
        loading={!list.data && list.loading}
        empty={list.data?.items.length === 0}
      />
      {!!list.data?.items.length && (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  "SKU",
                  "Nama Barang",
                  "Kategori",
                  "Stock",
                  "Satuan",
                  "Rak",
                  "Status",
                  "Action",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((p) => (
                <tr key={p.id}>
                  <td className="text-xs text-slate-500">{p.sku}</td>
                  <td className="font-semibold">
                    <Link href={"/products/" + p.id}>{p.name}</Link>
                  </td>
                  <td className="text-xs">{p.category_name}</td>
                  <td
                    className={`font-bold ${p.stock <= 2 ? "text-red-700" : ""}`}
                  >
                    {p.stock}
                  </td>
                  <td className="text-xs">{p.unit}</td>
                  <td>
                    <span className="bg-slate-100 rounded px-2 py-1 text-xs">
                      {p.location_code}
                    </span>
                  </td>
                  <td>
                    {p.active ? (
                      <StockBadge stock={p.stock} />
                    ) : (
                      <span className="text-xs text-slate-400">NONAKTIF</span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-3 text-xs text-emerald-700">
                      <Link href={"/products/" + p.id}>Detail</Link>
                      <Link href={`/products/${p.id}/edit`}>Edit</Link>
                      <Link
                        aria-label={"QR " + p.name}
                        href={`/products/${p.id}/qr`}
                      >
                        <QrCode size={16} />
                      </Link>
                      <button
                        className="text-slate-500"
                        onClick={async () => {
                          if (
                            !confirm(
                              `${p.active ? "Nonaktifkan" : "Aktifkan"} ${p.name}?`,
                            )
                          )
                            return;
                          try {
                            await write(
                              "products/" + p.id,
                              { active: !p.active },
                              "PATCH",
                            );
                            toast.success("Status barang diperbarui");
                            void list.reload();
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        {p.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {list.data && (
        <Pager page={page} total={list.data.total} onPage={setPage} />
      )}
    </>
  );
}
export function ProductForm({ id }: { id?: number }) {
  const router = useRouter();
  const categories = useData<Lookup[]>("categories");
  const locations = useData<Lookup[]>("locations");
  const [initial, setInitial] = useState<Product>();
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (id)
      api<Product>("products/" + id)
        .then((p) => {
          setInitial(p);
          setImage(p.image);
        })
        .catch((e) => setError(e.message));
  }, [id]);
  return (
    <>
      <Heading
        title={id ? "Edit barang" : "Tambah barang"}
        description="Satu barang, satu rak aktif, satu QR. Stok awal barang baru adalah 0."
      />
      <State
        error={error || categories.error || locations.error}
        loading={(!!id && !initial) || !categories.data || !locations.data}
      />
      {(!id || initial) && categories.data && locations.data && (
        <form
          key={initial?.id || "new"}
          className="max-w-3xl"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const input = {
              name: String(f.get("name")),
              category_id: Number(f.get("category_id")),
              unit: String(f.get("unit")),
              location_id: Number(f.get("location_id")),
              description: String(f.get("description")),
              image,
              ...(!id ? { sku: String(f.get("sku")) } : {}),
            };
            if (initial && input.location_id !== initial.location_id) {
              const target = locations.data?.find(
                (l) => l.id === input.location_id,
              );
              if (
                !confirm(
                  `Anda akan memindahkan ${initial.name} dari Rak ${initial.location_code} ke Rak ${target?.code}. Lanjutkan?`,
                )
              )
                return;
            }
            setBusy(true);
            try {
              const result = await write<{ id: number }>(
                "products" + (id ? "/" + id : ""),
                input,
                id ? "PATCH" : "POST",
              );
              toast.success(
                id
                  ? "Barang diperbarui"
                  : "Barang dibuat. QR otomatis tersedia.",
              );
              router.push(`/products/${result.id}/qr`);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Card>
            <h2 className="text-base font-semibold mb-5">Informasi barang</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="sku">SKU / Kode Barang</label>
                <Input
                  id="sku"
                  name="sku"
                  required
                  maxLength={64}
                  defaultValue={initial?.sku}
                  disabled={!!id}
                  placeholder="BRG-004"
                />
              </div>
              <div>
                <label htmlFor="name">Nama Barang</label>
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={160}
                  defaultValue={initial?.name}
                />
              </div>
              <div>
                <label htmlFor="category_id">Kategori</label>
                <select
                  id="category_id"
                  name="category_id"
                  className="w-full"
                  required
                  defaultValue={initial?.category_id || ""}
                >
                  <option value="" disabled>
                    Pilih kategori
                  </option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="unit">Satuan</label>
                <Input
                  id="unit"
                  name="unit"
                  required
                  maxLength={20}
                  defaultValue={initial?.unit || "PCS"}
                />
              </div>
              <div>
                <label htmlFor="location_id">Lokasi Rak</label>
                <select
                  id="location_id"
                  name="location_id"
                  className="w-full"
                  required
                  defaultValue={initial?.location_id || ""}
                >
                  <option value="" disabled>
                    Pilih rak
                  </option>
                  {locations.data
                    ?.filter((l) => l.active || l.id === initial?.location_id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} — {l.name}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-slate-400 mt-2">
                  Rak harus tersedia untuk satu barang aktif.
                </p>
              </div>
              <div>
                <label htmlFor="image">Foto (opsional, maks. 1 MB)</label>
                <Input
                  id="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1000000) {
                      toast.error("Ukuran maksimal 1 MB");
                      e.target.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setImage(String(reader.result));
                    reader.readAsDataURL(file);
                  }}
                />
                {image && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={image}
                      alt="Foto barang"
                      className="size-16 object-cover rounded"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setImage(null)}
                    >
                      Hapus foto
                    </Button>
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="description">Deskripsi</label>
                <textarea
                  id="description"
                  name="description"
                  maxLength={5000}
                  className="w-full"
                  defaultValue={initial?.description || ""}
                />
              </div>
            </div>
            <div className="mt-5 p-4 rounded-lg bg-emerald-50 text-emerald-800 text-xs">
              Stok dikelola melalui IN, OUT, atau Stock Adjustment. QR unik
              dibuat otomatis saat barang disimpan.
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Kembali
              </Button>
              <Button disabled={busy || !categories.data || !locations.data}>
                {busy ? "Menyimpan…" : "Simpan Barang"}
              </Button>
            </div>
            <State error={categories.error || locations.error} />
          </Card>
        </form>
      )}
    </>
  );
}
export function ProductDetail({
  id,
  qrOnly = false,
}: {
  id: number;
  qrOnly?: boolean;
}) {
  const {
    data: p,
    error,
    loading,
    reload,
  } = useData<Product>("products/" + id);
  const settings = useData<{ timezone: string }>("settings");
  const [rev, setRev] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!p) return <State error={error} loading={loading} />;
  const src = `/api/products/${id}/qr?v=${rev}`;
  return (
    <>
      <Heading
        title={qrOnly ? "QR barang" : p.name}
        description={`${p.sku} · Rak ${p.location_code}`}
      >
        <Button variant="outline" asChild>
          <Link href={`/products/${id}/edit`}>Edit Barang</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/products">Daftar Barang</Link>
        </Button>
      </Heading>
      <div
        className={qrOnly ? "max-w-lg mx-auto" : "grid lg:grid-cols-2 gap-6"}
      >
        <Card className="print-label text-center">
          <h2 className="font-bold text-xl uppercase">{p.name}</h2>
          <p className="text-sm mt-3">SKU: {p.sku}</p>
          <p className="font-bold mt-1">RAK: {p.location_code}</p>
          <img
            src={src}
            alt={"QR " + p.name}
            className="w-64 h-64 mx-auto my-3"
          />
          <p className="text-[10px] text-slate-400">
            WAREHOUSE · SCAN UNTUK IN / OUT
          </p>
          <div className="no-print flex flex-wrap gap-2 mt-5 justify-center">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer />
              Print QR
            </Button>
            <Button asChild variant="outline">
              <a href={src} download={`${p.sku}-qr.svg`}>
                <Download />
                Download QR
              </a>
            </Button>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={async () => {
                if (
                  !confirm(
                    "Regenerate QR? Label lama tidak berlaku lagi. Cetak dan pasang label baru.",
                  )
                )
                  return;
                setBusy(true);
                try {
                  await write("products/" + id + "/qr");
                  setRev((v) => v + 1);
                  await reload();
                  toast.success("QR baru tersedia. Cetak ulang label.");
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Regenerate QR
            </Button>
          </div>
        </Card>
        {!qrOnly && (
          <Card className="no-print">
            <h2 className="font-semibold mb-5">Informasi persediaan</h2>
            {p.image && (
              <img
                src={p.image}
                alt={p.name}
                className="w-24 h-24 object-cover rounded-lg mb-4"
              />
            )}
            <div className="text-4xl font-bold mb-3">
              {p.stock} <span className="text-sm text-slate-400">{p.unit}</span>
            </div>
            <StockBadge stock={p.stock} />
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              {[
                ["Kategori", p.category_name],
                ["Status", p.active ? "Aktif" : "Nonaktif"],
                ["Rak", p.location_code],
                ["Satuan", p.unit],
                ["Dibuat", timestamp(p.created_at, settings.data?.timezone)],
                [
                  "Diperbarui",
                  timestamp(p.updated_at, settings.data?.timezone),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-400 mb-1">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-slate-500">
              {p.description || "Tidak ada deskripsi."}
            </p>
          </Card>
        )}
      </div>
      {!qrOnly && (
        <div className="no-print mt-8 space-y-8">
          <HistoryPage type="in" productId={id} compact />
          <HistoryPage type="out" productId={id} compact />
        </div>
      )}
    </>
  );
}
