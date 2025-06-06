import { deprecate } from '@ember/debug';

import { DEPRECATE_NON_STRICT_TYPES } from '@warp-drive/core/build-config/deprecations';

import { dasherize } from '../../../utils/string.ts';

export function normalizeModelName(type: string): string {
  if (DEPRECATE_NON_STRICT_TYPES) {
    const result = dasherize(type);

    deprecate(
      `The resource type '${type}' is not normalized. Update your application code to use '${result}' instead of '${type}'.`,
      result === type,
      {
        id: 'ember-data:deprecate-non-strict-types',
        until: '6.0',
        for: 'ember-data',
        since: {
          available: '4.13',
          enabled: '5.3',
        },
      }
    );

    return result;
  }

  return type;
}
