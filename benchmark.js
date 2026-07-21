// benchmark.js
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require('worker_threads');

const { fork } = require('child_process');

const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const SMALL_ITERATIONS = 10_000;
const BIG_ITERATIONS = 1_000;

const smallPayload = {
  id: 123,
  name: 'hello',
  ok: true,
};

const bigPayload = {
  items: Array.from({ length: 10_000 }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    value: Math.random(),
    tags: ['a', 'b', 'c'],
  })),
};

function hrMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function benchmarkWorker(generator) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename);

    let iterations = 0;
    const start = process.hrtime.bigint();

    worker.on('message', () => {
      iterations++;
      const r = generator.next();

      if (r.done) {
        const totalMs = hrMs(start);

        worker.terminate().then(() => {
          resolve({
            totalMs,
            avgMs: totalMs / iterations,
          });
        });
      } else {
        worker.postMessage(r.value);
      }
    });

    worker.on('error', reject);

    worker.postMessage(generator.next().value);
  });
}

async function benchmarkWorkerJson(generator) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { mode: 'worker-json' },
    });

    let iterations = 0;
    const start = process.hrtime.bigint();

    worker.on('message', (msg) => {
      JSON.parse(msg);

      iterations++;
      const r = generator.next();

      if (r.done) {
        const totalMs = hrMs(start);

        worker.terminate().then(() => {
          resolve({
            totalMs,
            avgMs: totalMs / iterations,
          });
        });
      } else {
        worker.postMessage(JSON.stringify(r.value));
      }
    });

    worker.on('error', reject);

    worker.postMessage(JSON.stringify(generator.next().value));
  });
}

async function benchmarkForkIPC(generator) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, ['fork-ipc'], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    let iterations = 0;
    const start = process.hrtime.bigint();

    child.on('message', () => {
      iterations++;
      const r = generator.next();

      if (r.done) {
        const totalMs = hrMs(start);

        child.kill();

        resolve({
          totalMs,
          avgMs: totalMs / iterations,
        });
      } else {
        child.send(r.value);
      }
    });

    child.on('error', reject);

    child.send(generator.next().value);
  });
}

async function benchmarkForkIPCJson(generator) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, ['fork-ipc-json'], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    let iterations = 0;
    const start = process.hrtime.bigint();

    child.on('message', (msg) => {
      JSON.parse(msg);

      iterations++;
      const r = generator.next();

      if (r.done) {
        const totalMs = hrMs(start);

        child.kill();

        resolve({
          totalMs,
          avgMs: totalMs / iterations,
        });
      } else {
        child.send(JSON.stringify(r.value));
      }
    });

    child.on('error', reject);

    child.send(JSON.stringify(generator.next().value));
  });
}

async function benchmarkUnixSocket(generator) {
  const pipeName =
    process.platform === 'win32'
      ? '\\\\.\\pipe\\node-benchmark-' + process.pid
      : path.join(os.tmpdir(), `node-benchmark-${process.pid}.sock`);

  try {
    fs.unlinkSync(pipeName);
  } catch {
    // Ignore errors.
  }

  return new Promise((resolve, reject) => {
    const child = fork(__filename, ['fork-socket', pipeName], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    child.once('message', () => {
      const socket = net.createConnection(pipeName);

      let iterations = 0;

      socket.setEncoding('utf8');
      socket.setNoDelay(true);

      // https://nodejs.org/api/readline.html#example-read-file-stream-line-by-line
      const rl = readline.createInterface({
        input: socket,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        JSON.parse(line);

        iterations++;
        const r = generator.next();

        if (r.done) {
          const totalMs = hrMs(start);

          socket.destroy();
          child.kill();

          resolve({
            totalMs,
            avgMs: totalMs / iterations,
          });

          return;
        }

        socket.write(JSON.stringify(r.value) + '\n');
      });

      socket.on('error', reject);

      const start = process.hrtime.bigint();

      socket.write(JSON.stringify(generator.next().value) + '\n');
    });

    child.on('error', reject);
  });
}

async function runBenchmarks() {
  const cases = [
    {
      name: 'real',
      generator: function* () {
        const messages = fs
          .readFileSync('messages.txt', 'utf8')
          .trim()
          .split('\n')
          .map(JSON.parse);
        for (var j = 0; j < 10; j++) {
          for (var i = 0; i < messages.length; i++) {
            yield messages[i];
          }
        }
      },
    },
    {
      name: 'small JSON',
      generator: function* () {
        for (var i = 0; i < SMALL_ITERATIONS; i++) {
          yield smallPayload;
        }
      },
    },
    {
      name: 'big JSON',
      generator: function* () {
        for (var i = 0; i < BIG_ITERATIONS; i++) {
          yield bigPayload;
        }
      },
    },
  ];

  for (const testCase of cases) {
    console.log(`\n=== ${testCase.name} ===`);

    console.log('worker');
    const worker = await benchmarkWorker(testCase.generator());

    console.log('workerJson');
    const workerJson = await benchmarkWorkerJson(testCase.generator());

    console.log('forkIPC');
    const forkIPC = await benchmarkForkIPC(testCase.generator());

    console.log('forkIPCJson');
    const forkIPCJson = await benchmarkForkIPCJson(testCase.generator());

    console.log('socket');
    const socket = await benchmarkUnixSocket(testCase.generator());

    console.table([
      {
        transport: 'worker_threads',
        avgMs: worker.avgMs.toFixed(6),
        totalMs: worker.totalMs.toFixed(2),
      },
      {
        transport: 'worker_threads + JSON',
        avgMs: workerJson.avgMs.toFixed(6),
        totalMs: workerJson.totalMs.toFixed(2),
      },
      {
        transport: 'fork + process.send',
        avgMs: forkIPC.avgMs.toFixed(6),
        totalMs: forkIPC.totalMs.toFixed(2),
      },
      {
        transport: 'fork + process.send + JSON',
        avgMs: forkIPCJson.avgMs.toFixed(6),
        totalMs: forkIPCJson.totalMs.toFixed(2),
      },
      {
        transport: 'fork + UNIX socket',
        avgMs: socket.avgMs.toFixed(6),
        totalMs: socket.totalMs.toFixed(2),
      },
    ]);
  }
}

//
// Worker implementation (regular and JSON)
//
if (!isMainThread) {
  if (workerData?.mode === 'worker-json') {
    parentPort.on('message', (str) => {
      const obj = JSON.parse(str);

      parentPort.postMessage(JSON.stringify(obj));
    });
  } else {
    parentPort.on('message', (msg) => {
      parentPort.postMessage(msg);
    });
  }
}

//
// Fork IPC implementation
//
else if (process.argv[2] === 'fork-ipc') {
  process.on('message', (msg) => {
    process.send(msg);
  });
}

//
// Fork IPC JSON implementation
//
else if (process.argv[2] === 'fork-ipc-json') {
  process.on('message', (str) => {
    const obj = JSON.parse(str);

    process.send(JSON.stringify(obj));
  });
}

//
// Fork socket implementation
//
else if (process.argv[2] === 'fork-socket') {
  const pipeName = process.argv[3];

  try {
    fs.unlinkSync(pipeName);
  } catch {
    // Ignore errors.
  }

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.setNoDelay(true);

    // https://nodejs.org/api/readline.html#example-read-file-stream-line-by-line
    const rl = readline.createInterface({
      input: socket,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      const obj = JSON.parse(line);

      socket.write(JSON.stringify(obj) + '\n');
    });
  });

  server.listen(pipeName, () => {
    process.send('ready');
  });
}

//
// Main
//
else {
  runBenchmarks().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
