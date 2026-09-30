"use client";
import { useEffect, useState } from "react";
export function useLive() {
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let live = false;
    const events = new EventSource("/api/events");
    events.onopen = () => {
      live = true;
      setConnected(true);
    };
    events.addEventListener("update", () => {
      live = true;
      setConnected(true);
      setVersion((v) => v + 1);
    });
    events.addEventListener("expired", () => {
      location.href = "/login";
    });
    events.addEventListener("retrying", () => {
      live = false;
      setConnected(false);
    });
    events.onerror = () => {
      live = false;
      setConnected(false);
    };
    const fallback = setInterval(() => {
      if (!live) setVersion((v) => v + 1);
    }, 5000);
    return () => {
      events.close();
      clearInterval(fallback);
    };
  }, []);
  return { version, connected };
}
