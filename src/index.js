import { config } from "dotenv";
config({ quiet: true });

import { startServer } from "./server.js";

startServer().catch((err) => {
	console.error("[Fatal] Failed to start server:", err);
	process.exit(1);
});
