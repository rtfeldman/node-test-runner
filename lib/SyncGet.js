const path = require('path');
const {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
} = require('worker_threads');

/**
 * @typedef { (key: string) => string } SyncHttpGet
 *
 * @typedef { {
    get: SyncHttpGet,
    shutDown: () => void,
  } } SyncGetWorker
 */

class LazySyncGetWorker {
  /** @type { SyncGetWorker | undefined } */
  worker = undefined;

  /** @type { SyncGetWorker["get"] } */
  get(key) {
    if (this.worker === undefined) {
      this.worker = startWorker();
    }
    return this.worker.get(key);
  }

  /** @type { SyncGetWorker["shutDown"] } */
  shutDown() {
    if (this.worker !== undefined) {
      this.worker.shutDown();
    }
  }
}

/**
 * Start a worker thread and return a `syncGetWorker`
 * capable of making sync requests until shut down.
 *
 * @returns { SyncGetWorker }
 */
function startWorker() {
  const { port1: localPort, port2: workerPort } = new MessageChannel();
  const sharedLock = new SharedArrayBuffer(4);
  const sharedLockArray = new Int32Array(sharedLock);
  const workerPath = path.resolve(__dirname, 'SyncGetWorker.js');
  const worker = new Worker(workerPath, {
    workerData: { sharedLock, requestPort: workerPort },
    transferList: [workerPort],
  });
  /**
   * @param { string } url
   * @returns { string }
   */
  function get(url) {
    worker.postMessage(url);
    Atomics.wait(sharedLockArray, 0, 0); // blocks until notified at index 0.
    const response = receiveMessageOnPort(localPort);
    if (response === undefined) {
      throw new Error(`No message on port ${localPort} available.`);
    } else if (response.message.error) {
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
  LazySyncGetWorker: LazySyncGetWorker,
};
