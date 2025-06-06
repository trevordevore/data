import type { Handler, NextFn } from '@ember-data/request';
import RequestManager from '@ember-data/request';
import type { RequestContext } from '@warp-drive/core-types/request';
import { module, test } from '@warp-drive/diagnostic';

module('RequestManager | Graceful Handler Errors', function () {
  test('We error meaningfully for empty requests', async function (assert) {
    const manager = new RequestManager();
    let called = false;
    let nextArg: unknown = undefined;
    const handler: Handler = {
      request<T>(context: RequestContext, next: NextFn<T>) {
        called = true;
        // @ts-expect-error
        return nextArg ? next(nextArg) : next();
      },
    };
    manager.use([handler, handler]);

    try {
      nextArg = undefined;
      called = false;
      await manager.request({ url: '/wat' });
      assert.ok(false, 'we should error when the request is missing');
    } catch (e: unknown) {
      assert.true(called, 'we invoked the handler');
      assert.true(e instanceof Error, 'We throw an error when the request is missing');
      assert.equal(
        (e as Error).message,
        'Expected next(<request>) to be called with a request, but none was provided.',
        `Expected: ${(e as Error).message} - to match the expected error`
      );
    }

    try {
      nextArg = [];
      called = false;
      await manager.request({ url: '/wat' });
      assert.ok(false, 'we should error when the request is not an object');
    } catch (e: unknown) {
      assert.true(called, 'we invoked the handler');
      assert.true(e instanceof Error, 'We throw an error when the request is not an object');
      assert.equal(
        (e as Error).message,
        'The `request` passed to `next(<request>)` should be an object, received `array`',
        `Expected: ${(e as Error).message} - to match the expected error`
      );
    }

    try {
      nextArg = {};
      called = false;
      await manager.request({ url: '/wat' });
      assert.ok(false, 'we should error when the request has no keys');
    } catch (e: unknown) {
      assert.true(called, 'we invoked the handler');
      assert.true(e instanceof Error, 'We throw an error when the request has no keys');
      assert.equal(
        (e as Error).message,
        'The `request` passed to `next(<request>)` was empty (`{}`). Requests need at least one valid key.',
        `Expected: ${(e as Error).message} - to match the expected error`
      );
    }
  });

  test('We error meaningfully for misshapen requests', async function (assert) {
    const manager = new RequestManager();
    let called = false;
    let nextArg: unknown = undefined;
    const handler: Handler = {
      request<T>(context: RequestContext, next: NextFn<T>) {
        called = true;
        // @ts-expect-error
        return nextArg ? next(nextArg) : next();
      },
    };
    manager.use([handler, handler]);

    try {
      nextArg = {
        url: true,
        data: new Set(),
        options: [],
        cache: 'bogus',
        credentials: 'never',
        destination: 'space',
        headers: new Map(),
        integrity: false,
        keepalive: 'yes',
        method: 'get',
        mode: 'find-out',
        redirect: 'of course',
        referrer: null,
        referrerPolicy: 'do-whatever',
      };
      await manager.request({ url: '/wat' });
      assert.ok(false, 'we should error when the handler returns undefined');
    } catch (e: unknown) {
      assert.true(called, 'we invoked the handler');
      assert.true(e instanceof Error, 'We throw an error');
      assert.equal(
        `Invalid Request passed to \`next(<request>)\`.

The following issues were found:

\tInvalidValue: key url should be a non-empty string, received boolean
\tInvalidValue: key options should be an object
\tInvalidValue: key cache should be one of 'default', 'force-cache', 'no-cache', 'no-store', 'only-if-cached', 'reload', received bogus
\tInvalidValue: key credentials should be one of 'include', 'omit', 'same-origin', received never
\tInvalidValue: key destination should be one of '', 'object', 'audio', 'audioworklet', 'document', 'embed', 'font', 'frame', 'iframe', 'image', 'manifest', 'paintworklet', 'report', 'script', 'sharedworker', 'style', 'track', 'video', 'worker', 'xslt', received space
\tInvalidValue: key headers should be an instance of Headers, received map
\tInvalidValue: key integrity should be a non-empty string, received boolean
\tInvalidValue: key keepalive should be a boolean, received string
\tInvalidValue: key method should be one of 'QUERY', 'GET', 'PUT', 'PATCH', 'DELETE', 'POST', 'OPTIONS', 'HEAD', 'CONNECT', 'TRACE', received get
\tInvalidValue: key mode should be one of 'same-origin', 'cors', 'navigate', 'no-cors', received find-out
\tInvalidValue: key redirect should be one of 'error', 'follow', 'manual', received of course
\tInvalidValue: key referrer should be a non-empty string, received object
\tInvalidValue: key referrerPolicy should be one of '', 'same-origin', 'no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url', received do-whatever`,
        (e as Error).message,
        `Expected\n\`\`\`\n${(e as Error).message}\n\`\`\` to match the expected error`
      );
    }
  });

  test('We error meaningfully for invalid properties', async function (assert) {
    const manager = new RequestManager();
    let called = false;
    let nextArg: unknown = undefined;
    const handler: Handler = {
      request<T>(context: RequestContext, next: NextFn<T>) {
        called = true;
        // @ts-expect-error
        return nextArg ? next(nextArg) : next();
      },
    };
    manager.use([handler, handler]);

    try {
      nextArg = {
        url: '/wat',
        random: 'field',
      };
      await manager.request({ url: '/wat' });
      assert.ok(false, 'we should error when the handler returns undefined');
    } catch (e: unknown) {
      assert.true(called, 'we invoked the handler');
      assert.true(e instanceof Error, 'We throw an error');
      assert.equal(
        `Invalid Request passed to \`next(<request>)\`.

The following issues were found:

\tInvalidKey: 'random'`,
        (e as Error).message,
        `Expected\n\`\`\`\n${(e as Error).message}\n\`\`\` to match the expected error`
      );
    }
  });
});
