import { logger as defLogger } from "@ghchk/common/services/logger.js";

export const logger = defLogger.child({ server: "scanner" });
