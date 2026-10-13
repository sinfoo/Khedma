import s from "./styles";

/**
 * A Sidi Bou Said door in CSS: lime-washed arch, studded blue leaf, saffron light behind.
 * Ajar by default (it swings open as it scrolls into view); `closed` for the 404 page.
 */
export function Door({ closed = false, className = "" }: { closed?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={`relative aspect-[3/4] ${className}`}>
      {/* lime-washed frame */}
      <div className={`${s.arch} absolute inset-0 bg-[#efe9dc] p-[7%] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]`}>
        {/* the opening: warm light from inside */}
        <div
          className={`${s.arch} relative h-full w-full overflow-hidden`}
          style={{ background: "radial-gradient(120% 80% at 70% 70%, #ffd58a 0%, #f5b14c 35%, #8a4e00 100%)" }}
        >
          <div className={`${s.arch} ${s.doorLeaf} ${closed ? s.doorClosed : ""} absolute inset-0 bg-[#0b5cad]`}>
            <div className={`${s.studs} ${s.arch} absolute inset-[9%] border-2 border-white/25`} />
            <div className="absolute left-1/2 top-[9%] bottom-0 w-[3px] -translate-x-1/2 bg-[#083f78]" />
            <div className="absolute right-[18%] top-[55%] aspect-square w-[9%] min-w-2 rounded-full border-[3px] border-[#f5b14c]" />
          </div>
        </div>
      </div>
      {closed && <div className="absolute inset-x-[10%] -bottom-1 h-1 rounded-full bg-[#f5b14c] blur-[3px]" />}
    </div>
  );
}

/** Medina rooftops: houses, domes and a minaret, with a few lit windows. */
export function Skyline({ className = "" }: { className?: string }) {
  const houses: [number, number, number][] = [
    // x, width, top
    [0, 90, 62], [84, 70, 48], [150, 110, 70], [255, 60, 40], [310, 120, 58], [425, 80, 74], [500, 95, 44],
    [590, 130, 66], [715, 70, 52], [780, 120, 72], [895, 90, 46], [980, 110, 64], [1085, 60, 56], [1140, 120, 70],
    [1255, 85, 50], [1335, 105, 66],
  ];
  const domes: [number, number, number][] = [
    // cx, top of house, radius
    [205, 70, 26], [545, 44, 22], [655, 66, 30], [1035, 64, 24], [1300, 50, 20],
  ];
  const windows: [number, number][] = [
    [120, 84], [282, 70], [365, 82], [528, 76], [748, 80], [930, 74], [1180, 90], [1370, 88],
  ];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 120"
      preserveAspectRatio="xMidYMax slice"
      className={`pointer-events-none block w-full ${className}`}
    >
      <g fill="#080b11">
        {houses.map(([x, w, y]) => (
          <rect key={x} x={x} y={y} width={w} height={120 - y} />
        ))}
        {domes.map(([cx, y, r]) => (
          <path key={cx} d={`M${cx - r} ${y + 1}a${r} ${r} 0 0 1 ${r * 2} 0z`} />
        ))}
        {/* minaret */}
        <rect x="846" y="10" width="26" height="110" />
        <rect x="840" y="28" width="38" height="6" />
        <path d="M849 10a10 10 0 0 1 20 0z" />
        <rect x="858" y="-6" width="2" height="8" />
      </g>
      <g fill="#f5b14c">
        {windows.map(([x, y], i) => (
          <path key={x} d={`M${x} ${y + 14}v-9a4 4 0 0 1 8 0v9z`} opacity={i % 3 === 0 ? 0.95 : 0.6} />
        ))}
        <path d="M855 60v-8a4 4 0 0 1 8 0v8z" opacity="0.9" />
      </g>
    </svg>
  );
}
