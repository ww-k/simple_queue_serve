import { expect, test } from "@rstest/core";

import QueueService from "./src/index";
import Task from "./src/task";

test("[Task] sync task completes to done", async () => {
    const t = new Task({ excutor: () => {} });
    await t.start();
    // start() does not await the inner executor promise, wait a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(t.state).toBe("done");
});

test("[Task] async task completes", async () => {
    const t = new Task({
        excutor: () => new Promise((res) => setTimeout(res, 20)),
    });
    await t.start();
    await new Promise((r) => setTimeout(r, 40));
    expect(t.state).toBe("done");
});

test("[Task] start twice throws", async () => {
    const t = new Task({ excutor: () => {} });
    await t.start();
    let threw = false;
    try {
        await t.start();
    } catch {
        threw = true;
    }
    expect(threw).toBe(true);
});

test("[QueueService] queue starts and changes state", () => {
    const q = new QueueService();
    q.start();
    expect(q.state).toBe("running");
});

test("[QueueService] push tasks and progress events", async () => {
    const q = new QueueService({ concurrency: 2, interval: 10 });
    const results: string[] = [];

    q.on("progress", (p) => {
        // collect running and pending counts
        results.push(`r${p.running}p${p.pending}`);
        console.log(p);
    });

    q.push(new Task({ excutor: () => new Promise((r) => setTimeout(r, 20)) }));
    q.push(new Task({ excutor: () => new Promise((r) => setTimeout(r, 20)) }));
    q.push(new Task({ excutor: () => new Promise((r) => setTimeout(r, 20)) }));

    q.start();

    await new Promise((r) => setTimeout(r, 100));

    // At least one progress event should have been emitted
    expect(results.length).toBeGreaterThan(0);
});
