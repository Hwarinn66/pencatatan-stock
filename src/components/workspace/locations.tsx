"use client";
import { useState } from "react";
import { toast } from "sonner";
import { write } from "@/lib/client";
import type { LocationLookup } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Heading, State, Pager, useData } from "./shared";
type Kind = "rooms" | "blocks" | "racks" | "locations";
const titles: Record<Kind, string> = {
  rooms: "Ruangan",
  blocks: "Blok",
  racks: "Rak",
  locations: "Posisi Barang",
};
export function LocationManager() {
  const rooms = useData<LocationLookup[]>("rooms"),
    blocks = useData<LocationLookup[]>("blocks"),
    racks = useData<LocationLookup[]>("racks"),
    positions = useData<LocationLookup[]>("locations");
  const [kind, setKind] = useState<Kind>("locations");
  const [editing, setEditing] = useState<LocationLookup>();
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [page, setPage] = useState(1);
  const [parent, setParent] = useState("");
  const all = { rooms, blocks, racks, locations: positions };
  const list = all[kind];
  const data = list.data || [];
  const filtered = data.filter(
    (x) =>
      (!filterRoom ||
        (kind === "rooms" ? x.id : x.room_id) === Number(filterRoom)) &&
      [x.name, x.code, x.room_name, x.product_name, x.legacy_code]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const reset = () => {
    setEditing(undefined);
    setParent("");
    setFormKey((v) => v + 1);
  };
  const selectedRack = racks.data?.find((r) => r.id === Number(parent));
  const selectedBlock = blocks.data?.find((b) => b.id === Number(parent));
  const suggestedRack =
    Math.max(
      0,
      ...(racks.data || [])
        .filter((r) => r.block_id === Number(parent))
        .map((r) => r.rack_number || 0),
    ) + 1;
  return (
    <>
      <Heading
        title="Lokasi gudang"
        description="Ruangan 1–5 → Blok A–D → Rak 01–25 → posisi barang yang Anda input sendiri."
      />
      <div
        className="flex flex-wrap gap-2 mb-5"
        role="tablist"
        aria-label="Tingkat lokasi"
      >
        {(Object.keys(titles) as Kind[]).map((k) => (
          <Button
            key={k}
            role="tab"
            aria-selected={kind === k}
            variant={kind === k ? "default" : "outline"}
            onClick={() => {
              setKind(k);
              setPage(1);
              reset();
            }}
          >
            {titles[k]}
          </Button>
        ))}
      </div>
      <div className="grid xl:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="flex gap-3 mb-4">
            <Input
              aria-label="Cari lokasi"
              placeholder="Cari kode, ruangan, barang…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Filter ruangan"
              value={filterRoom}
              onChange={(e) => {
                setFilterRoom(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua ruangan</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <State
            error={list.error}
            loading={!list.data && list.loading}
            empty={!!list.data && !filtered.length}
          />
          {!!filtered.length && (
            <Card className="p-0 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th>{kind === "rooms" ? "Ruangan" : "Kode / Nama"}</th>
                    {kind !== "rooms" && <th>Ruangan</th>}
                    {kind === "locations" && (
                      <>
                        <th>Barang / Status</th>
                        <th>Kode lama</th>
                      </>
                    )}
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((page - 1) * 20, page * 20).map((x) => (
                    <tr key={x.id}>
                      <td>
                        <strong>{x.code || x.name}</strong>
                        {x.code && (
                          <p className="text-slate-400 mt-1">{x.name}</p>
                        )}
                      </td>
                      {kind !== "rooms" && <td>{x.room_name}</td>}
                      {kind === "locations" && (
                        <>
                          <td>
                            {x.active
                              ? x.product_name || "Tersedia"
                              : "Nonaktif"}
                          </td>
                          <td>{x.legacy_code || "—"}</td>
                        </>
                      )}
                      <td>
                        <div className="flex gap-3">
                          <button
                            className="text-emerald-700"
                            onClick={() => {
                              setEditing(x);
                              setParent(
                                String(
                                  kind === "blocks"
                                    ? x.room_id
                                    : kind === "racks"
                                      ? x.block_id
                                      : kind === "locations"
                                        ? x.rack_id
                                        : "",
                                ),
                              );
                              setFormKey((v) => v + 1);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="text-red-700"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Hapus ${x.code || x.name}? Lokasi yang digunakan tidak dapat dihapus.`,
                                )
                              )
                                return;
                              setBusy(true);
                              try {
                                await write(kind + "/" + x.id, {}, "DELETE");
                                await Promise.all(
                                  Object.values(all).map((x) => x.reload()),
                                );
                                toast.success("Lokasi dihapus");
                                reset();
                              } catch (e) {
                                toast.error((e as Error).message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <Pager page={page} total={filtered.length} onPage={setPage} />
        </div>
        <Card className="h-fit">
          <h2 className="text-base font-bold mb-4">
            {editing ? "Edit" : "Tambah"} {titles[kind]}
          </h2>
          <form
            key={`${kind}-${formKey}`}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const name = String(f.get("name"));
              const input: Record<string, unknown> = { name };
              if (kind === "blocks") {
                input.room_id = Number(parent);
                input.code = String(f.get("code"));
              }
              if (kind === "racks") {
                input.block_id = Number(parent);
                input.rack_number = Number(f.get("number"));
              }
              if (kind === "locations") {
                input.rack_id = Number(parent);
                input.position_number = Number(f.get("number"));
                input.description = String(f.get("description"));
                input.active = f.get("active") === "on";
              }
              setBusy(true);
              try {
                await write(
                  kind + (editing ? "/" + editing.id : ""),
                  input,
                  editing ? "PATCH" : "POST",
                );
                await Promise.all(Object.values(all).map((x) => x.reload()));
                reset();
                toast.success("Lokasi disimpan");
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {kind !== "rooms" && (
              <div className="mb-4">
                <label htmlFor="parent-location">
                  {kind === "blocks"
                    ? "Ruangan"
                    : kind === "racks"
                      ? "Blok"
                      : "Rak"}
                </label>
                <select
                  id="parent-location"
                  required
                  className="w-full"
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                >
                  <option value="">
                    Pilih{" "}
                    {kind === "blocks"
                      ? "ruangan"
                      : kind === "racks"
                        ? "blok"
                        : "rak"}
                  </option>
                  {(kind === "blocks"
                    ? rooms.data
                    : kind === "racks"
                      ? blocks.data
                      : racks.data
                  )?.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.room_name ? x.room_name + " / " : ""}
                      {x.code || x.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {kind === "blocks" && (
              <div className="mb-4">
                <label htmlFor="block-code">Kode blok</label>
                <Input
                  id="block-code"
                  name="code"
                  required
                  pattern="[A-Za-z]{1,20}"
                  maxLength={20}
                  placeholder="A"
                  defaultValue={editing?.code}
                />
                <p className="text-[11px] text-slate-400 mt-2">
                  Gunakan huruf. Kode blok unik di dalam ruangan yang dipilih, sehingga Blok A boleh ada di setiap ruangan.
                </p>
              </div>
            )}
            {(kind === "racks" || kind === "locations") && (
              <div className="mb-4">
                <label htmlFor="position-number">
                  {kind === "racks" ? "Nomor rak" : "Nomor penempatan"}
                </label>
                <Input
                  key={`${parent}-${formKey}`}
                  id="position-number"
                  name="number"
                  type="number"
                  min={1}
                  max={999999}
                  step={1}
                  required
                  defaultValue={
                    editing
                      ? kind === "racks"
                        ? editing.rack_number
                        : editing.position_number
                      : kind === "racks"
                        ? suggestedRack
                        : undefined
                  }
                />
                <p className="text-[11px] mt-2 text-emerald-700">
                  {kind === "locations"
                    ? `Rak ${selectedRack?.code || "—"} · ketik nomor penempatan yang benar-benar digunakan.`
                    : `Blok ${selectedBlock?.code || "—"} · penomoran rak dimulai dari 01 untuk setiap blok.`}
                </p>
              </div>
            )}
            <label htmlFor="location-name">Nama / keterangan singkat</label>
            <Input
              id="location-name"
              name="name"
              required
              maxLength={100}
              defaultValue={editing?.name}
              placeholder={
                kind === "locations"
                  ? "Posisi 01"
                  : kind === "racks"
                    ? "Rak 01"
                    : kind === "blocks"
                      ? "Blok A"
                      : "Ruangan 1"
              }
              className="mb-4"
            />
            {kind === "locations" && (
              <>
                <label htmlFor="location-description">Deskripsi</label>
                <textarea
                  id="location-description"
                  name="description"
                  className="w-full mb-4"
                  defaultValue={editing?.description || ""}
                />
                <label className="flex gap-2 mb-4">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing ? !!editing.active : true}
                  />
                  Posisi aktif
                </label>
              </>
            )}
            <div className="flex gap-2">
              <Button disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>
              {editing && (
                <Button type="button" variant="outline" onClick={reset}>
                  Batal
                </Button>
              )}
            </div>
            <State
              error={
                rooms.error || blocks.error || racks.error || positions.error
              }
            />
            <p className="text-xs text-slate-400 mt-5">
              Ruangan 1–5, Blok A–D, dan Rak 01–25 sudah disiapkan. Tambahkan posisi hanya saat diperlukan. Posisi yang sudah ditempati barang aktif tidak dapat dipakai barang lain.
            </p>
          </form>
        </Card>
      </div>
    </>
  );
}
