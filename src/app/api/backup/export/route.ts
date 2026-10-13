import { exportBackup } from "../backup";

/** Full JSON backup as a download. Contains DB rows only, never environment values. */
export async function GET() {
  const body = JSON.stringify(exportBackup(), null, 1);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="khedma-backup-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
