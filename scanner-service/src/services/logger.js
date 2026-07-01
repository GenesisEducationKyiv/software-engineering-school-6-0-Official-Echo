import { logger as defLogger } from "@ghchk/common/services/logger";

export const logger = defLogger.child({ server: "scanner" });
