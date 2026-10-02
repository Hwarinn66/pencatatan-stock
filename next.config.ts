import type { NextConfig } from "next";

function devOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).hostname;
      } catch {
        return value;
      }
    });

  return Array.from(new Set(["10.144.121.148", ...configured]));
}

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mysql2", "bcryptjs"],
  allowedDevOrigins: devOrigins(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
    ];
  },
};
export default config;
