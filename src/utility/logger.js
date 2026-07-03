import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve /logs directory relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Go up two levels: src/utils → src → project root → logs/
const LOGS_DIR = path.join(__dirname, "../../logs");

// Create the directory if it does not already exist (first run)
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Helpers

/** Returns a full ISO timestamp: 2026-04-08T14:32:00.000Z */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Appends a single line to a log file.
 * Uses the async fire-and-forget variant so it never blocks the event loop.
 * @param {string} filename  Basename, e.g. "app.log"
 * @param {string} line      Text to append (newline is added automatically)
 */
function writeLine(filename, line) {
  const filePath = path.join(LOGS_DIR, filename);
  fs.appendFile(filePath, line + "\n", (err) => {
    if (err) console.error(`[${timestamp()}] [ERROR] [Logger] Could not write to log file: ${err.message}`);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Log an informational message.
 * Written to:  app.log  +  stdout
 *
 * @param {string} message
 * @param {string} [context]  Optional label, e.g. "AircraftPoller"
 */
export function logInfo(message, context = "App") {
  const line = `[${timestamp()}] [INFO] [${context}] ${message}`;
  console.log(line);
  writeLine("app.log", line);
}

/**
 * Log an error message.
 * Written to:  error.log  +  app.log  +  stderr
 *
 * @param {string|Error} message
 * @param {string} [context]
 */
export function logError(message, context = "App") {
  let label = context;
  let details = "";

  if (context instanceof Error) {
    label = "App";
    details = `\n  Error: ${context.message}\n  Stack: ${context.stack}`;
  } else if (context && typeof context === "object") {
    label = "App";
    try {
      details = `\n  Details: ${JSON.stringify(context)}`;
    } catch {
      details = `\n  Details: ${String(context)}`;
    }
  }

  const text = message instanceof Error
    ? `${message.message}\n  Stack: ${message.stack}`
    : `${String(message)}${details}`;

  const line = `[${timestamp()}] [ERROR] [${label}] ${text}`;
  console.error(line);
  writeLine("error.log", line);
  writeLine("app.log",   line);
}

/**
 * Express middleware — logs every HTTP request.
 * Written to:  access.log  +  stdout
 *
 * Usage in server.js:
 *   import { requestLogger } from "./utils/logger.js";
 *   app.use(requestLogger);
 */
export function requestLogger(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const ms      = Date.now() - start;
    const status  = res.statusCode;
    const method  = req.method;
    const url     = req.originalUrl || req.url;
    const ip      = req.ip || req.socket?.remoteAddress || "-";

    // Colour-code status in terminal only
    const statusLabel =
      status >= 500 ? `\x1b[31m${status}\x1b[0m` :  // red
      status >= 400 ? `\x1b[33m${status}\x1b[0m` :  // yellow
      status >= 300 ? `\x1b[36m${status}\x1b[0m` :  // cyan
                      `\x1b[32m${status}\x1b[0m`;    // green

    // Plain text for the file (no ANSI codes)
    const fileLine  = `[${timestamp()}] [ACCESS] ${method} ${url} ${status} ${ms}ms — ${ip}`;
    const termLine  = `[${timestamp()}] [ACCESS] ${method} ${url} ${statusLabel} ${ms}ms — ${ip}`;
    
    writeLine("access.log", fileLine);

    // Errors also go to error log
    if (status >= 500) {
      writeLine("error.log", fileLine);
    }
  });

  next();
}
