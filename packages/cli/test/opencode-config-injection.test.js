const EventEmitter = require('events');

// Capture child processes returned by spawn
let lastSpawnedChild = null;

jest.mock('child_process', () => {
  const spawn = jest.fn(() => {
    const child = new EventEmitter();
    child.kill = jest.fn();
    lastSpawnedChild = child;
    return child;
  });
  return { spawn };
});

// Import after mocking spawn so agent uses the mock
const agent = require('../dist/agent.js');
const { spawn } = require('child_process');

describe('OpenCode ephemeral config injection', () => {
  test('spawnOpenCode injects OPENCODE_CONFIG_CONTENT with custom agent', () => {
    const config = {
      agent: {
        myAgent: {
          prompt: 'You are helpful',
          mode: 'primary',
          permission: { edit: 'ask', bash: {} },
          tools: { webfetch: true }
        }
      },
      model: 'anthropic/claude-3-5-sonnet-20241022'
    };

    agent.spawnOpenCode([], { config });

    expect(spawn).toHaveBeenCalled();
    const call = spawn.mock.calls[0];
    const options = call[2];
    expect(options).toBeDefined();
    expect(options.env).toBeDefined();
    expect(typeof options.env.OPENCODE_CONFIG_CONTENT).toBe('string');
    const injected = JSON.parse(options.env.OPENCODE_CONFIG_CONTENT);
    expect(injected).toEqual(config);
  });

  test('runOpenCodeCommand passes runtimeConfig to spawnOpenCode', async () => {
    const runtimeConfig = {
      agent: {
        anotherAgent: {
          prompt: 'Do the thing',
          mode: 'primary',
          permission: { edit: 'ask', bash: {} },
          tools: { webfetch: false }
        }
      }
    };

    const promise = agent.runOpenCodeCommand('status', [], runtimeConfig);

    // Allow runOpenCodeCommand to attach listeners, then simulate exit
    setImmediate(() => {
      if (lastSpawnedChild) lastSpawnedChild.emit('exit', 0);
    });

    await promise;

    expect(spawn).toHaveBeenCalled();
    const call = spawn.mock.calls[spawn.mock.calls.length - 1];
    const options = call[2];
    const injected = JSON.parse(options.env.OPENCODE_CONFIG_CONTENT);
    expect(injected).toEqual(runtimeConfig);
  });
});

