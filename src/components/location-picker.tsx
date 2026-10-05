"use client";
import { useState } from "react";
import type { LocationLookup } from "@/types";

export function LocationPicker({
  rooms,
  blocks,
  racks,
  locations,
  initialId,
  productId,
}: {
  rooms: LocationLookup[];
  blocks: LocationLookup[];
  racks: LocationLookup[];
  locations: LocationLookup[];
  initialId?: number;
  productId?: number;
}) {
  const initial = locations.find((l) => l.id === initialId);
  const [room, setRoom] = useState(String(initial?.room_id || ""));
  const [block, setBlock] = useState(String(initial?.block_id || ""));
  const [rack, setRack] = useState(String(initial?.rack_id || ""));
  const [position, setPosition] = useState(String(initialId || ""));

  const positions = locations.filter((l) => l.active || l.id === initialId);
  const selected = locations.find((l) => String(l.id) === position);
  const rackPositions = positions.filter((l) => String(l.rack_id) === rack);

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
            {rooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
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
            {blocks
              .filter((item) => String(item.room_id) === room)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  Blok {item.code}
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
            {racks
              .filter((item) => String(item.block_id) === block)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.block_code}.{String(item.rack_number).padStart(2, "0")}
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
            {rackPositions.map((item) => (
              <option
                key={item.id}
                value={item.id}
                disabled={!!item.product_id && item.product_id !== productId}
              >
                {String(item.position_number).padStart(2, "0")}
                {item.product_id && item.product_id !== productId
                  ? ` · Terisi: ${item.product_name}`
                  : " · Tersedia"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs mt-3 text-emerald-700">
        {selected
          ? `${selected.room_name} / ${selected.code}`
          : rack && rackPositions.length === 0
            ? "Rak ini belum memiliki nomor penempatan. Buat posisi melalui menu Lokasi Gudang → Posisi Barang."
            : "Pilih ruangan → blok → rak → posisi."}
      </p>
    </fieldset>
  );
}
