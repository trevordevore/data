'use strict';

const getChannelURL = require('ember-source-channel-url');

module.exports = function () {
  return Promise.all([getChannelURL('release'), getChannelURL('beta'), getChannelURL('canary')]).then((urls) => {
    return {
      command: 'echo "scenario ready"',
      buildManagerOptions(scenario) {
        return ['--ignore-scripts', '--prefer-offline', '--no-frozen-lockfile'];
      },
      packageManager: 'pnpm',
      scenarios: [
        {
          name: 'ember-lts-4.4',
          npm: {
            devDependencies: {
              'ember-source': '~4.4.5',
              '@glimmer/component': '^1.1.2',
            },
          },
        },
        {
          name: 'ember-lts-4.8',
          npm: {
            devDependencies: {
              'ember-source': '~4.8.0',
              '@glimmer/component': '^1.1.2',
            },
          },
        },
        {
          name: 'ember-lts-4.12',
          npm: {
            devDependencies: {
              'ember-source': '~4.12.3',
            },
          },
        },
        {
          name: 'ember-lts-5.4',
          npm: {
            devDependencies: {
              'ember-source': '~5.4.0',
            },
          },
        },
        {
          name: 'ember-lts-5.8',
          npm: {
            devDependencies: {
              'ember-source': '~5.8.0',
            },
          },
        },
        {
          name: 'ember-lts-5.12',
          npm: {
            devDependencies: {
              'ember-source': '~5.12.0',
            },
          },
        },
        {
          name: 'ember-lts-3.28',
          npm: {
            devDependencies: {
              'ember-cli': '~4.12.3',
              'ember-source': '~3.28.12',
              '@glimmer/component': '^1.1.2',
            },
          },
        },
        {
          name: 'ember-release',
          npm: {
            devDependencies: {
              'ember-source': urls[0],
            },
          },
        },
        {
          name: 'ember-beta',
          npm: {
            devDependencies: {
              'ember-source': urls[1],
            },
          },
        },
        {
          name: 'ember-canary',
          npm: {
            devDependencies: {
              'ember-source': urls[2],
            },
          },
        },
      ],
    };
  });
};
