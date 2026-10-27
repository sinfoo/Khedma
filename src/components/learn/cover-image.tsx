"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A course's own picture laid over its generated cover. If it fails to load (also before hydration, when onError
 * never fires), it disappears and the generated cover shows. Badge art (Microsoft's square SVGs) is shown whole.
 */
export function CoverImage({ src, contain }: { src: string; contain: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, []);
  if (broken) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote covers from many catalog hosts; next/image would need every host listed
    <img
      ref={ref}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`absolute inset-0 h-full w-full ${contain ? "object-contain p-5" : "object-cover"}`}
    />
  );
}
