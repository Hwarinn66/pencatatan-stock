import { cookies } from "next/headers";
import { cookieName, requireUser, session } from "@/lib/auth";
import { rows } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    await requireUser();
    const token = (await cookies()).get(cookieName)!.value;
    let ended = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let last = "";
        let retrying = false;
        let heartbeat = 0;
        const stop = () => {
          if (ended) return;
          ended = true;
          if (timer) clearTimeout(timer);
          try {
            controller.close();
          } catch {}
        };
        req.signal.addEventListener("abort", stop, { once: true });
        const send = (data: string) => {
          if (!ended) controller.enqueue(encoder.encode(data));
        };
        const tick = async () => {
          try {
            if (ended) return;
            if (!(await session(token))) {
              send("event: expired\ndata: {}\n\n");
              stop();
              return;
            }
            const [result] = await rows<{ version: number; count: number }>(
              "SELECT COALESCE(MAX(id),0) version, COUNT(*) count FROM stock_events",
            );
            // AUTO_INCREMENT allocation order is not commit order: include COUNT
            // so a late commit with a smaller ID still triggers a refresh.
            const revision = `${result.version}:${result.count}`;
            if (revision !== last || retrying) {
              last = revision;
              retrying = false;
              send(`id: ${revision}\nevent: update\ndata: {"version":${result.version},"count":${result.count}}\n\n`);
            }
            if (++heartbeat % 15 === 0) send(": heartbeat\n\n");
          } catch {
            retrying = true;
            send("event: retrying\ndata: {}\n\n");
          } finally {
            if (!ended) timer = setTimeout(tick, 1000);
          }
        };
        send("retry: 3000\n\n");
        void tick();
      },
      cancel() {
        ended = true;
        if (timer) clearTimeout(timer);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
