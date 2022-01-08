const { parentPort, workerData } = require('worker_threads');
const https = require('https');

const { sharedLock, requestPort } = workerData;
const sharedLockArray = new Int32Array(sharedLock);

parentPort.on('message', async (url) => {
  try {
    const response = await getBody(url);
    requestPort.postMessage(response);
  } catch (error) {
    requestPort.postMessage({ error });
  }
  Atomics.notify(sharedLockArray, 0);
});

// Helpers ###########################################################

async function getBody(url) {
  return new Promise(function (resolve, reject) {
    https
      .get(url, function (res) {
        let body = '';
        res.on('data', function (chunk) {
          body += chunk;
        });
        res.on('end', function () {
          resolve(body);
        });
      })
      .on('error', function (err) {
        reject(err);
      });
  });
}
