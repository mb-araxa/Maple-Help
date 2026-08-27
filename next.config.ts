import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

let supabaseHostname: string | undefined;
try {
  supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;
} catch {
  supabaseHostname = undefined;
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/chamados-anexos/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
