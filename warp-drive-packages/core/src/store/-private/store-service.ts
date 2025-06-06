// this import location is deprecated but breaks in 4.8 and older
import { deprecate } from '@ember/debug';

import { dependencySatisfies, importSync, macroCondition } from '@embroider/macros';

import {
  __INTERNAL_LOG_NATIVE_MAP_SET_COUNTS,
  LOG_METRIC_COUNTS,
  LOG_REQUESTS,
} from '@warp-drive/core/build-config/debugging';
import {
  DEPRECATE_STORE_EXTENDS_EMBER_OBJECT,
  ENABLE_LEGACY_SCHEMA_SERVICE,
} from '@warp-drive/core/build-config/deprecations';
import { DEBUG, TESTING } from '@warp-drive/core/build-config/env';
import { assert } from '@warp-drive/core/build-config/macros';

import type { Graph } from '../../graph/-private.ts';
import type { Future } from '../../request.ts';
import type { RequestManager } from '../../request/-private/manager.ts';
import type { Cache } from '../../types/cache.ts';
import type { StableExistingRecordIdentifier, StableRecordIdentifier } from '../../types/identifier.ts';
import type { TypedRecordInstance, TypeFromInstance } from '../../types/record.ts';
import { EnableHydration, SkipCache } from '../../types/request.ts';
import { getRuntimeConfig, setLogging } from '../../types/runtime.ts';
import type { ResourceDocument } from '../../types/spec/document.ts';
import type {
  CollectionResourceDocument,
  EmptyResourceDocument,
  JsonApiDocument,
  ResourceIdentifierObject,
  SingleResourceDocument,
} from '../../types/spec/json-api-raw.ts';
import type { Type } from '../../types/symbols.ts';
import type { CacheCapabilitiesManager } from '../-types/q/cache-capabilities-manager.ts';
import type { ModelSchema } from '../-types/q/ds-model.ts';
import type { OpaqueRecordInstance } from '../-types/q/record-instance.ts';
import type { SchemaService } from '../-types/q/schema-service.ts';
import type { FindAllOptions, FindRecordOptions, LegacyResourceQuery, QueryOptions } from '../-types/q/store.ts';
import type { StoreRequestInput } from './cache-handler/handler.ts';
import type { CachePolicy } from './cache-handler/types.ts';
import { IdentifierCache } from './caches/identifier-cache.ts';
import {
  InstanceCache,
  peekRecordIdentifier,
  preloadData,
  recordIdentifierFor,
  resourceIsFullyDeleted,
  storeFor,
} from './caches/instance-cache.ts';
import type RecordReference from './legacy-model-support/record-reference.ts';
import { getShimClass } from './legacy-model-support/shim-model-class.ts';
import { CacheManager } from './managers/cache-manager.ts';
import NotificationManager from './managers/notification-manager.ts';
import { RecordArrayManager } from './managers/record-array-manager.ts';
import { RequestPromise, RequestStateService } from './network/request-cache.ts';
import type { Collection, IdentifierArray } from './record-arrays/identifier-array.ts';
import { coerceId, ensureStringId } from './utils/coerce-id.ts';
import { constructResource } from './utils/construct-resource.ts';
import { normalizeModelName } from './utils/normalize-model-name.ts';

// @ts-expect-error adding to globalThis
globalThis.setWarpDriveLogging = setLogging;

// @ts-expect-error adding to globalThis
globalThis.getWarpDriveRuntimeConfig = getRuntimeConfig;

if (LOG_METRIC_COUNTS) {
  // @ts-expect-error adding to globalThis
  // eslint-disable-next-line
  globalThis.__WarpDriveMetricCountData = globalThis.__WarpDriveMetricCountData || {};

  // @ts-expect-error adding to globalThis
  globalThis.getWarpDriveMetricCounts = () => {
    // @ts-expect-error
    // eslint-disable-next-line
    return structuredClone(globalThis.__WarpDriveMetricCountData);
  };

  // @ts-expect-error adding to globalThis
  globalThis.resetWarpDriveMetricCounts = () => {
    // @ts-expect-error
    globalThis.__WarpDriveMetricCountData = {};
  };

  if (__INTERNAL_LOG_NATIVE_MAP_SET_COUNTS) {
    // @ts-expect-error adding to globalThis
    globalThis.__primitiveInstanceId = 0;

    function interceptAndLog(
      klassName: 'Set' | 'Map' | 'WeakSet' | 'WeakMap',
      methodName: 'add' | 'set' | 'delete' | 'has' | 'get' | 'constructor'
    ) {
      const klass = globalThis[klassName];

      if (methodName === 'constructor') {
        const instantiationLabel = `new ${klassName}()`;
        // @ts-expect-error
        globalThis[klassName] = class extends klass {
          // @ts-expect-error
          constructor(...args) {
            // eslint-disable-next-line
            super(...args);
            // @ts-expect-error

            const instanceId = globalThis.__primitiveInstanceId++;
            // @ts-expect-error
            // eslint-disable-next-line
            globalThis.__WarpDriveMetricCountData[instantiationLabel] =
              // @ts-expect-error
              // eslint-disable-next-line
              (globalThis.__WarpDriveMetricCountData[instantiationLabel] || 0) + 1;
            // @ts-expect-error
            this.instanceName = `${klassName}:${instanceId} - ${new Error().stack?.split('\n')[2]}`;
          }
        };
      } else {
        // @ts-expect-error
        // eslint-disable-next-line
        const original = klass.prototype[methodName];
        const logName = `${klassName}.${methodName}`;

        // @ts-expect-error
        klass.prototype[methodName] = function (...args) {
          // @ts-expect-error
          // eslint-disable-next-line
          globalThis.__WarpDriveMetricCountData[logName] = (globalThis.__WarpDriveMetricCountData[logName] || 0) + 1;
          // @ts-expect-error
          const { instanceName } = this;
          if (!instanceName) {
            // @ts-expect-error
            const instanceId = globalThis.__primitiveInstanceId++;
            // @ts-expect-error
            this.instanceName = `${klassName}.${methodName}:${instanceId} - ${new Error().stack?.split('\n')[2]}`;
          }
          const instanceLogName = `${logName} (${instanceName})`;
          // @ts-expect-error
          // eslint-disable-next-line
          globalThis.__WarpDriveMetricCountData[instanceLogName] =
            // @ts-expect-error
            // eslint-disable-next-line
            (globalThis.__WarpDriveMetricCountData[instanceLogName] || 0) + 1;
          // eslint-disable-next-line
          return original.apply(this, args);
        };
      }
    }

    interceptAndLog('Set', 'constructor');
    interceptAndLog('Set', 'add');
    interceptAndLog('Set', 'delete');
    interceptAndLog('Set', 'has');
    interceptAndLog('Set', 'set');
    interceptAndLog('Set', 'get');

    interceptAndLog('Map', 'constructor');
    interceptAndLog('Map', 'set');
    interceptAndLog('Map', 'delete');
    interceptAndLog('Map', 'has');
    interceptAndLog('Map', 'add');
    interceptAndLog('Map', 'get');

    interceptAndLog('WeakSet', 'constructor');
    interceptAndLog('WeakSet', 'add');
    interceptAndLog('WeakSet', 'delete');
    interceptAndLog('WeakSet', 'has');
    interceptAndLog('WeakSet', 'set');
    interceptAndLog('WeakSet', 'get');

    interceptAndLog('WeakMap', 'constructor');
    interceptAndLog('WeakMap', 'set');
    interceptAndLog('WeakMap', 'delete');
    interceptAndLog('WeakMap', 'has');
    interceptAndLog('WeakMap', 'add');
    interceptAndLog('WeakMap', 'get');
  }
}

export { storeFor };

// We inline this list of methods to avoid importing EmberObject
type EmberObjectKey =
  | '_debugContainerKey'
  | '_super'
  | 'addObserver'
  | 'cacheFor'
  | 'concatenatedProperties'
  | 'decrementProperty'
  | 'destroy'
  | 'get'
  | 'getProperties'
  | 'incrementProperty'
  | 'init'
  | 'isDestroyed'
  | 'isDestroying'
  | 'mergedProperties'
  | 'notifyPropertyChange'
  | 'removeObserver'
  | 'reopen'
  | 'set'
  | 'setProperties'
  | 'toggleProperty'
  | 'toString'
  | 'willDestroy';

type DSModelKeys =
  | '___(unique) Symbol(Store)'
  | '___private_notifications'
  | '___recordState'
  | '_createSnapshot'
  | 'adapterError'
  | 'attr'
  | 'belongsTo'
  | 'changedAttributes'
  | 'currentState'
  | 'deleteRecord'
  | 'destroyRecord'
  | 'dirtyType'
  | 'eachAttribute'
  | 'eachRelationship'
  | 'errors'
  | 'hasDirtyAttributes'
  | 'hasMany'
  | 'inverseFor'
  | 'isDeleted'
  | 'isEmpty'
  | 'isError'
  | 'isLoaded'
  | 'isLoading'
  | 'isNew'
  | 'isReloading'
  | 'isSaving'
  | 'isValid'
  | 'relationshipFor'
  | 'reload'
  | 'rollbackAttributes'
  | 'save'
  | 'serialize'
  | 'store'
  | 'unloadRecord';

type CompatStore = Store & {
  adapterFor?: (
    type: string,
    _allowMissing?: boolean
  ) => undefined | { generateIdForRecord?(store: Store, type: string, properties: object): string };
};
function upgradeStore(store: Store): asserts store is CompatStore {}

type DownlevelArrays<T> = T extends Array<infer U> ? U[] : T;
type AwaitedKeys<T> = { [K in keyof T & string]: DownlevelArrays<Awaited<T[K]>> };

// `AwaitedKeys` is needed here to resolve any promise types like `PromiseBelongsTo`.
type FilteredKeys<T> = AwaitedKeys<Omit<T, typeof Type | EmberObjectKey | DSModelKeys | 'constructor'>>;

type MaybeHasId = { id?: string | null };
/**
 * Currently only records that extend object can be created via
 * store.createRecord. This is a limitation of the current API,
 * but can be worked around by creating a new identifier, running
 * the cache.clientDidCreate method, and then peeking the record
 * for the identifier.
 *
 * To assign primary key to a record during creation, only `id` will
 * work correctly for `store.createRecord`, other primary key may be
 * handled by updating the record after creation or using the flow
 * described above.
 *
 * TODO: These are limitations we want to (and can) address. If you
 * have need of lifting these limitations, please open an issue.
 *
 */
export type CreateRecordProperties<T = MaybeHasId & Record<string, unknown>> = T extends TypedRecordInstance
  ? Partial<FilteredKeys<T>>
  : T extends MaybeHasId
    ? MaybeHasId & Partial<FilteredKeys<T>>
    : MaybeHasId & Record<string, unknown>;

/**
 * A Store coordinates interaction between your application, a [Cache](https://api.emberjs.com/ember-data/release/classes/%3CInterface%3E%20Cache),
 * and sources of data (such as your API or a local persistence layer)
 * accessed via a [RequestManager](https://github.com/emberjs/data/tree/main/packages/request).
 *
 * ```js [app/services/store.js]
 * import Store from '@ember-data/store';
 *
 * export default class extends Store {}
 * ```
 *
 * Most Applications will only have a single `Store` configured as a Service
 * in this manner. However, setting up multiple stores is possible, including using
 * each as a unique service or within a specific context.
 *

  @class Store
  @public
*/
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
const EmptyClass = class {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(args?: unknown) {}
};
const _BaseClass = macroCondition(dependencySatisfies('ember-source', '*'))
  ? DEPRECATE_STORE_EXTENDS_EMBER_OBJECT
    ? (importSync('@ember/object') as typeof EmptyClass)
    : EmptyClass
  : EmptyClass;

const BaseClass = (_BaseClass as unknown as { default?: typeof EmptyClass }).default
  ? ((_BaseClass as unknown as { default?: typeof EmptyClass }).default as typeof EmptyClass)
  : _BaseClass;

if (BaseClass !== EmptyClass) {
  deprecate(
    `The Store class extending from EmberObject is deprecated.
Please remove usage of EmberObject APIs and mark your class as not requiring it.

To mark the class as no longer extending from EmberObject, in ember-cli-build.js
set the following config:

\`\`\`js
const app = new EmberApp(defaults, {
  emberData: {
    deprecations: {
      DEPRECATE_STORE_EXTENDS_EMBER_OBJECT: false
    }
  }
});
\`\`\`
`,
    false,
    {
      id: 'ember-data:deprecate-store-extends-ember-object',
      until: '6.0',
      for: 'ember-data',
      url: 'https://deprecations.emberjs.com/id/ember-data-deprecate-store-extends-ember-object',
      since: {
        available: '4.13',
        enabled: '5.4',
      },
    }
  );
}

export interface Store {
  createCache(capabilities: CacheCapabilitiesManager): Cache;

  /**
   * This is the hook WarpDrive uses to create a record instance to give reactive access to
   * a resource in the cache.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  instantiateRecord<T>(
    identifier: StableRecordIdentifier,
    createRecordArgs: { [key: string]: unknown }
  ): OpaqueRecordInstance;

  /**
   * This is the hook WarpDrive uses to remove a record instance that is no longer needed
   */
  teardownRecord(record: OpaqueRecordInstance): void;

  /**
   * This hook enables an app to supply a SchemaService
   * for use when information about a resource's schema needs
   * to be queried.
   *
   * This method will only be called once to instantiate the singleton
   * service, which can then be accessed via `store.schema`.
   *
   * For Example, to use the default SchemaService for SchemaRecord
   *
   * ```ts
   * import { SchemaService } from '@warp-drive/schema-record';
   *
   * class extends Store {
   *   createSchemaService() {
   *     return new SchemaService();
   *   }
   * }
   * ```
   *
   * Or to use the SchemaService for @ember-data/model
   *
   * ```ts
   * import { buildSchema } from '@ember-data/model';
   *
   * class extends Store {
   *   createSchemaService() {
   *     return buildSchema(this);
   *   }
   * }
   * ```
   *
   * If you wish to chain services, you must either
   * instantiate each schema source directly or super to retrieve
   * an existing service. For convenience, when migrating from
   * `@ember-data/model` to `@warp-drive/schema-record` a
   * SchemaService is provided that handles this transition
   * for you:
   *
   * ```ts
   * import { DelegatingSchemaService } from '@ember-data/model/migration-support';
   * import { SchemaService } from '@warp-drive/schema-record';
   *
   * class extends Store {
   *   createSchemaService() {
   *     const schema = new SchemaService();
   *     return new DelegatingSchemaService(this, schema);
   *   }
   * }
   * ```
   *
   * When using the DelegateSchemaService, the schema will first
   * be sourced from directly registered schemas, then will fallback
   * to sourcing a schema from available models if no schema is found.
   *
   * @return {SchemaService}
   * @public
   */
  createSchemaService(): SchemaService;

  /**
   * DEPRECATED - Use the property `store.schema` instead.
   *
   * Provides access to the SchemaDefinitionService instance
   * for this Store instance.
   *
   * The SchemaDefinitionService can be used to query for
   * information about the schema of a resource.
   *
   * @deprecated
   * @public
   */
  getSchemaDefinitionService(): SchemaService;

  /**
   * DEPRECATED - Use `createSchemaService` instead.
   *
   * Allows an app to register a custom SchemaService
   * for use when information about a resource's schema needs
   * to be queried.
   *
   * This method can only be called more than once, but only one schema
   * definition service may exist. Therefore if you wish to chain services
   * you must lookup the existing service and close over it with the new
   * service by accessing `store.schema` prior to registration.
   *
   * For Example:
   *
   * ```ts
   * import Store from '@ember-data/store';
   *
   * class SchemaDelegator {
   *   constructor(schema) {
   *     this._schema = schema;
   *   }
   *
   *   hasResource(resource: { type: string }): boolean {
   *     if (AbstractSchemas.has(resource.type)) {
   *       return true;
   *     }
   *     return this._schema.hasResource(resource);
   *   }
   *
   *   attributesDefinitionFor(identifier: RecordIdentifier | { type: string }): AttributesSchema {
   *     return this._schema.attributesDefinitionFor(identifier);
   *   }
   *
   *   relationshipsDefinitionFor(identifier: RecordIdentifier | { type: string }): RelationshipsSchema {
   *     const schema = AbstractSchemas.get(identifier.type);
   *     return schema || this._schema.relationshipsDefinitionFor(identifier);
   *   }
   * }
   *
   * export default class extends Store {
   *   constructor(...args) {
   *     super(...args);
   *
   *     const schema = this.createSchemaService();
   *     this.registerSchemaDefinitionService(new SchemaDelegator(schema));
   *   }
   * }
   * ```
   *
   * @param {SchemaService} schema
   * @deprecated
   * @public
   */
  registerSchemaDefinitionService(schema: SchemaService): void;

  /**
   * DEPRECATED - Use `createSchemaService` instead.
   *
   * Allows an app to register a custom SchemaService
   * for use when information about a resource's schema needs
   * to be queried.
   *
   * This method can only be called more than once, but only one schema
   * definition service may exist. Therefore if you wish to chain services
   * you must lookup the existing service and close over it with the new
   * service by accessing `store.schema` prior to registration.
   *
   * For Example:
   *
   * ```ts
   * import Store from '@ember-data/store';
   *
   * class SchemaDelegator {
   *   constructor(schema) {
   *     this._schema = schema;
   *   }
   *
   *   hasResource(resource: { type: string }): boolean {
   *     if (AbstractSchemas.has(resource.type)) {
   *       return true;
   *     }
   *     return this._schema.hasResource(resource);
   *   }
   *
   *   attributesDefinitionFor(identifier: RecordIdentifier | { type: string }): AttributesSchema {
   *     return this._schema.attributesDefinitionFor(identifier);
   *   }
   *
   *   relationshipsDefinitionFor(identifier: RecordIdentifier | { type: string }): RelationshipsSchema {
   *     const schema = AbstractSchemas.get(identifier.type);
   *     return schema || this._schema.relationshipsDefinitionFor(identifier);
   *   }
   * }
   *
   * export default class extends Store {
   *   constructor(...args) {
   *     super(...args);
   *
   *     const schema = this.schema;
   *     this.registerSchema(new SchemaDelegator(schema));
   *   }
   * }
   * ```
   *
   * @param {SchemaService} schema
   * @deprecated
   * @public
   */
  registerSchema(schema: SchemaService): void;
}

export class Store extends BaseClass {
  /** @internal */
  declare recordArrayManager: RecordArrayManager;

  /**
   * Provides access to the NotificationManager associated
   * with this Store instance.
   *
   * The NotificationManager can be used to subscribe to
   * changes to the cache.
   *
   * @property notifications
   * @type {NotificationManager}
   * @public
   */
  declare notifications: NotificationManager;

  /**
   * Provides access to the SchemaService instance
   * for this Store instance.
   *
   * The SchemaService can be used to query for
   * information about the schema of a resource.
   *
   * @property schema
   * @type {SchemaService}
   * @public
   */
  get schema(): ReturnType<this['createSchemaService']> {
    if (!this._schema) {
      this._schema = this.createSchemaService();
    }
    return this._schema as ReturnType<this['createSchemaService']>;
  }
  /** @internal */
  declare _schema: SchemaService;

  /**
   * Provides access to the IdentifierCache instance
   * for this store.
   *
   * The IdentifierCache can be used to generate or
   * retrieve a stable unique identifier for any resource.
   *
   * @property identifierCache
   * @type {IdentifierCache}
   * @public
   */
  declare identifierCache: IdentifierCache;
  /**
   * Provides access to the requestManager instance associated
   * with this Store instance.
   *
   * When using `ember-data` this property is automatically
   * set to an instance of `RequestManager`. When not using `ember-data`
   * you must configure this property yourself, either by declaring
   * it as a service or by initializing it.
   *
   * ```ts
   * import Store, { CacheHandler } from '@ember-data/store';
   * import RequestManager from '@ember-data/request';
   * import Fetch from '@ember-data/request/fetch';
   *
   * class extends Store {
   *   requestManager = new RequestManager()
   *    .use([Fetch])
   *    .useCache(CacheHandler);
   * }
   * ```
   *
   * @public
   * @property requestManager
   * @type {RequestManager}
   */
  declare requestManager: RequestManager;

  /**
   * A Property which an App may set to provide a CachePolicy
   * to control when a cached request becomes stale.
   *
   * Note, when defined, these methods will only be invoked if a
   * cache key exists for the request, either because the request
   * contains `cacheOptions.key` or because the [IdentifierCache](/ember-data/release/classes/IdentifierCache)
   * was able to generate a key for the request using the configured
   * [generation method](/ember-data/release/functions/@ember-data%2Fstore/setIdentifierGenerationMethod).
   *
   * `isSoftExpired` will only be invoked if `isHardExpired` returns `false`.
   *
   * ```ts
   * store.lifetimes = {
   *   // make the request and ignore the current cache state
   *   isHardExpired(identifier: StableDocumentIdentifier): boolean {
   *     return false;
   *   }
   *
   *   // make the request in the background if true, return cache state
   *   isSoftExpired(identifier: StableDocumentIdentifier): boolean {
   *     return false;
   *   }
   * }
   * ```
   *
   * @public
   * @property lifetimes
   * @type {CachePolicy|undefined}
   */
  declare lifetimes?: CachePolicy;

  // Private
  /** @internal */
  declare _graph?: Graph;
  /** @internal */
  declare _requestCache: RequestStateService;
  /** @internal */
  declare _instanceCache: InstanceCache;
  /** @internal */
  declare _cbs: { coalesce?: () => void; sync?: () => void; notify?: () => void } | null;
  /** @internal */
  declare _forceShim: boolean;
  /**
   * Async flush buffers notifications until flushed
   * by finalization of a future configured by store.request
   *
   * This is useful for ensuring that notifications are delivered
   * prior to the promise resolving but without risk of promise
   * interleaving.
   *
   * @internal
   */
  declare _enableAsyncFlush: boolean | null;

  // DEBUG-only properties
  /** @internal */
  declare DISABLE_WAITER?: boolean;
  /** @internal */
  declare _isDestroying: boolean;
  /** @internal */
  declare _isDestroyed: boolean;

  /** @internal */
  get isDestroying(): boolean {
    return this._isDestroying;
  }
  set isDestroying(value: boolean) {
    this._isDestroying = value;
  }
  /** @internal */
  get isDestroyed(): boolean {
    return this._isDestroyed;
  }
  set isDestroyed(value: boolean) {
    this._isDestroyed = value;
  }

  /**
    @private
  */
  constructor(createArgs?: unknown) {
    super(createArgs);
    Object.assign(this, createArgs);

    this.identifierCache = new IdentifierCache();

    this.notifications = new NotificationManager(this);

    // private but maybe useful to be here, somewhat intimate
    this.recordArrayManager = new RecordArrayManager({ store: this });

    // private
    this._requestCache = new RequestStateService(this);
    this._instanceCache = new InstanceCache(this);

    this.isDestroying = false;
    this.isDestroyed = false;
  }

  /** @internal */
  _run(cb: () => void) {
    assert(`WarpDrive should never encounter a nested run`, !this._cbs);
    const _cbs: { coalesce?: () => void; sync?: () => void; notify?: () => void } = (this._cbs = {});
    if (DEBUG) {
      try {
        cb();
        if (_cbs.coalesce) {
          _cbs.coalesce();
        }
        if (_cbs.sync) {
          _cbs.sync();
        }
        if (_cbs.notify) {
          _cbs.notify();
        }
      } finally {
        this._cbs = null;
      }
    } else {
      cb();
      if (_cbs.coalesce) {
        _cbs.coalesce();
      }
      if (_cbs.sync) {
        _cbs.sync();
      }
      if (_cbs.notify) {
        _cbs.notify();
      }
      this._cbs = null;
    }
  }

  /**
   * Executes the callback, ensurng that any work that calls
   * store._schedule is executed after in the right order.
   *
   * When queues already exist, scheduled callbacks will
   * join the existing queue.
   *
   * @internal
   */
  _join(cb: () => void): void {
    if (this._cbs) {
      cb();
    } else {
      this._run(cb);
    }
  }

  /** @internal */
  _schedule(name: 'coalesce' | 'sync' | 'notify', cb: () => void): void {
    assert(`WarpDrive expects to schedule only when there is an active run`, !!this._cbs);
    assert(`WarpDrive expects only one flush per queue name, cannot schedule ${name}`, !this._cbs[name]);

    this._cbs[name] = cb;
  }

  /**
   * Retrieve the RequestStateService instance
   * associated with this Store.
   *
   * This can be used to query the status of requests
   * that have been initiated for a given identifier.
   *
   * @return {RequestStateService}
   * @public
   */
  getRequestStateService(): RequestStateService {
    return this._requestCache;
  }

  /** @internal */
  _getAllPending(): (Promise<unknown[]> & { length: number }) | void {
    if (TESTING) {
      const all: Promise<unknown>[] = [];
      const pending = this._requestCache._pending;

      pending.forEach((requests) => {
        all.push(...requests.map((v) => v[RequestPromise]!));
      });
      this.requestManager._pending.forEach((v) => all.push(v));
      const promise: Promise<unknown[]> & { length: number } = Promise.allSettled(all) as Promise<unknown[]> & {
        length: number;
      };
      promise.length = all.length;
      return promise;
    }
  }

  /**
   * Issue a request via the configured RequestManager,
   * inserting the response into the cache and handing
   * back a Future which resolves to a ResponseDocument
   *
   * ## Cache Keys
   *
   * Only GET requests with a url or requests with an explicit
   * cache key (`cacheOptions.key`) will have the request result
   * and document cached.
   *
   * The cache key used is `requestConfig.cacheOptions.key`
   * if present, falling back to `requestConfig.url`.
   *
   * Params are not serialized as part of the cache-key, so
   * either ensure they are already in the url or utilize
   * `requestConfig.cacheOptions.key`. For queries issued
   * via the `POST` method `requestConfig.cacheOptions.key`
   * MUST be supplied for the document to be cached.
   *
   * ## Requesting Without a Cache Key
   *
   * Resource data within the request is always updated in the cache,
   * regardless of whether a cache key is present for the request.
   *
   * ## Fulfilling From Cache
   *
   * When a cache-key is determined, the request may fulfill
   * from cache provided the cache is not stale.
   *
   * Cache staleness is determined by the configured CachePolicy
   * with priority given to the `cacheOptions.reload` and
   * `cacheOptions.backgroundReload` on the request if present.
   *
   * If the cache data has soft expired or the request asks for a background
   * reload, the request will fulfill from cache if possible and
   * make a non-blocking request in the background to update the cache.
   *
   * If the cache data has hard expired or the request asks for a reload,
   * the request will not fulfill from cache and will make a blocking
   * request to update the cache.
   *
   * ## The Response
   *
   * The primary difference between `requestManager.request` and `store.request`
   * is that `store.request` will attempt to hydrate the response content into
   * a response Document containing RecordInstances.
   *
   * @param {StoreRequestInput} requestConfig
   * @return {Future}
   * @public
   */
  request<RT, T = unknown>(requestConfig: StoreRequestInput<RT, T>): Future<RT> {
    // we lazily set the cache handler when we issue the first request
    // because constructor doesn't allow for this to run after
    // the user has had the chance to set the prop.
    const opts: {
      store: Store;
      disableTestWaiter?: boolean;
      [EnableHydration]: boolean;
      records?: StableRecordIdentifier[];
    } = {
      store: this,
      [EnableHydration]: requestConfig[EnableHydration] ?? true,
    };

    if (requestConfig.records) {
      const identifierCache = this.identifierCache;
      opts.records = requestConfig.records.map((r) => identifierCache.getOrCreateRecordIdentifier(r));
    }

    if (TESTING) {
      if (this.DISABLE_WAITER) {
        opts.disableTestWaiter =
          typeof requestConfig.disableTestWaiter === 'boolean' ? requestConfig.disableTestWaiter : true;
      }
    }

    if (LOG_REQUESTS) {
      let options: unknown;
      try {
        options = JSON.parse(JSON.stringify(requestConfig));
      } catch {
        options = requestConfig;
      }
      // eslint-disable-next-line no-console
      console.log(
        `request: [[START]] ${requestConfig.op && !requestConfig.url ? '(LEGACY) ' : ''}${
          requestConfig.op || '<unknown operation>'
        } ${requestConfig.url || '<empty url>'}  ${requestConfig.method || '<empty method>'}`,
        options
      );
    }

    const request = Object.assign({}, requestConfig, opts);
    const future = this.requestManager.request(request);

    future.onFinalize(() => {
      if (LOG_REQUESTS) {
        // eslint-disable-next-line no-console
        console.log(
          `request: [[FINALIZE]] ${requestConfig.op && !requestConfig.url ? '(LEGACY) ' : ''}${
            requestConfig.op || '<unknown operation>'
          } ${requestConfig.url || '<empty url>'}  ${requestConfig.method || '<empty method>'}`
        );
      }
      // skip flush for legacy belongsTo
      if (requestConfig.op === 'findBelongsTo' && !requestConfig.url) {
        return;
      }
      this.notifications._flush();
    });

    return future;
  }

  /**
   * A hook which an app or addon may implement. Called when
   * the Store is attempting to create a Record Instance for
   * a resource.
   *
   * This hook can be used to select or instantiate any desired
   * mechanism of presenting cache data to the ui for access
   * mutation, and interaction.
   *
   * @param identifier
   * @param createRecordArgs
   * @param recordDataFor deprecated use this.cache
   * @param notificationManager deprecated use this.notifications
   * @return A record instance
   * @public
   */

  /**
   * A hook which an app or addon may implement. Called when
   * the Store is destroying a Record Instance. This hook should
   * be used to teardown any custom record instances instantiated
   * with `instantiateRecord`.
   *
   * @public
   * @param record
   */

  /**
    Returns the schema for a particular resource type (modelName).

    When used with Model from @ember-data/model the return is the model class,
    but this is not guaranteed.

    If looking to query attribute or relationship information it is
    recommended to use `getSchemaDefinitionService` instead. This method
    should be considered legacy and exists primarily to continue to support
    Adapter/Serializer APIs which expect it's return value in their method
    signatures.

    The class of a model might be useful if you want to get a list of all the
    relationship names of the model, see
    [`relationshipNames`](/ember-data/release/classes/Model?anchor=relationshipNames)
    for example.

    @public
    @deprecated
    @param {String} type
    @return {ModelSchema}
    */
  modelFor<T>(type: TypeFromInstance<T>): ModelSchema<T>;
  modelFor(type: string): ModelSchema;
  modelFor<T>(type: T extends TypedRecordInstance ? TypeFromInstance<T> : string): ModelSchema<T> {
    // FIXME add deprecation and deprecation stripping
    // FIXME/TODO update RFC to remove this method
    if (DEBUG) {
      assertDestroyedStoreOnly(this, 'modelFor');
    }
    assert(`You need to pass <type> to the store's modelFor method`, typeof type === 'string' && type.length);
    assert(`No model was found for '${type}' and no schema handles the type`, this.schema.hasResource({ type }));

    return getShimClass<T>(this, type);
  }

  /**
    Create a new record in the current store. The properties passed
    to this method are set on the newly created record.

    To create a new instance of a `Post`:

    ```js
    store.createRecord('post', {
      title: 'Ember is awesome!'
    });
    ```

    To create a new instance of a `Post` that has a relationship with a `User` record:

    ```js
    let user = this.store.peekRecord('user', '1');
    store.createRecord('post', {
      title: 'Ember is awesome!',
      user: user
    });
    ```

    @public
    @param {String} type the name of the resource
    @param {Object} inputProperties a hash of properties to set on the
      newly created record.
    @return {Model} record
  */
  createRecord<T>(type: TypeFromInstance<T>, inputProperties: CreateRecordProperties<T>): T;
  createRecord(type: string, inputProperties: CreateRecordProperties): OpaqueRecordInstance;
  createRecord(type: string, inputProperties: CreateRecordProperties): OpaqueRecordInstance {
    if (DEBUG) {
      assertDestroyingStore(this, 'createRecord');
    }
    assert(`You need to pass a model name to the store's createRecord method`, type);
    assert(
      `Passing classes to store methods has been removed. Please pass a dasherized string instead of ${type}`,
      typeof type === 'string'
    );

    // This is wrapped in a `run.join` so that in test environments users do not need to manually wrap
    //   calls to `createRecord`. The run loop usage here is because we batch the joining and updating
    //   of record-arrays via ember's run loop, not our own.
    //
    //   to remove this, we would need to move to a new `async` API.
    let record!: OpaqueRecordInstance;
    this._join(() => {
      const normalizedModelName = normalizeModelName(type);
      const properties = { ...inputProperties };

      // If the passed properties do not include a primary key,
      // give the adapter an opportunity to generate one. Typically,
      // client-side ID generators will use something like uuid.js
      // to avoid conflicts.
      let id: string | null = null;

      if (properties.id === null || properties.id === undefined) {
        upgradeStore(this);
        const adapter = this.adapterFor?.(normalizedModelName, true);

        if (adapter && adapter.generateIdForRecord) {
          id = properties.id = coerceId(adapter.generateIdForRecord(this, normalizedModelName, properties));
        } else {
          id = properties.id = null;
        }
      } else {
        id = properties.id = coerceId(properties.id);
      }

      const resource = { type: normalizedModelName, id };

      if (resource.id) {
        const identifier = this.identifierCache.peekRecordIdentifier(resource as ResourceIdentifierObject);

        assert(
          `The id ${String(properties.id)} has already been used with another '${normalizedModelName}' record.`,
          !identifier
        );
      }

      const identifier = this.identifierCache.createIdentifierForNewRecord(resource);
      const cache = this.cache;

      const createOptions = normalizeProperties(this, identifier, properties);
      const resultProps = cache.clientDidCreate(identifier, createOptions);

      record = this._instanceCache.getRecord(identifier, resultProps);
    });
    return record;
  }

  /**
    For symmetry, a record can be deleted via the store.

    Example

    ```javascript
    let post = store.createRecord('post', {
      title: 'Ember is awesome!'
    });

    store.deleteRecord(post);
    ```

    @public
    @param {unknown} record
  */
  deleteRecord<T>(record: T): void {
    if (DEBUG) {
      assertDestroyingStore(this, 'deleteRecord');
    }

    const identifier = peekRecordIdentifier(record);
    const cache = this.cache;
    assert(`expected the record to be connected to a cache`, identifier);
    this._join(() => {
      cache.setIsDeleted(identifier, true);

      if (cache.isNew(identifier)) {
        this._instanceCache.unloadRecord(identifier);
      }
    });
  }

  /**
    For symmetry, a record can be unloaded via the store.
    This will cause the record to be destroyed and freed up for garbage collection.

    Example

    ```javascript
    const { content: { data: post } } = await store.request(findRecord({ type: 'post', id: '1' }));
    store.unloadRecord(post);
    ```

    @public
    @param {Model} record
  */
  unloadRecord<T>(record: T): void {
    if (DEBUG) {
      assertDestroyingStore(this, 'unloadRecord');
    }
    const identifier = peekRecordIdentifier(record);
    if (identifier) {
      this._instanceCache.unloadRecord(identifier);
    }
  }

  /**
    This method returns a record for a given identifier or type and id combination.

    The `findRecord` method will always resolve its promise with the same
    object for a given identifier or type and `id`.

    The `findRecord` method will always return a **promise** that will be
    resolved with the record.

    **Example 1**

    ```js [app/routes/post.js]
    export default class PostRoute extends Route {
      model({ post_id }) {
        return this.store.findRecord('post', post_id);
      }
    }
    ```

    **Example 2**

    `findRecord` can be called with a single identifier argument instead of the combination
    of `type` (modelName) and `id` as separate arguments. You may recognize this combo as
    the typical pairing from [JSON:API](https://jsonapi.org/format/#document-resource-object-identification)

    ```js [app/routes/post.js]
    export default class PostRoute extends Route {
      model({ post_id: id }) {
        return this.store.findRecord({ type: 'post', id });
      }
    }
    ```

    **Example 3**

    If you have previously received an lid via an Identifier for this record, and the record
    has already been assigned an id, you can find the record again using just the lid.

    ```js [app/routes/post.js]
    store.findRecord({ lid });
    ```

    If the record is not yet available, the store will ask the adapter's `findRecord`
    method to retrieve and supply the necessary data. If the record is already present
    in the store, it depends on the reload behavior _when_ the returned promise
    resolves.

    ### Preloading

    You can optionally `preload` specific attributes and relationships that you know of
    by passing them via the passed `options`.

    For example, if your Ember route looks like `/posts/1/comments/2` and your API route
    for the comment also looks like `/posts/1/comments/2` if you want to fetch the comment
    without also fetching the post you can pass in the post to the `findRecord` call:

    ```js [app/routes/post-comments.js]
    export default class PostRoute extends Route {
      model({ post_id, comment_id: id }) {
        return this.store.findRecord({ type: 'comment', id, { preload: { post: post_id }} });
      }
    }
    ```

    In your adapter you can then access this id without triggering a network request via the
    snapshot:

    ```js [app/adapters/application.js]
    export default class Adapter {

      findRecord(store, schema, id, snapshot) {
        let type = schema.modelName;

        if (type === 'comment')
          let postId = snapshot.belongsTo('post', { id: true });

          return fetch(`./posts/${postId}/comments/${id}`)
            .then(response => response.json())
        }
      }

      static create() {
        return new this();
      }
    }
    ```

    This could also be achieved by supplying the post id to the adapter via the adapterOptions
    property on the options hash.

    ```js [app/routes/post-comments.js]
    export default class PostRoute extends Route {
      model({ post_id, comment_id: id }) {
        return this.store.findRecord({ type: 'comment', id, { adapterOptions: { post: post_id }} });
      }
    }
    ```

    ```js [app/adapters/application.js]
    export default class Adapter {
      findRecord(store, schema, id, snapshot) {
        let type = schema.modelName;

        if (type === 'comment')
          let postId = snapshot.adapterOptions.post;

          return fetch(`./posts/${postId}/comments/${id}`)
            .then(response => response.json())
        }
      }

      static create() {
        return new this();
      }
    }
    ```

    If you have access to the post model you can also pass the model itself to preload:

    ```javascript
    let post = await store.findRecord('post', '1');
    let comment = await store.findRecord('comment', '2', { post: myPostModel });
    ```

    ### Reloading

    The reload behavior is configured either via the passed `options` hash or
    the result of the adapter's `shouldReloadRecord`.

    If `{ reload: true }` is passed or `adapter.shouldReloadRecord` evaluates
    to `true`, then the returned promise resolves once the adapter returns
    data, regardless if the requested record is already in the store:

    ```js
    store.push({
      data: {
        id: 1,
        type: 'post',
        revision: 1
      }
    });

    // adapter#findRecord resolves with
    // [
    //   {
    //     id: 1,
    //     type: 'post',
    //     revision: 2
    //   }
    // ]
    store.findRecord('post', '1', { reload: true }).then(function(post) {
      post.revision; // 2
    });
    ```

    If no reload is indicated via the above mentioned ways, then the promise
    immediately resolves with the cached version in the store.

    ### Background Reloading

    Optionally, if `adapter.shouldBackgroundReloadRecord` evaluates to `true`,
    then a background reload is started, which updates the records' data, once
    it is available:

    ```js
    // app/adapters/post.js
    import ApplicationAdapter from "./application";

    export default class PostAdapter extends ApplicationAdapter {
      shouldReloadRecord(store, snapshot) {
        return false;
      },

      shouldBackgroundReloadRecord(store, snapshot) {
        return true;
      }
    });

    // ...

    store.push({
      data: {
        id: 1,
        type: 'post',
        revision: 1
      }
    });

    let blogPost = store.findRecord('post', '1').then(function(post) {
      post.revision; // 1
    });

    // later, once adapter#findRecord resolved with
    // [
    //   {
    //     id: 1,
    //     type: 'post',
    //     revision: 2
    //   }
    // ]

    blogPost.revision; // 2
    ```

    If you would like to force or prevent background reloading, you can set a
    boolean value for `backgroundReload` in the options object for
    `findRecord`.

    ```js [app/routes/post/edit.js]
    export default class PostEditRoute extends Route {
      model(params) {
        return this.store.findRecord('post', params.post_id, { backgroundReload: false });
      }
    }
    ```

    If you pass an object on the `adapterOptions` property of the options
    argument it will be passed to your adapter via the snapshot

    ```js [app/routes/post/edit.js]
    export default class PostEditRoute extends Route {
      model(params) {
        return this.store.findRecord('post', params.post_id, {
          adapterOptions: { subscribe: false }
        });
      }
    }
    ```

    ```js [app/adapters/post.js]
    import MyCustomAdapter from './custom-adapter';

    export default class PostAdapter extends MyCustomAdapter {
      findRecord(store, type, id, snapshot) {
        if (snapshot.adapterOptions.subscribe) {
          // ...
        }
        // ...
      }
    }
    ```

    See [peekRecord](../methods/peekRecord?anchor=peekRecord) to get the cached version of a record.

    ### Retrieving Related Model Records

    If you use an adapter such as Ember's default
    [`JSONAPIAdapter`](/ember-data/release/classes/JSONAPIAdapter)
    that supports the [JSON API specification](http://jsonapi.org/) and if your server
    endpoint supports the use of an
    ['include' query parameter](http://jsonapi.org/format/#fetching-includes),
    you can use `findRecord()` or `findAll()` to automatically retrieve additional records related to
    the one you request by supplying an `include` parameter in the `options` object.

    For example, given a `post` model that has a `hasMany` relationship with a `comment`
    model, when we retrieve a specific post we can have the server also return that post's
    comments in the same request:

    ```js [app/routes/post.js]
    export default class PostRoute extends Route {
      model(params) {
        return this.store.findRecord('post', params.post_id, { include: ['comments'] });
      }
    }
    ```

    ```js [app/adapters/application.js]
    export default class Adapter {
      findRecord(store, schema, id, snapshot) {
        let type = schema.modelName;

        if (type === 'post')
          let includes = snapshot.adapterOptions.include;

          return fetch(`./posts/${postId}?include=${includes}`)
            .then(response => response.json())
        }
      }

      static create() {
        return new this();
      }
    }
    ```

    In this case, the post's comments would then be available in your template as
    `model.comments`.

    Multiple relationships can be requested using an `include` parameter consisting of a
    list of relationship names, while nested relationships can be specified
    using a dot-separated sequence of relationship names. So to request both the post's
    comments and the authors of those comments the request would look like this:

    ```js [app/routes/post.js]
    export default class PostRoute extends Route {
      model(params) {
        return this.store.findRecord('post', params.post_id, { include: ['comments','comments.author'] });
      }
    }
    ```

    ### Retrieving Specific Fields by Type

    If your server endpoint supports the use of a ['fields' query parameter](https://jsonapi.org/format/#fetching-sparse-fieldsets),
    you can use pass those fields through to your server.  At this point in time, this requires a few manual steps on your part.

    1. Implement `buildQuery` in your adapter.

    ```js [app/adapters/application.js]
    buildQuery(snapshot) {
      let query = super.buildQuery(...arguments);

      let { fields } = snapshot.adapterOptions;

      if (fields) {
        query.fields = fields;
      }

      return query;
    }
    ```

    2. Then pass through the applicable fields to your `findRecord` request.

    Given a `post` model with attributes body, title, publishDate and meta, you can retrieve a filtered list of attributes.

    ```js [app/routes/post.js]
    export default class extends Route {
      model(params) {
        return this.store.findRecord('post', params.post_id, { adapterOptions: { fields: { post: 'body,title' } });
      }
    }
    ```

    Moreover, you can filter attributes on related models as well. If a `post` has a `belongsTo` relationship to a user,
    just include the relationship key and attributes.

    ```js [app/routes/post.js]
    export default class extends Route {
      model(params) {
        return this.store.findRecord('post', params.post_id, { adapterOptions: { fields: { post: 'body,title', user: 'name,email' } });
      }
    }
    ```

    @since 1.13.0
    @public
    @param {String|object} type - either a string representing the name of the resource or a ResourceIdentifier object containing both the type (a string) and the id (a string) for the record or an lid (a string) of an existing record
    @param {(String|Integer|Object)} id - optional object with options for the request only if the first param is a ResourceIdentifier, else the string id of the record to be retrieved
    @param {Object} [options] - if the first param is a string this will be the optional options for the request. See examples for available options.
    @return {Promise} promise
  */
  findRecord<T>(type: TypeFromInstance<T>, id: string | number, options?: FindRecordOptions<T>): Promise<T>;
  findRecord(type: string, id: string | number, options?: FindRecordOptions): Promise<unknown>;
  findRecord<T>(resource: ResourceIdentifierObject<TypeFromInstance<T>>, options?: FindRecordOptions<T>): Promise<T>;
  findRecord(resource: ResourceIdentifierObject, options?: FindRecordOptions): Promise<unknown>;
  findRecord(
    resource: string | ResourceIdentifierObject,
    id?: string | number | FindRecordOptions,
    options?: FindRecordOptions
  ): Promise<unknown> {
    if (DEBUG) {
      assertDestroyingStore(this, 'findRecord');
    }

    assert(
      `You need to pass a modelName or resource identifier as the first argument to the store's findRecord method`,
      resource
    );
    if (isMaybeIdentifier(resource)) {
      options = id as FindRecordOptions | undefined;
    } else {
      assert(
        `Passing classes to store methods has been removed. Please pass a dasherized string instead of ${resource}`,
        typeof resource === 'string'
      );
      const type = normalizeModelName(resource);
      const normalizedId = ensureStringId(id as string | number);
      resource = constructResource(type, normalizedId);
    }

    const identifier = this.identifierCache.getOrCreateRecordIdentifier(resource);
    options = options || {};

    if (options.preload) {
      // force reload if we preload to ensure we don't resolve the promise
      // until we are complete, else we will end up background-reloading
      // even for initial load.
      if (!this._instanceCache.recordIsLoaded(identifier)) {
        options.reload = true;
      }
      this._join(() => {
        preloadData(this, identifier, options.preload!);
      });
    }

    const promise = this.request<OpaqueRecordInstance>({
      op: 'findRecord',
      data: {
        record: identifier,
        options,
      },
      cacheOptions: { [SkipCache]: true },
    });

    return promise.then((document) => {
      return document.content;
    });
  }

  /**
    Get the reference for the specified record.

    Example

    ```javascript
    let userRef = store.getReference('user', '1');

    // check if the user is loaded
    let isLoaded = userRef.value() !== null;

    // get the record of the reference (null if not yet available)
    let user = userRef.value();

    // get the identifier of the reference
    if (userRef.remoteType() === 'id') {
    let id = userRef.id();
    }

    // load user (via store.find)
    userRef.load().then(...)

    // or trigger a reload
    userRef.reload().then(...)

    // provide data for reference
    userRef.push({ id: 1, username: '@user' }).then(function(user) {
      userRef.value() === user;
    });
    ```

    @public
    @param {String|object} resource - modelName (string) or Identifier (object)
    @param {String|Integer} id
    @since 2.5.0
    @return {RecordReference}
  */
  // TODO @deprecate getReference (and references generally)
  getReference(resource: string | ResourceIdentifierObject, id: string | number): RecordReference {
    if (DEBUG) {
      assertDestroyingStore(this, 'getReference');
    }

    let resourceIdentifier: ResourceIdentifierObject;
    if (arguments.length === 1 && isMaybeIdentifier(resource)) {
      resourceIdentifier = resource;
    } else {
      const type = normalizeModelName(resource as string);
      const normalizedId = ensureStringId(id);
      resourceIdentifier = constructResource(type, normalizedId);
    }

    assert(
      'getReference expected to receive either a resource identifier or type and id as arguments',
      isMaybeIdentifier(resourceIdentifier)
    );

    const identifier: StableRecordIdentifier = this.identifierCache.getOrCreateRecordIdentifier(resourceIdentifier);

    return this._instanceCache.getReference(identifier);
  }

  /**
    Get a record by a given type and ID without triggering a fetch.

    This method will synchronously return the record if it is available in the store,
    otherwise it will return `null`. A record is available if it has been fetched earlier, or
    pushed manually into the store.

    See [findRecord](../methods/findRecord?anchor=findRecord) if you would like to request this record from the backend.

    _Note: This is a synchronous method and does not return a promise._

    **Example 1**

    ```js
    let post = store.peekRecord('post', '1');

    post.id; // '1'
    ```

    `peekRecord` can be called with a single identifier argument instead of the combination
    of `type` (modelName) and `id` as separate arguments. You may recognize this combo as
    the typical pairing from [JSON:API](https://jsonapi.org/format/#document-resource-object-identification)

    **Example 2**

    ```js
    let post = store.peekRecord({ type: 'post', id });
    post.id; // '1'
    ```

    If you have previously received an lid from an Identifier for this record, you can lookup the record again using
    just the lid.

    **Example 3**

    ```js
    let post = store.peekRecord({ lid });
    post.id; // '1'
    ```


    @since 1.13.0
    @public
    @param {String|object} modelName - either a string representing the modelName or a ResourceIdentifier object containing both the type (a string) and the id (a string) for the record or an lid (a string) of an existing record
    @param {String|Integer} id - optional only if the first param is a ResourceIdentifier, else the string id of the record to be retrieved.
    @return {Model|null} record
  */
  peekRecord<T>(type: TypeFromInstance<T>, id: string | number): T | null;
  peekRecord(type: string, id: string | number): unknown | null;
  peekRecord<T>(identifier: ResourceIdentifierObject<TypeFromInstance<T>>): T | null;
  peekRecord(identifier: ResourceIdentifierObject): unknown | null;
  peekRecord<T = OpaqueRecordInstance>(identifier: ResourceIdentifierObject | string, id?: string | number): T | null {
    if (arguments.length === 1 && isMaybeIdentifier(identifier)) {
      const stableIdentifier = this.identifierCache.peekRecordIdentifier(identifier);
      const isLoaded = stableIdentifier && this._instanceCache.recordIsLoaded(stableIdentifier);
      // TODO come up with a better mechanism for determining if we have data and could peek.
      // this is basically an "are we not empty" query.
      return isLoaded ? (this._instanceCache.getRecord(stableIdentifier) as T) : null;
    }

    if (DEBUG) {
      assertDestroyingStore(this, 'peekRecord');
    }

    assert(`You need to pass a model name to the store's peekRecord method`, identifier);
    assert(
      `Passing classes to store methods has been removed. Please pass a dasherized string instead of ${String(
        identifier
      )}`,
      typeof identifier === 'string'
    );

    const type = normalizeModelName(identifier);
    const normalizedId = ensureStringId(id);
    const resource = { type, id: normalizedId };
    const stableIdentifier = this.identifierCache.peekRecordIdentifier(resource);
    const isLoaded = stableIdentifier && this._instanceCache.recordIsLoaded(stableIdentifier);

    return isLoaded ? (this._instanceCache.getRecord(stableIdentifier) as T) : null;
  }

  /**
    This method delegates a query to the adapter. This is the one place where
    adapter-level semantics are exposed to the application.

    Each time this method is called a new request is made through the adapter.

    Exposing queries this way seems preferable to creating an abstract query
    language for all server-side queries, and then require all adapters to
    implement them.

    ---

    If you do something like this:

    ```javascript
    store.query('person', { page: 1 });
    ```

    The request made to the server will look something like this:

    ```
    GET "/api/v1/person?page=1"
    ```

    ---

    If you do something like this:

    ```javascript
    store.query('person', { ids: ['1', '2', '3'] });
    ```

    The request made to the server will look something like this:

    ```
    GET "/api/v1/person?ids%5B%5D=1&ids%5B%5D=2&ids%5B%5D=3"
    decoded: "/api/v1/person?ids[]=1&ids[]=2&ids[]=3"
    ```

    This method returns a promise, which is resolved with a
    [`Collection`](/ember-data/release/classes/Collection)
    once the server returns.

    @since 1.13.0
    @public
    @param {String} type the name of the resource
    @param {Object} query a query to be used by the adapter
    @param {Object} options optional, may include `adapterOptions` hash which will be passed to adapter.query
    @return {Promise} promise
  */
  query<T>(type: TypeFromInstance<T>, query: LegacyResourceQuery<T>, options?: QueryOptions): Promise<Collection<T>>;
  query(type: string, query: LegacyResourceQuery, options?: QueryOptions): Promise<Collection>;
  query(type: string, query: LegacyResourceQuery, options: QueryOptions = {}): Promise<Collection> {
    if (DEBUG) {
      assertDestroyingStore(this, 'query');
    }
    assert(`You need to pass a model name to the store's query method`, type);
    assert(`You need to pass a query hash to the store's query method`, query);
    assert(
      `Passing classes to store methods has been removed. Please pass a dasherized string instead of ${type}`,
      typeof type === 'string'
    );

    const promise = this.request<Collection>({
      op: 'query',
      data: {
        type: normalizeModelName(type),
        query,
        options: options,
      },
      cacheOptions: { [SkipCache]: true },
    });

    return promise.then((document) => document.content);
  }

  /**
    This method makes a request for one record, where the `id` is not known
    beforehand (if the `id` is known, use [`findRecord`](../methods/findRecord?anchor=findRecord)
    instead).

    This method can be used when it is certain that the server will return a
    single object for the primary data.

    Each time this method is called a new request is made through the adapter.

    Let's assume our API provides an endpoint for the currently logged in user
    via:

    ```
    // GET /api/current_user
    {
      user: {
        id: 1234,
        username: 'admin'
      }
    }
    ```

    Since the specific `id` of the `user` is not known beforehand, we can use
    `queryRecord` to get the user:

    ```javascript
    store.queryRecord('user', {}).then(function(user) {
      let username = user.username;
      // do thing
    });
    ```

    The request is made through the adapters' `queryRecord`:

    ```js [app/adapters/user.js]
    import Adapter from '@ember-data/adapter';
    import $ from 'jquery';

    export default class UserAdapter extends Adapter {
      queryRecord(modelName, query) {
        return $.getJSON('/api/current_user');
      }
    }
    ```

    Note: the primary use case for `store.queryRecord` is when a single record
    is queried and the `id` is not known beforehand. In all other cases
    `store.query` and using the first item of the array is likely the preferred
    way:

    ```
    // GET /users?username=unique
    {
      data: [{
        id: 1234,
        type: 'user',
        attributes: {
          username: "unique"
        }
      }]
    }
    ```

    ```javascript
    store.query('user', { username: 'unique' }).then(function(users) {
      return users.firstObject;
    }).then(function(user) {
      let id = user.id;
    });
    ```

    This method returns a promise, which resolves with the found record.

    If the adapter returns no data for the primary data of the payload, then
    `queryRecord` resolves with `null`:

    ```
    // GET /users?username=unique
    {
      data: null
    }
    ```

    ```javascript
    store.queryRecord('user', { username: 'unique' }).then(function(user) {
       // user is null
    });
    ```

    @since 1.13.0
    @public
    @param {String} type
    @param {Object} query an opaque query to be used by the adapter
    @param {Object} options optional, may include `adapterOptions` hash which will be passed to adapter.queryRecord
    @return {Promise} promise which resolves with the found record or `null`
  */
  queryRecord<T>(type: TypeFromInstance<T>, query: LegacyResourceQuery<T>, options?: QueryOptions): Promise<T | null>;
  queryRecord(type: string, query: LegacyResourceQuery, options?: QueryOptions): Promise<unknown | null>;
  queryRecord(
    type: string,
    query: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<OpaqueRecordInstance | null> {
    if (DEBUG) {
      assertDestroyingStore(this, 'queryRecord');
    }
    assert(`You need to pass a model name to the store's queryRecord method`, type);
    assert(`You need to pass a query hash to the store's queryRecord method`, query);
    assert(
      `Passing classes to store methods has been removed. Please pass a dasherized string instead of ${type}`,
      typeof type === 'string'
    );

    const promise = this.request<OpaqueRecordInstance | null>({
      op: 'queryRecord',
      data: {
        type: normalizeModelName(type),
        query,
        options: options || {},
      },
      cacheOptions: { [SkipCache]: true },
    });

    return promise.then((document) => document.content);
  }

  /**
    `findAll` asks the adapter's `findAll` method to find the records for the
    given type, and returns a promise which will resolve with all records of
    this type present in the store, even if the adapter only returns a subset
    of them.

    ```js [app/routes/authors.js]
    export default class AuthorsRoute extends Route {
      model(params) {
        return this.store.findAll('author');
      }
    }
    ```

    _When_ the returned promise resolves depends on the reload behavior,
    configured via the passed `options` hash and the result of the adapter's
    `shouldReloadAll` method.

    ### Reloading

    If `{ reload: true }` is passed or `adapter.shouldReloadAll` evaluates to
    `true`, then the returned promise resolves once the adapter returns data,
    regardless if there are already records in the store:

    ```js
    store.push({
      data: {
        id: 'first',
        type: 'author'
      }
    });

    // adapter#findAll resolves with
    // [
    //   {
    //     id: 'second',
    //     type: 'author'
    //   }
    // ]
    store.findAll('author', { reload: true }).then(function(authors) {
      authors.getEach('id'); // ['first', 'second']
    });
    ```

    If no reload is indicated via the above mentioned ways, then the promise
    immediately resolves with all the records currently loaded in the store.

    ### Background Reloading

    Optionally, if `adapter.shouldBackgroundReloadAll` evaluates to `true`,
    then a background reload is started. Once this resolves, the array with
    which the promise resolves, is updated automatically so it contains all the
    records in the store:

    ```js [app/adapters/application.js]
    import Adapter from '@ember-data/adapter';

    export default class ApplicationAdapter extends Adapter {
      shouldReloadAll(store, snapshotsArray) {
        return false;
      },

      shouldBackgroundReloadAll(store, snapshotsArray) {
        return true;
      }
    });

    // ...

    store.push({
      data: {
        id: 'first',
        type: 'author'
      }
    });

    let allAuthors;
    store.findAll('author').then(function(authors) {
      authors.getEach('id'); // ['first']

      allAuthors = authors;
    });

    // later, once adapter#findAll resolved with
    // [
    //   {
    //     id: 'second',
    //     type: 'author'
    //   }
    // ]

    allAuthors.getEach('id'); // ['first', 'second']
    ```

    If you would like to force or prevent background reloading, you can set a
    boolean value for `backgroundReload` in the options object for
    `findAll`.

    ```js [app/routes/post/edit.js]
    export default class PostEditRoute extends Route {
      model() {
        return this.store.findAll('post', { backgroundReload: false });
      }
    }
    ```

    If you pass an object on the `adapterOptions` property of the options
    argument it will be passed to you adapter via the `snapshotRecordArray`

    ```js [app/routes/posts.js]
    export default class PostsRoute extends Route {
      model(params) {
        return this.store.findAll('post', {
          adapterOptions: { subscribe: false }
        });
      }
    }
    ```

    ```js [app/adapters/post.js]
    import MyCustomAdapter from './custom-adapter';

    export default class UserAdapter extends MyCustomAdapter {
      findAll(store, type, sinceToken, snapshotRecordArray) {
        if (snapshotRecordArray.adapterOptions.subscribe) {
          // ...
        }
        // ...
      }
    }
    ```

    See [peekAll](../methods/peekAll?anchor=peekAll) to get an array of current records in the
    store, without waiting until a reload is finished.

    ### Retrieving Related Model Records

    If you use an adapter such as Ember's default
    [`JSONAPIAdapter`](/ember-data/release/classes/JSONAPIAdapter)
    that supports the [JSON API specification](http://jsonapi.org/) and if your server
    endpoint supports the use of an
    ['include' query parameter](http://jsonapi.org/format/#fetching-includes),
    you can use `findAll()` to automatically retrieve additional records related to
    those requested by supplying an `include` parameter in the `options` object.

    For example, given a `post` model that has a `hasMany` relationship with a `comment`
    model, when we retrieve all of the post records we can have the server also return
    all of the posts' comments in the same request:

    ```js [app/routes/posts.js]
    export default class PostsRoute extends Route {
      model() {
        return this.store.findAll('post', { include: ['comments'] });
      }
    }
    ```
    Multiple relationships can be requested using an `include` parameter consisting of a
    list or relationship names, while nested relationships can be specified
    using a dot-separated sequence of relationship names. So to request both the posts'
    comments and the authors of those comments the request would look like this:

    ```js [app/routes/posts.js]
    export default class PostsRoute extends Route {
      model() {
        return this.store.findAll('post', { include: ['comments','comments.author'] });
      }
    }
    ```

    See [query](../methods/query?anchor=query) to only get a subset of records from the server.

    @since 1.13.0
    @public
    @param {String} type the name of the resource
    @param {Object} options
    @return {Promise} promise
  */
  findAll<T>(type: TypeFromInstance<T>, options?: FindAllOptions<T>): Promise<IdentifierArray<T>>;
  findAll(type: string, options?: FindAllOptions): Promise<IdentifierArray>;
  findAll<T>(type: TypeFromInstance<T> | string, options: FindAllOptions = {}): Promise<IdentifierArray<T>> {
    if (DEBUG) {
      assertDestroyingStore(this, 'findAll');
    }
    assert(`You need to pass a model name to the store's findAll method`, type);
    assert(
      `Passing classes to store methods has been removed. Please pass a dasherized string instead of ${type}`,
      typeof type === 'string'
    );

    const promise = this.request<IdentifierArray<T>>({
      op: 'findAll',
      data: {
        type: normalizeModelName(type),
        options: options || {},
      },
      cacheOptions: { [SkipCache]: true },
    });

    return promise.then((document) => document.content);
  }

  /**
    This method returns a filtered array that contains all of the
    known records for a given type in the store.

    Note that because it's just a filter, the result will contain any
    locally created records of the type, however, it will not make a
    request to the backend to retrieve additional records. If you
    would like to request all the records from the backend please use
    [store.findAll](../methods/findAll?anchor=findAll).

    Also note that multiple calls to `peekAll` for a given type will always
    return the same `RecordArray`.

    Example

    ```javascript
    let localPosts = store.peekAll('post');
    ```

    @since 1.13.0
    @public
    @param {String} type the name of the resource
    @return {RecordArray}
  */
  peekAll<T>(type: TypeFromInstance<T>): IdentifierArray<T>;
  peekAll(type: string): IdentifierArray;
  peekAll(type: string): IdentifierArray {
    if (DEBUG) {
      assertDestroyingStore(this, 'peekAll');
    }
    assert(`You need to pass a model name to the store's peekAll method`, type);
    assert(
      `Passing classes to store methods has been removed. Please pass a dasherized string instead of ${type}`,
      typeof type === 'string'
    );

    return this.recordArrayManager.liveArrayFor(normalizeModelName(type));
  }

  /**
    This method unloads all records in the store.
    It schedules unloading to happen during the next run loop.

    Optionally you can pass a type which unload all records for a given type.

    ```javascript
    store.unloadAll();
    store.unloadAll('post');
    ```

    @param {String} type the name of the resource
    @public
  */
  unloadAll<T>(type: TypeFromInstance<T>): void;
  unloadAll(type?: string): void;
  unloadAll(type?: string) {
    if (DEBUG) {
      assertDestroyedStoreOnly(this, 'unloadAll');
    }
    assert(
      `Passing classes to store methods has been removed. Please pass a dasherized string instead of ${String(type)}`,
      !type || typeof type === 'string'
    );

    this._join(() => {
      if (type === undefined) {
        // destroy the graph before unloadAll
        // since then we avoid churning relationships
        // during unload
        this._graph?.identifiers.clear();

        this.recordArrayManager.clear();
        this._instanceCache.clear();
      } else {
        this._instanceCache.clear(normalizeModelName(type));
      }
    });
  }

  /**
    Push some data for a given type into the store.

    This method expects normalized [JSON API](http://jsonapi.org/) document. This means you have to follow [JSON API specification](http://jsonapi.org/format/) with few minor adjustments:
    - record's `type` should always be in singular, dasherized form
    - members (properties) should be camelCased

    [Your primary data should be wrapped inside `data` property](http://jsonapi.org/format/#document-top-level):

    ```js
    store.push({
      data: {
        // primary data for single record of type `Person`
        id: '1',
        type: 'person',
        attributes: {
          firstName: 'Daniel',
          lastName: 'Kmak'
        }
      }
    });
    ```

    [Demo.](http://ember-twiddle.com/fb99f18cd3b4d3e2a4c7)

    `data` property can also hold an array (of records):

    ```js
    store.push({
      data: [
        // an array of records
        {
          id: '1',
          type: 'person',
          attributes: {
            firstName: 'Daniel',
            lastName: 'Kmak'
          }
        },
        {
          id: '2',
          type: 'person',
          attributes: {
            firstName: 'Tom',
            lastName: 'Dale'
          }
        }
      ]
    });
    ```

    [Demo.](http://ember-twiddle.com/69cdbeaa3702159dc355)

    There are some typical properties for `JSONAPI` payload:
    * `id` - mandatory, unique record's key
    * `type` - mandatory string which matches `model`'s dasherized name in singular form
    * `attributes` - object which holds data for record attributes - `attr`'s declared in model
    * `relationships` - object which must contain any of the following properties under each relationships' respective key (example path is `relationships.achievements.data`):
      - [`links`](http://jsonapi.org/format/#document-links)
      - [`data`](http://jsonapi.org/format/#document-resource-object-linkage) - place for primary data
      - [`meta`](http://jsonapi.org/format/#document-meta) - object which contains meta-information about relationship

    For this model:

    ```js [app/models/person.js]
    import Model, { attr, hasMany } from '@ember-data/model';

    export default class PersonRoute extends Route {
      @attr('string') firstName;
      @attr('string') lastName;

      @hasMany('person') children;
    }
    ```

    To represent the children as IDs:

    ```js
    {
      data: {
        id: '1',
        type: 'person',
        attributes: {
          firstName: 'Tom',
          lastName: 'Dale'
        },
        relationships: {
          children: {
            data: [
              {
                id: '2',
                type: 'person'
              },
              {
                id: '3',
                type: 'person'
              },
              {
                id: '4',
                type: 'person'
              }
            ]
          }
        }
      }
    }
    ```

    [Demo.](http://ember-twiddle.com/343e1735e034091f5bde)

    To represent the children relationship as a URL:

    ```js
    {
      data: {
        id: '1',
        type: 'person',
        attributes: {
          firstName: 'Tom',
          lastName: 'Dale'
        },
        relationships: {
          children: {
            links: {
              related: '/people/1/children'
            }
          }
        }
      }
    }
    ```

    If you're streaming data or implementing an adapter, make sure
    that you have converted the incoming data into this form. The
    store's [normalize](../methods/normalize?anchor=normalize) method is a convenience
    helper for converting a json payload into the form Ember Data
    expects.

    ```js
    store.push(store.normalize('person', data));
    ```

    This method can be used both to push in brand new
    records, as well as to update existing records.

    @public
    @param {Object} data
    @return the record(s) that was created or
      updated.
  */
  push(data: EmptyResourceDocument): null;
  push<T>(data: SingleResourceDocument<TypeFromInstance<T>>): T;
  push(data: SingleResourceDocument): OpaqueRecordInstance;
  push<T>(data: CollectionResourceDocument<TypeFromInstance<T>>): T[];
  push(data: CollectionResourceDocument): OpaqueRecordInstance[];
  push(data: JsonApiDocument): OpaqueRecordInstance | OpaqueRecordInstance[] | null {
    if (DEBUG) {
      assertDestroyingStore(this, 'push');
    }
    const pushed = this._push(data, false);

    if (Array.isArray(pushed)) {
      return pushed.map((identifier) => this._instanceCache.getRecord(identifier));
    }

    if (pushed === null) {
      return null;
    }

    return this._instanceCache.getRecord(pushed);
  }

  /**
    Push some data in the form of a json-api document into the store,
    without creating materialized records.

    @private
    @param {Object} jsonApiDoc
    @return {StableRecordIdentifier|Array<StableRecordIdentifier>|null} identifiers for the primary records that had data loaded
  */
  _push(
    jsonApiDoc: JsonApiDocument,
    asyncFlush?: boolean
  ): StableExistingRecordIdentifier | StableExistingRecordIdentifier[] | null {
    if (DEBUG) {
      assertDestroyingStore(this, '_push');
    }
    if (asyncFlush) {
      this._enableAsyncFlush = true;
    }

    let ret!: ResourceDocument;
    this._join(() => {
      ret = this.cache.put({ content: jsonApiDoc });
    });

    this._enableAsyncFlush = null;

    return 'data' in ret ? ret.data : null;
  }

  /**
   * Trigger a save for a Record.
   *
   * Returns a promise resolving with the same record when the save is complete.
   *
   * @public
   * @param {unknown} record
   * @param options
   * @return {Promise<record>}
   */
  saveRecord<T>(record: T, options: Record<string, unknown> = {}): Promise<T> {
    if (DEBUG) {
      assertDestroyingStore(this, 'saveRecord');
    }
    assert(`Unable to initiate save for a record in a disconnected state`, storeFor(record));
    const identifier = recordIdentifierFor(record);
    const cache = this.cache;

    if (!identifier) {
      // this commonly means we're disconnected
      // but just in case we reject here to prevent bad things.
      return Promise.reject(new Error(`Record Is Disconnected`));
    }
    assert(
      `Cannot initiate a save request for an unloaded record: ${identifier.lid}`,
      this._instanceCache.recordIsLoaded(identifier)
    );
    if (resourceIsFullyDeleted(this._instanceCache, identifier)) {
      return Promise.resolve(record);
    }

    if (!options) {
      options = {};
    }
    let operation: 'createRecord' | 'deleteRecord' | 'updateRecord' = 'updateRecord';

    if (cache.isNew(identifier)) {
      operation = 'createRecord';
    } else if (cache.isDeleted(identifier)) {
      operation = 'deleteRecord';
    }

    const request = {
      op: operation,
      data: {
        options,
        record: identifier,
      },
      records: [identifier],
      cacheOptions: { [SkipCache]: true },
    };

    return this.request<T>(request).then((document) => document.content);
  }

  /**
   * Instantiation hook allowing applications or addons to configure the store
   * to utilize a custom Cache implementation.
   *
   * This hook should not be called directly by consuming applications or libraries.
   * Use `Store.cache` to access the Cache instance.
   *
   * @public
   * @param storeWrapper
   * @return {Cache}
   */

  /**
   * Returns the cache instance associated to this Store, instantiates the Cache
   * if necessary via `Store.createCache`
   *
   * @property cache
   * @type {Cache}
   * @public
   */
  get cache(): ReturnType<this['createCache']> {
    let { cache } = this._instanceCache;
    if (!cache) {
      cache = this._instanceCache.cache = this.createCache(this._instanceCache._storeWrapper);
      if (DEBUG) {
        cache = new CacheManager(cache);
      }
    }

    return cache as ReturnType<this['createCache']>;
  }

  destroy(): void {
    if (this.isDestroyed) {
      // @ember/test-helpers will call destroy multiple times
      return;
    }
    this.isDestroying = true;

    this._graph?.destroy();
    this._graph = undefined;

    this.notifications.destroy();
    this.recordArrayManager.destroy();
    this.identifierCache.destroy();

    this.unloadAll();
    this.isDestroyed = true;
  }

  static create(args?: Record<string, unknown>) {
    return new this(args);
  }
}

if (ENABLE_LEGACY_SCHEMA_SERVICE) {
  Store.prototype.getSchemaDefinitionService = function (): SchemaService {
    assert(`You must registerSchemaDefinitionService with the store to use custom model classes`, this._schema);
    deprecate(`Use \`store.schema\` instead of \`store.getSchemaDefinitionService()\``, false, {
      id: 'ember-data:schema-service-updates',
      until: '6.0',
      for: 'ember-data',
      since: {
        available: '4.13',
        enabled: '5.4',
      },
    });
    return this._schema;
  };
  Store.prototype.registerSchemaDefinitionService = function (schema: SchemaService) {
    deprecate(`Use \`store.createSchemaService\` instead of \`store.registerSchemaDefinitionService()\``, false, {
      id: 'ember-data:schema-service-updates',
      until: '6.0',
      for: 'ember-data',
      since: {
        available: '4.13',
        enabled: '5.4',
      },
    });
    this._schema = schema;
  };
  Store.prototype.registerSchema = function (schema: SchemaService) {
    deprecate(`Use \`store.createSchemaService\` instead of \`store.registerSchema()\``, false, {
      id: 'ember-data:schema-service-updates',
      until: '6.0',
      for: 'ember-data',
      since: {
        available: '4.13',
        enabled: '5.4',
      },
    });
    this._schema = schema;
  };
}

let assertDestroyingStore: (store: Store, method: string) => void;
let assertDestroyedStoreOnly: (store: Store, method: string) => void;

if (DEBUG) {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  assertDestroyingStore = function assertDestroyingStore(store: Store, method: string) {
    assert(
      `Attempted to call store.${method}(), but the store instance has already been destroyed.`,
      !(store.isDestroying || store.isDestroyed)
    );
  };
  // eslint-disable-next-line @typescript-eslint/no-shadow
  assertDestroyedStoreOnly = function assertDestroyedStoreOnly(store: Store, method: string) {
    assert(
      `Attempted to call store.${method}(), but the store instance has already been destroyed.`,
      !store.isDestroyed
    );
  };
}

function isMaybeIdentifier(
  maybeIdentifier: string | ResourceIdentifierObject
): maybeIdentifier is ResourceIdentifierObject {
  return Boolean(
    maybeIdentifier !== null &&
      typeof maybeIdentifier === 'object' &&
      (('id' in maybeIdentifier && 'type' in maybeIdentifier && maybeIdentifier.id && maybeIdentifier.type) ||
        maybeIdentifier.lid)
  );
}

function normalizeProperties(
  store: Store,
  identifier: StableRecordIdentifier,
  properties?: { [key: string]: unknown }
): { [key: string]: unknown } | undefined {
  // assert here
  if (properties !== undefined) {
    if ('id' in properties) {
      assert(`expected id to be a string or null`, properties.id !== undefined);
    }
    assert(
      `You passed '${typeof properties}' as properties for record creation instead of an object.`,
      typeof properties === 'object' && properties !== null
    );

    const { type } = identifier;

    // convert relationship Records to RecordDatas before passing to RecordData
    const defs = store.schema.fields({ type });

    if (defs.size) {
      const keys = Object.keys(properties);

      for (let i = 0; i < keys.length; i++) {
        const prop = keys[i];
        const field = defs.get(prop);

        if (!field) continue;

        if (field.kind === 'hasMany') {
          if (DEBUG) {
            assertRecordsPassedToHasMany(properties[prop] as OpaqueRecordInstance[]);
          }
          properties[prop] = extractIdentifiersFromRecords(properties[prop] as OpaqueRecordInstance[]);
        } else if (field.kind === 'belongsTo') {
          properties[prop] = extractIdentifierFromRecord(properties[prop]);
        }
      }
    }
  }
  return properties;
}

function assertRecordsPassedToHasMany(records: OpaqueRecordInstance[]) {
  assert(`You must pass an array of records to set a hasMany relationship`, Array.isArray(records));
  assert(
    `All elements of a hasMany relationship must be instances of Model, you passed ${records
      .map((r) => `${typeof r}`)
      .join(', ')}`,
    (function () {
      return records.every((record) => {
        try {
          recordIdentifierFor(record);
          return true;
        } catch {
          return false;
        }
      });
    })()
  );
}

function extractIdentifiersFromRecords(records: OpaqueRecordInstance[]): StableRecordIdentifier[] {
  return records.map((record) => extractIdentifierFromRecord(record)) as StableRecordIdentifier[];
}

type PromiseProxyRecord = { then(): void; content: OpaqueRecordInstance | null | undefined };

function extractIdentifierFromRecord(recordOrPromiseRecord: PromiseProxyRecord | OpaqueRecordInstance | null) {
  if (!recordOrPromiseRecord) {
    return null;
  }
  const extract = recordIdentifierFor;

  return extract(recordOrPromiseRecord);
}
