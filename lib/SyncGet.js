const {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
} = require('worker_threads');

// Start a worker thread and return a `syncGetWorker`
// capable of making sync requests until shut down.
function startWorker() {
  const { port1: localPort, port2: workerPort } = new MessageChannel();
  const sharedLock = new SharedArrayBuffer(4);
  const sharedLockArray = new Int32Array(sharedLock);
  const worker = new Worker('./SyncGetWorker.js', {
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

module.exports.startWorker = startWorker;
