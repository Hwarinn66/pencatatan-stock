"use client";
import { useState } from "react";
import type { LocationLookup } from "@/types";
export function LocationPicker({
  locations,
  initialId,
  productId,
}: {
  locations: LocationLookup[];
  initialId?: number;
  productId?: number;
}) {
  const initial = locations.find((l) => l.id === initialId);
  const [room, setRoom] = useState(String(initial?.room_id || ""));
  const [block, setBlock] = useState(String(initial?.block_id || ""));
  const [rack, setRack] = useState(String(initial?.rack_id || ""));
  const [position, setPosition] = useState(String(initialId || ""));
  const choices = locations.filter((l) => l.active || l.id === initialId);
  const unique = (
    items: LocationLookup[],
    field: "room_id" | "block_id" | "rack_id",
  ) => [...new Map(items.map((l) => [l[field], l])).values()];
  const selected = locations.find((l) => String(l.id) === position);
  return (
    <fieldset className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
      <legend className="px-2 text-xs font-semibold">
        Lokasi penempatan barang
      </legend>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="product-room">Ruangan</label>
          <select
            id="product-room"
            className="w-full"
            required
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              setBlock("");
              setRack("");
              setPosition("");
            }}
          >
            <option value="">Pilih ruangan</option>
            {unique(choices, "room_id").map((l) => (
              <option key={l.room_id} value={l.room_id}>
                {l.room_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="product-block">Blok</label>
          <select
            id="product-block"
            className="w-full"
            required
            disabled={!room}
            value={block}
            onChange={(e) => {
              setBlock(e.target.value);
              setRack("");
              setPosition("");
            }}
          >
            <option value="">Pilih blok</option>
            {unique(
              choices.filter((l) => String(l.room_id) === room),
              "block_id",
            ).map((l) => (
              <option key={l.block_id} value={l.block_id}>
                Blok {l.block_code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="product-rack">Rak</label>
          <select
            id="product-rack"
            className="w-full"
            required
            disabled={!block}
            value={rack}
            onChange={(e) => {
              setRack(e.target.value);
              setPosition("");
            }}
          >
            <option value="">Pilih rak</option>
            {unique(
              choices.filter((l) => String(l.block_id) === block),
              "rack_id",
            ).map((l) => (
              <option key={l.rack_id} value={l.rack_id}>
                {l.block_code}.{String(l.rack_number).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="location_id">Nomor penempatan</label>
          <select
            id="location_id"
            name="location_id"
            className="w-full"
            required
            disabled={!rack}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="">Pilih posisi</option>
            {choices
              .filter((l) => String(l.rack_id) === rack)
              .map((l) => (
                <option
                  key={l.id}
                  value={l.id}
                  disabled={!!l.product_id && l.product_id !== productId}
                >
                  {String(l.position_number).padStart(2, "0")}
                  {l.product_id && l.product_id !== productId
                    ? ` · Terisi: ${l.product_name}`
                    : " · Tersedia"}
                </option>
              ))}
          </select>
        </div>
      </div>
      <p className="text-xs mt-3 text-emerald-700">
        {selected
          ? `${selected.room_name} / ${selected.code}`
          : "Pilih ruangan → blok → rak → posisi. Buat posisi baru melalui menu Lokasi Gudang."}
      </p>
    </fieldset>
  );
}
