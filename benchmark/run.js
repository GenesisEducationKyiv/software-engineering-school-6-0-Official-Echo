/*
 * Start the app, preferably using docker compose, before running the benchmark
 * Options:
 *   HTTP_URL      base URL of the HTTP server  (default: http://localhost:3000)
 *   GRPC_ADDR     host:port of the gRPC server (default: localhost:50051)
 *   CONCURRENCY   parallel requests per wave   (default: 50)
 *   DURATION_MS   how long to run each test    (default: 10000 ms)
 */

import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import axios from "axios";
import { createWriteStream, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const HTTP_URL = process.env.HTTP_URL ?? "http://localhost:3000";
const GRPC_ADDR = process.env.GRPC_ADDR ?? "localhost:50051";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50);
const DURATION_MS = Number(process.env.DURATION_MS ?? 10_000);

const PAYLOAD = { email: "bench@example.com", repo: "torvalds/linux" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` as fast as possible with `CONCURRENCY` parallel workers for
 * `DURATION_MS` milliseconds, counting successes and failures.
 *
 * @param {() => Promise<void>} fn  One request to send
 * @returns {{ ok: number, err: number, durationMs: number }}
 */
async function hammer(fn) {
	let ok = 0;
	let err = 0;
	let running = true;

	const deadline = sleep(DURATION_MS).then(() => {
		running = false;
	});

	async function worker() {
		while (running) {
			try {
				await fn();
				ok += 1;
			} catch {
				err += 1;
			}
		}
	}

	await Promise.race([
		deadline,
		Promise.all(Array.from({ length: CONCURRENCY }, worker)),
	]);

	running = false;
	await deadline;

	return { ok, err, durationMs: DURATION_MS };
}

function summarise(label, { ok, err, durationMs }) {
	const total = ok + err;
	const rps = (total / (durationMs / 1000)).toFixed(1);
	const errRate = total ? ((err / total) * 100).toFixed(1) : "0.0";
	return { label, total, ok, err, rps, errRate };
}

function printTable(rows) {
	const cols = ["Transport", "Req total", "OK", "Errors", "Req/s", "Err %"];
	const data = rows.map((r) => [
		r.label,
		r.total,
		r.ok,
		r.err,
		r.rps,
		`${r.errRate}%`,
	]);

	const widths = cols.map((c, i) =>
		Math.max(c.length, ...data.map((r) => String(r[i]).length))
	);

	const line = widths.map((w) => "─".repeat(w + 2)).join("┼");
	const fmt = (row) =>
		row.map((v, i) => String(v).padStart(widths[i])).join("  │  ");

	console.log(`\n┌─${line.replaceAll("┼", "─┬─")}─┐`);
	console.log(`│  ${fmt(cols)}  │`);
	console.log(`├─${line}─┤`);
	for (const row of data) {
		console.log(`│  ${fmt(row)}  │`);
	}
	console.log(`└─${line.replaceAll("┼", "─┴─")}─┘\n`);
}

function saveResults(results) {
	const dir = join(import.meta.dirname, "results");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, `run-${Date.now()}.json`);
	const stream = createWriteStream(path);
	stream.end(
		JSON.stringify({ config: { CONCURRENCY, DURATION_MS }, results }, null, 2)
	);
	console.log(`Results saved → ${path}`);
}

async function benchRest() {
	const http = axios.create({
		baseURL: HTTP_URL,
		validateStatus: () => true,
	});

	return hammer(() => http.post("/api/subscribe", PAYLOAD));
}

async function benchGrpc() {
	const protoPackage = fileURLToPath(
		import.meta.resolve("@ghchk/proto/package.json")
	);
	const protoRoot = dirname(protoPackage);
	const protoPath = join(protoRoot, "notifier", "v1", "notifier.proto");
	const pkg = loadPackageDefinition(
		loadSync(protoPath, {
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true,
		})
	).notifier.v1;

	const stub = new pkg.SubscriptionService(
		GRPC_ADDR,
		credentials.createInsecure()
	);

	const call = () =>
		new Promise((resolve, reject) =>
			stub.Subscribe(PAYLOAD, (err, res) => (err ? reject(err) : resolve(res)))
		);

	const result = await hammer(call);
	stub.close();
	return result;
}

console.log(`  HTTP:        ${HTTP_URL}`);
console.log(`  gRPC:        ${GRPC_ADDR}`);
console.log(`  Concurrency: ${CONCURRENCY} workers`);
console.log(`  Duration:    ${DURATION_MS / 1000}s per transport`);
console.log("");

console.log("Testing REST …");
const restResult = await benchRest();
console.log(`    done — ${restResult.ok + restResult.err} requests\n`);

await sleep(1000);

console.log("Testing gRPC …");
const grpcResult = await benchGrpc();
console.log(`    done — ${grpcResult.ok + grpcResult.err} requests\n`);

const rows = [summarise("REST", restResult), summarise("gRPC", grpcResult)];

printTable(rows);

const restRps = parseFloat(rows[0].rps);
const grpcRps = parseFloat(rows[1].rps);
const delta = (((grpcRps - restRps) / restRps) * 100).toFixed(0);
console.log(
	`gRPC is ~${delta}% ${grpcRps > restRps ? "faster" : "slower"} than REST in this run.\n`
);

saveResults(rows);
