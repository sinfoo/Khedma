"use client";

import { usePathname } from "next/navigation";

type Shape = "today" | "board" | "grid" | "list";

/** Pages whose layout is not "a header and a list": the skeleton takes their shape, so nothing jumps on arrival. */
const SHAPES: Record<string, Shape> = {
  "/app": "today",
  "/app/pipeline": "board",
  "/app/discover": "grid",
  "/app/insights": "grid",
  "/app/learn": "grid",
};

const Bar = ({ className }: { className: string }) => <div className={`skeleton ${className}`} />;
const blocks = (n: number, className: string) => Array.from({ length: n }, (_, i) => <Bar key={i} className={`rounded-[14px] ${className}`} />);

/** Route-level placeholder. The header block has the height of a real PageHeader (title and one lead line). */
export function PageSkeleton() {
  const shape = SHAPES[usePathname()] ?? "list";
  if (shape === "today")
    return (
      <>
        <div className="mb-7 flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <Bar className="mb-2.5 h-3.5 w-[180px]" />
            <Bar className="h-[35px] w-[300px] max-w-full rounded-[9px] sm:h-[42px]" />
            <Bar className="mt-3.5 h-4 w-[240px] max-w-full" />
          </div>
          <Bar className="h-[90px] w-[330px] max-w-full rounded-[14px]" />
        </div>
        <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <Bar className="mb-1 h-6 w-[120px]" />
            {blocks(4, "h-[120px]")}
          </div>
          <div className="flex flex-col gap-4">{blocks(3, "h-[200px]")}</div>
        </div>
      </>
    );
  return (
    <>
      <div className="mb-[18px]">
        <Bar className="h-[31px] w-[240px] max-w-full rounded-[9px] sm:h-[35px]" />
        <Bar className="mb-1 mt-2.5 h-3.5 w-[420px] max-w-[80%]" />
      </div>
      {shape === "board" ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">{blocks(4, "h-[150px] lg:h-[420px]")}</div>
      ) : shape === "grid" ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">{blocks(6, "h-[200px]")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          <Bar className="h-11 rounded-[12px]" />
          {blocks(5, "h-[76px]")}
        </div>
      )}
    </>
  );
}
