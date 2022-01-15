// @flow

const path = require('path');
const {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
  // $FlowFixMe[cannot-resolve-module]: Flow doesn’t seem to know about the `worker_threads` module yet.
} = require('worker_threads');

// Start a worker thread and return a `syncGetWorker`
// capable of making sync requests until shut down.
function startWorker() /*: {
  get: (string) => string,
  shutDown: () => void,
} */ {
  const { port1: localPort, port2: workerPort } = new MessageChannel();
  const sharedLock = new SharedArrayBuffer(4);
  // $FlowFixMe[incompatible-call]: Flow is wrong and says `sharedLock` is not an accepted parameter here.
  const sharedLockArray = new Int32Array(sharedLock);
  const workerPath = path.resolve(__dirname, 'SyncGetWorker.js');
  const worker = new Worker(workerPath, {
    workerData: { sharedLock, requestPort: workerPort },
    transferList: [workerPort],
  });
  function get(url) {
    worker.postMessage(url);
    Atomics.wait(sharedLockArray, 0, 0); // blocks until notified at index 0.
    const response = receiveMessageOnPort(localPort);
    if (response.message.error) {
      throw response.message.error;
    } else {
      return response.message;
    }
  }
  function shutDown() {
    localPort.close();
    worker.terminate();
  }
  return { get, shutDown };
}

module.exports = {
  startWorker,
};
