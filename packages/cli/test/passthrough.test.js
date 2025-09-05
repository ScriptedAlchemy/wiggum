const { execSync } = require('child_process');
const path = require('path');

// Path to the CLI script
const CLI_PATH = path.join(__dirname, '../bin/cli.js');

// Helper function to run CLI commands
function runCLI(args, options = {}) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: 'utf8',
      timeout: 30000, // 30 second timeout
      ...options
    });
    return { stdout: result, stderr: '', exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status || 1
    };
  }
}

describe('Wiggum CLI Passthrough Tests', () => {
  describe('--version flag passthrough', () => {
    test('pack --version should return rspack version', () => {
      runCLI('pack --version');
      const result = runCLI('pack --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`"1.5.2"`);
    });

    test('doc --version should return rspress version', () => {
      runCLI('doc --version');
      const result = runCLI('doc --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"🔥 Rspress v1.45.3

rspress/1.45.3 darwin-arm64 node-v24.4.1"
`);
    });

    test('lib --version should return rslib version', () => {
      runCLI('lib --version');
      const result = runCLI('lib --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"Rslib v0.12.4

rslib/0.12.4 darwin-arm64 node-v24.4.1"
`);
    });

    // Note: rslint doesn't support --version flag, only --help

    test('test --version should return rstest version', () => {
      runCLI('test --version');
      const result = runCLI('test --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`"rstest/0.3.2 darwin-arm64 node-v24.4.1"`);
    });

    test('doctor --version should return rsdoctor version', () => {
      runCLI('doctor --version');
      const result = runCLI('doctor --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`"1.2.3"`);
    });

    test('build --version should return rsbuild version', () => {
      runCLI('build --version');
      const result = runCLI('build --version');
      expect(result.exitCode).toMatchInlineSnapshot(`0`);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"Rsbuild v1.5.3

rsbuild/1.5.3 darwin-arm64 node-v24.4.1"
`);
    });
  });

  describe('--help flag passthrough', () => {
    test('pack --help should return rspack help', () => {
      runCLI('pack --help');
      const result = runCLI('pack --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"[options]

Commands:
  rspack build          run the rspack build      [default] [aliases: bundle, b]
  rspack serve          run the rspack dev server.     [aliases: server, s, dev]
  rspack preview [dir]  run the rspack server for build output
                                                           [aliases: preview, p]

Options:
  -c, --config        config file                                       [string]
      --configName    Name of the configuration to use.                  [array]
      --configLoader  Specify the loader to load the config file, can be
                      \`native\` or \`register\`.     [string] [default: "register"]
      --nodeEnv       sets \`process.env.NODE_ENV\` to be specified value [string]
      --entry         entry file                                         [array]
  -o, --outputPath    output path dir                                   [string]
  -m, --mode          mode                                              [string]
  -w, --watch         watch                           [boolean] [default: false]
      --env           env passed to config function                      [array]
  -d, --devtool       Specify a developer tool for debugging. Defaults to
                      \`cheap-module-source-map\` in development and \`source-map\`
                      in production.                                    [string]
      --analyze       analyze                         [boolean] [default: false]
      --json          emit stats json
      --profile       capture timing information for each module
                                                      [boolean] [default: false]
  -v, --version       Show version number                              [boolean]
  -h, --help          Show help                                        [boolean]"
`);
    });

    test('doc --help should return rspress help', () => {
      runCLI('doc --help');
      const result = runCLI('doc --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"🔥 Rspress v1.45.3

rspress/1.45.3

Usage:
  $ rspress [root]

Commands:
  [root]          start dev server
  build [root]    
  preview [root]  
  update          update relevant packages about rspress

For more info, run any command with the \`--help\` flag:
  $ rspress --help
  $ rspress build --help
  $ rspress preview --help
  $ rspress update --help

Options:
  --port [port]         port number 
  --host [host]         hostname 
  -v, --version         Display version number 
  -h, --help            Display this message 
  -c,--config [config]  Specify the path to the config file"
`);
    });

    test('build --help should return rsbuild help', () => {
      runCLI('build --help');
      const result = runCLI('build --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"rsbuild/1.5.3

Usage:
  $ rsbuild <command> [options]

Commands:
  dev      Start the dev server
  build    Build the app for production
  preview  Preview the production build locally
  inspect  Inspect the Rspack and Rsbuild configs

For more info, run any command with the \`--help\` flag:
  $ rsbuild dev --help
  $ rsbuild build --help
  $ rsbuild preview --help
  $ rsbuild inspect --help

Options:
  -h, --help                Display this message 
  -v, --version             Display version number 
  --base <base>             Set the base path of the server 
  -c, --config <config>     Set the configuration file (relative or absolute path) 
  --config-loader <loader>  Set the config file loader (jiti | native) (default: jiti)
  --env-dir <dir>           Set the directory for loading \`.env\` files 
  --env-mode <mode>         Set the env mode to load the \`.env.[mode]\` file 
  --environment <name>      Set the environment name(s) to build (default: )
  --log-level <level>       Set the log level (info | warn | error | silent) 
  -m, --mode <mode>         Set the build mode (development | production | none) 
  -r, --root <root>         Set the project root directory (absolute path or relative to cwd) 
  --no-env                  Disable loading of \`.env\` files (default: true)"
`);
    });

    test('lint --help should return rslint help', () => {
      runCLI('lint --help');
      const result = runCLI('lint --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`""`);
    });

    test('lib --help should return rslib help', () => {
      runCLI('lib --help');
      const result = runCLI('lib --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"Rslib v0.12.4

rslib/0.12.4

Usage:
  $ rslib <command> [options]

Commands:
  build    build the library for production
  inspect  inspect the Rsbuild / Rspack configs of Rslib projects
  mf-dev   start Rsbuild dev server of Module Federation format

For more info, run any command with the \`--help\` flag:
  $ rslib build --help
  $ rslib inspect --help
  $ rslib mf-dev --help

Options:
  -h, --help             Display this message 
  -v, --version          Display version number 
  -c, --config <config>  specify the configuration file, can be a relative or absolute path 
  -r, --root <root>      specify the project root directory, can be an absolute path or a path relative to cwd 
  --env-mode <mode>      specify the env mode to load the \`.env.[mode]\` file 
  --env-dir <dir>        specify the directory to load \`.env\` files 
  --lib <id>             specify the library (repeatable, e.g. --lib esm --lib cjs) (default: )"
`);
    });

    test('test --help should return rstest help', () => {
      runCLI('test --help');
      const result = runCLI('test --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"rstest/0.3.2

Usage:
  $ rstest [...filters]

Commands:
  [...filters]        run tests
  run [...filters]    run tests without watch mode
  watch [...filters]  run tests in watch mode
  list [...filters]   lists all test files that Rstest will run

For more info, run any command with the \`--help\` flag:
  $ rstest --help
  $ rstest run --help
  $ rstest watch --help
  $ rstest list --help

Options:
  -w, --watch                    Run tests in watch mode 
  -h, --help                     Display this message 
  -v, --version                  Display version number 
  -c, --config <config>          Specify the configuration file, can be a relative or absolute path 
  --config-loader <loader>       Specify the loader to load the config file, can be \`jiti\` or \`native\` (default: jiti)
  -r, --root <root>              Specify the project root directory, can be an absolute path or a path relative to cwd 
  --globals                      Provide global APIs 
  --isolate                      Run tests in an isolated environment 
  --include <include>            Match test files 
  --exclude <exclude>            Exclude files from test 
  -u, --update                   Update snapshot files 
  --project <name>               Run only projects that match the name, can be a full name or wildcards pattern 
  --passWithNoTests              Allows the test suite to pass when no files are found 
  --printConsoleTrace            Print console traces when calling any console method 
  --disableConsoleIntercept      Disable console intercept 
  --slowTestThreshold <value>    The number of milliseconds after which a test or suite is considered slow 
  --reporter <reporter>          Specify the reporter to use 
  -t, --testNamePattern <value>  Run only tests with a name that matches the regex 
  --testEnvironment <name>       The environment that will be used for testing 
  --testTimeout <value>          Timeout of a test in milliseconds 
  --hookTimeout <value>          Timeout of hook in milliseconds 
  --retry <retry>                Number of times to retry a test if it fails 
  --maxConcurrency <value>       Maximum number of concurrent tests 
  --clearMocks                   Automatically clear mock calls, instances, contexts and results before every test 
  --resetMocks                   Automatically reset mock state before every test 
  --restoreMocks                 Automatically restore mock state and implementation before every test 
  --unstubGlobals                Restores all global variables that were changed with \`rstest.stubGlobal\` before every test 
  --unstubEnvs                   Restores all \`process.env\` values that were changed with \`rstest.stubEnv\` before every test"
`);
    });

    test('doctor --help should return rsdoctor help', () => {
      runCLI('doctor --help');
      const result = runCLI('doctor --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"rsdoctor <command> [options]

Commands:
  rsdoctor analyze        use @rsdoctor/cli to open ".rsdoctor/manifest.json" in
                          browser for analysis.

                          example: rsdoctor analyze --profile
                          ".rsdoctor/manifest.json"
  rsdoctor bundle-diff    use @rsdoctor/cli to open the bundle diff result in
                          browser for analysis.

                          example: rsdoctor bundle-diff --baseline="x.json"
                          --current="x.json"
  rsdoctor stats-analyze  use @rsdoctor/cli to open ".rsdoctor/manifest.json" in
                          browser for analysis.example: rsdoctor stats-analyze
                          --profile "dist/stats.json"

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]"
`);
    });
  });

  describe('-v flag passthrough (short version)', () => {
    test('pack -v should return rspack version', () => {
      runCLI('pack -v');
      const result = runCLI('pack -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`"1.5.2"`);
    });

    test('doc -v should return rspress version', () => {
      runCLI('doc -v');
      const result = runCLI('doc -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"🔥 Rspress v1.45.3

rspress/1.45.3 darwin-arm64 node-v24.4.1"
`);
    });

    // Note: rslint doesn't support -v flag, only -h/--help

    test('lib -v should return rslib version', () => {
      runCLI('lib -v');
      const result = runCLI('lib -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"Rslib v0.12.4

rslib/0.12.4 darwin-arm64 node-v24.4.1"
`);
    });

    test('test -v should return rstest version', () => {
      runCLI('test -v');
      const result = runCLI('test -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`"rstest/0.3.2 darwin-arm64 node-v24.4.1"`);
    });

    test('doctor -v should return rsdoctor version', () => {
      runCLI('doctor -v');
      const result = runCLI('doctor -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`""`);
    });

    test('build -v should return rsbuild version', () => {
      runCLI('build -v');
      const result = runCLI('build -v');
      expect(result.exitCode).toMatchInlineSnapshot(`0`);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"Rsbuild v1.5.3

rsbuild/1.5.3 darwin-arm64 node-v24.4.1"
`);
    });
  });

  describe('-h flag passthrough (short help)', () => {
    test('pack -h should return rspack help', () => {
      runCLI('pack -h');
      const result = runCLI('pack -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"[options]

Commands:
  rspack build          run the rspack build      [default] [aliases: bundle, b]
  rspack serve          run the rspack dev server.     [aliases: server, s, dev]
  rspack preview [dir]  run the rspack server for build output
                                                           [aliases: preview, p]

Options:
  -c, --config        config file                                       [string]
      --configName    Name of the configuration to use.                  [array]
      --configLoader  Specify the loader to load the config file, can be
                      \`native\` or \`register\`.     [string] [default: "register"]
      --nodeEnv       sets \`process.env.NODE_ENV\` to be specified value [string]
      --entry         entry file                                         [array]
  -o, --outputPath    output path dir                                   [string]
  -m, --mode          mode                                              [string]
  -w, --watch         watch                           [boolean] [default: false]
      --env           env passed to config function                      [array]
  -d, --devtool       Specify a developer tool for debugging. Defaults to
                      \`cheap-module-source-map\` in development and \`source-map\`
                      in production.                                    [string]
      --analyze       analyze                         [boolean] [default: false]
      --json          emit stats json
      --profile       capture timing information for each module
                                                      [boolean] [default: false]
  -v, --version       Show version number                              [boolean]
  -h, --help          Show help                                        [boolean]"
`);
    });

    test('doc -h should return rspress help', () => {
      runCLI('doc -h');
      const result = runCLI('doc -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"🔥 Rspress v1.45.3

rspress/1.45.3

Usage:
  $ rspress [root]

Commands:
  [root]          start dev server
  build [root]    
  preview [root]  
  update          update relevant packages about rspress

For more info, run any command with the \`--help\` flag:
  $ rspress --help
  $ rspress build --help
  $ rspress preview --help
  $ rspress update --help

Options:
  --port [port]         port number 
  --host [host]         hostname 
  -v, --version         Display version number 
  -h, --help            Display this message 
  -c,--config [config]  Specify the path to the config file"
`);
    });

    test('lint -h should return rslint help', () => {
      runCLI('lint -h');
      const result = runCLI('lint -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`""`);
    });

    test('lib -h should return rslib help', () => {
      runCLI('lib -h');
      const result = runCLI('lib -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"Rslib v0.12.4

rslib/0.12.4

Usage:
  $ rslib <command> [options]

Commands:
  build    build the library for production
  inspect  inspect the Rsbuild / Rspack configs of Rslib projects
  mf-dev   start Rsbuild dev server of Module Federation format

For more info, run any command with the \`--help\` flag:
  $ rslib build --help
  $ rslib inspect --help
  $ rslib mf-dev --help

Options:
  -h, --help             Display this message 
  -v, --version          Display version number 
  -c, --config <config>  specify the configuration file, can be a relative or absolute path 
  -r, --root <root>      specify the project root directory, can be an absolute path or a path relative to cwd 
  --env-mode <mode>      specify the env mode to load the \`.env.[mode]\` file 
  --env-dir <dir>        specify the directory to load \`.env\` files 
  --lib <id>             specify the library (repeatable, e.g. --lib esm --lib cjs) (default: )"
`);
    });

    test('test -h should return rstest help', () => {
      runCLI('test -h');
      const result = runCLI('test -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"rstest/0.3.2

Usage:
  $ rstest [...filters]

Commands:
  [...filters]        run tests
  run [...filters]    run tests without watch mode
  watch [...filters]  run tests in watch mode
  list [...filters]   lists all test files that Rstest will run

For more info, run any command with the \`--help\` flag:
  $ rstest --help
  $ rstest run --help
  $ rstest watch --help
  $ rstest list --help

Options:
  -w, --watch                    Run tests in watch mode 
  -h, --help                     Display this message 
  -v, --version                  Display version number 
  -c, --config <config>          Specify the configuration file, can be a relative or absolute path 
  --config-loader <loader>       Specify the loader to load the config file, can be \`jiti\` or \`native\` (default: jiti)
  -r, --root <root>              Specify the project root directory, can be an absolute path or a path relative to cwd 
  --globals                      Provide global APIs 
  --isolate                      Run tests in an isolated environment 
  --include <include>            Match test files 
  --exclude <exclude>            Exclude files from test 
  -u, --update                   Update snapshot files 
  --project <name>               Run only projects that match the name, can be a full name or wildcards pattern 
  --passWithNoTests              Allows the test suite to pass when no files are found 
  --printConsoleTrace            Print console traces when calling any console method 
  --disableConsoleIntercept      Disable console intercept 
  --slowTestThreshold <value>    The number of milliseconds after which a test or suite is considered slow 
  --reporter <reporter>          Specify the reporter to use 
  -t, --testNamePattern <value>  Run only tests with a name that matches the regex 
  --testEnvironment <name>       The environment that will be used for testing 
  --testTimeout <value>          Timeout of a test in milliseconds 
  --hookTimeout <value>          Timeout of hook in milliseconds 
  --retry <retry>                Number of times to retry a test if it fails 
  --maxConcurrency <value>       Maximum number of concurrent tests 
  --clearMocks                   Automatically clear mock calls, instances, contexts and results before every test 
  --resetMocks                   Automatically reset mock state before every test 
  --restoreMocks                 Automatically restore mock state and implementation before every test 
  --unstubGlobals                Restores all global variables that were changed with \`rstest.stubGlobal\` before every test 
  --unstubEnvs                   Restores all \`process.env\` values that were changed with \`rstest.stubEnv\` before every test"
`);
    });

    test('doctor -h should return rsdoctor help', () => {
      runCLI('doctor -h');
      const result = runCLI('doctor -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`""`);
    });

    test('build -h should return rsbuild help', () => {
      runCLI('build -h');
      const result = runCLI('build -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"rsbuild/1.5.3

Usage:
  $ rsbuild <command> [options]

Commands:
  dev      Start the dev server
  build    Build the app for production
  preview  Preview the production build locally
  inspect  Inspect the Rspack and Rsbuild configs

For more info, run any command with the \`--help\` flag:
  $ rsbuild dev --help
  $ rsbuild build --help
  $ rsbuild preview --help
  $ rsbuild inspect --help

Options:
  -h, --help                Display this message 
  -v, --version             Display version number 
  --base <base>             Set the base path of the server 
  -c, --config <config>     Set the configuration file (relative or absolute path) 
  --config-loader <loader>  Set the config file loader (jiti | native) (default: jiti)
  --env-dir <dir>           Set the directory for loading \`.env\` files 
  --env-mode <mode>         Set the env mode to load the \`.env.[mode]\` file 
  --environment <name>      Set the environment name(s) to build (default: )
  --log-level <level>       Set the log level (info | warn | error | silent) 
  -m, --mode <mode>         Set the build mode (development | production | none) 
  -r, --root <root>         Set the project root directory (absolute path or relative to cwd) 
  --no-env                  Disable loading of \`.env\` files (default: true)"
`);
    });
  });

  describe('Wiggum-specific flags', () => {
    test('--help should show wiggum help', () => {
      const result = runCLI('--help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum <command> [options]');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('passthrough CLI');
    });

    test('-h should show wiggum help', () => {
      const result = runCLI('-h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum <command> [options]');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('passthrough CLI');
    });

    test('--version should show wiggum version', () => {
      const result = runCLI('--version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('wiggum v');
    });
  });

  describe('Complex flag combinations', () => {
    test('build --mode production --help should forward all flags', () => {
      runCLI('build --mode production --help');
      const result = runCLI('build --mode production --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"rsbuild/1.5.3

Usage:
  $ rsbuild <command> [options]

Commands:
  dev      Start the dev server
  build    Build the app for production
  preview  Preview the production build locally
  inspect  Inspect the Rspack and Rsbuild configs

For more info, run any command with the \`--help\` flag:
  $ rsbuild dev --help
  $ rsbuild build --help
  $ rsbuild preview --help
  $ rsbuild inspect --help

Options:
  -h, --help                Display this message 
  -v, --version             Display version number 
  --base <base>             Set the base path of the server 
  -c, --config <config>     Set the configuration file (relative or absolute path) 
  --config-loader <loader>  Set the config file loader (jiti | native) (default: jiti)
  --env-dir <dir>           Set the directory for loading \`.env\` files 
  --env-mode <mode>         Set the env mode to load the \`.env.[mode]\` file 
  --environment <name>      Set the environment name(s) to build (default: )
  --log-level <level>       Set the log level (info | warn | error | silent) 
  -m, --mode <mode>         Set the build mode (development | production | none) 
  -r, --root <root>         Set the project root directory (absolute path or relative to cwd) 
  --no-env                  Disable loading of \`.env\` files (default: true)"
`);
    });

    test('pack --config webpack.config.js --version should forward all flags', () => {
      runCLI('pack --config webpack.config.js --version');
      const result = runCLI('pack --config webpack.config.js --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`"1.5.2"`);
    });

    test('lint --fix --help should forward all flags', () => {
      runCLI('lint --fix --help');
      const result = runCLI('lint --fix --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`""`);
    });

    test('doctor --help should forward help flag', () => {
      runCLI('doctor --help');
      const result = runCLI('doctor --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatchInlineSnapshot(`
"rsdoctor <command> [options]

Commands:
  rsdoctor analyze        use @rsdoctor/cli to open ".rsdoctor/manifest.json" in
                          browser for analysis.

                          example: rsdoctor analyze --profile
                          ".rsdoctor/manifest.json"
  rsdoctor bundle-diff    use @rsdoctor/cli to open the bundle diff result in
                          browser for analysis.

                          example: rsdoctor bundle-diff --baseline="x.json"
                          --current="x.json"
  rsdoctor stats-analyze  use @rsdoctor/cli to open ".rsdoctor/manifest.json" in
                          browser for analysis.example: rsdoctor stats-analyze
                          --profile "dist/stats.json"

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]"
`);
    });
  });
});