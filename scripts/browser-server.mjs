import { randomInt } from 'node:crypto';
// Windows can allocate a browser-blocked port for listen(0), e.g. 4045.
export async function listenForBrowser(server) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const port = randomInt(20000, 50000);
    try {
      await new Promise((resolve, reject) => {
        const failed = e => reject(e);
        server.once('error', failed);
        server.listen(port, '127.0.0.1', () => { server.off('error', failed); resolve(); });
      });
      return `http://127.0.0.1:${server.address().port}`;
    } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('Cannot allocate browser test port');
}
