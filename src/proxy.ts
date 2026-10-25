import { NextResponse, type NextRequest } from "next/server";
import { isLoopbackHost, isSameOrigin } from "@/lib/sources/http";

/**
 * One gate for every request. Khedma has no accounts, so it serves only this computer (Host must be localhost,
 * which also defeats DNS rebinding), and its API refuses cross-site calls (CSRF). The extension endpoint is
 * exempt from the same-site rule: the extension's requests are cross-site, and its own token guards it.
 */
export function proxy(req: NextRequest) {
  if (!isLoopbackHost(req.headers.get("host"))) return new NextResponse("Khedma only answers on this computer (http://localhost:3000).", { status: 403 });
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/") && !path.startsWith("/api/extension/") && !isSameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  return NextResponse.next();
}
