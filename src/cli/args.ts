export interface ParsedArgs {
  config?: string;
  version?: boolean;
  help?: boolean;
}

/**
 * Parses CLI arguments.
 * Supports:
 *   --config=<path> or -c <path>
 *   --version or -v
 *   --help or -h
 */
export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--version" || arg === "-v") {
      result.version = true;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg.startsWith("--config=")) {
      result.config = arg.substring("--config=".length);
    } else if (arg === "-c") {
      // Look at the next argument
      if (i + 1 < args.length) {
        result.config = args[i + 1];
        i++; // skip next arg as it is consumed as config value
      } else {
        throw new Error("Missing value for option -c");
      }
    } else {
      // Unknown argument
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

/**
 * Displays command line usage instructions.
 */
export function printUsage(): void {
  console.log(`
Usage: DataBridge [options]

Options:
  -c, --config=<path>    Specify the path to the config.json file (Required for migration)
  -v, --version          Display the version of the application
  -h, --help             Display this help menu
`);
}
