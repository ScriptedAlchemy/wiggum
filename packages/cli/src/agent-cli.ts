export interface ParsedAgentServeArgs {
  help: boolean;
  portRaw?: string;
  hostnameRaw?: string;
}

export function printAgentServeHelp(): void {
  console.log(`
Usage: wiggum agent serve [--port <1-65535>] [--hostname <host>]
       wiggum agent serve [-p <1-65535>] [-H <host>]

Options:
  --port <port>            Server port (must be 1-65535)
  -p <port>                Alias for --port
  --port=<port>            Equals-form alias for --port
  -p=<port>                Equals-form alias for --port
  --hostname <host>        Server hostname
  --hostname=<host>        Equals-form server hostname
  --host <host>            Alias for --hostname
  --host=<host>            Equals-form alias for --hostname
  -H <host>                Alias for --hostname
  -H=<host>                Equals-form alias for --hostname
  --help, -h               Show serve-specific help
`);
}

export function extractGlobalAutofixArgs(args: string[]): {
  autofix: boolean;
  filteredArgs: string[];
} {
  let autofix = false;
  let filteredArgs = [...args];
  const passthroughBoundary = args.indexOf('--');
  const parseBoundary = passthroughBoundary === -1 ? args.length : passthroughBoundary;
  const parseSlice = args.slice(0, parseBoundary);
  const commandIndex = parseSlice.findIndex((arg) => !arg.startsWith('-'));
  const commandCandidate = commandIndex >= 0 ? parseSlice[commandIndex] : undefined;
  const filteredPrefix: string[] = [];

  for (let i = 0; i < parseBoundary; i++) {
    const arg = args[i];
    const isBeforeCommandToken = commandIndex === -1 || i < commandIndex;
    const shouldTreatAsGlobalAutofix = isBeforeCommandToken || commandCandidate !== 'agent';
    if (arg === '--autofix' && shouldTreatAsGlobalAutofix) {
      autofix = true;
      continue;
    }
    filteredPrefix.push(arg);
  }

  if (parseBoundary < args.length) {
    filteredArgs = [...filteredPrefix, ...args.slice(parseBoundary)];
  } else {
    filteredArgs = filteredPrefix;
  }

  return {
    autofix,
    filteredArgs,
  };
}

export function parseAgentServeArgs(argsArr: string[]): ParsedAgentServeArgs {
  const parsed: ParsedAgentServeArgs = {
    help: false,
  };

  for (let i = 0; i < argsArr.length; i++) {
    const arg = argsArr[i];
    if (arg === '--help' || arg === '-h') {
      return {
        help: true,
      };
    }
    if (arg === '--port' || arg === '-p') {
      const value = argsArr[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --port');
      }
      if (parsed.portRaw !== undefined) {
        throw new Error('Duplicate --port option provided.');
      }
      parsed.portRaw = value;
      i++;
      continue;
    }
    if (arg.startsWith('-p=')) {
      if (parsed.portRaw !== undefined) {
        throw new Error('Duplicate --port option provided.');
      }
      parsed.portRaw = arg.slice('-p='.length);
      continue;
    }
    if (arg.startsWith('--port=')) {
      if (parsed.portRaw !== undefined) {
        throw new Error('Duplicate --port option provided.');
      }
      parsed.portRaw = arg.slice('--port='.length);
      continue;
    }
    if (arg === '--hostname' || arg === '-H') {
      const value = argsArr[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --hostname');
      }
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = value;
      i++;
      continue;
    }
    if (arg.startsWith('-H=')) {
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = arg.slice('-H='.length);
      continue;
    }
    if (arg === '--host') {
      const value = argsArr[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --hostname');
      }
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = value;
      i++;
      continue;
    }
    if (arg.startsWith('--hostname=')) {
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = arg.slice('--hostname='.length);
      continue;
    }
    if (arg.startsWith('--host=')) {
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = arg.slice('--host='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown serve option: ${arg}`);
    }
    throw new Error(`Unexpected serve argument: ${arg}`);
  }

  return parsed;
}
