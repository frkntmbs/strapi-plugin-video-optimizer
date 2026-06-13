export default {
  admin: {
    type: 'admin',
    routes: [
      {
        method: 'GET',
        path: '/default-mode',
        handler: 'preference.getDefaultMode',
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
        },
      },
      {
        method: 'GET',
        path: '/preference',
        handler: 'preference.getPreference',
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
        },
      },
      {
        method: 'PUT',
        path: '/preference',
        handler: 'preference.updatePreference',
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
        },
      },
      {
        method: 'GET',
        path: '/settings',
        handler: 'preference.getSettings',
        config: {
          policies: [
            'admin::isAuthenticatedAdmin',
            {
              name: 'admin::hasPermissions',
              config: {
                actions: ['plugin::video-optimizer.settings.read'],
              },
            },
          ],
        },
      },
      {
        method: 'PUT',
        path: '/settings',
        handler: 'preference.updateSettings',
        config: {
          policies: [
            'admin::isAuthenticatedAdmin',
            {
              name: 'admin::hasPermissions',
              config: {
                actions: ['plugin::video-optimizer.settings.update'],
              },
            },
          ],
        },
      },
      {
        method: 'GET',
        path: '/jobs/active',
        handler: 'job.listActive',
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
        },
      },
      {
        method: 'GET',
        path: '/jobs/by-files',
        handler: 'job.getJobsByFiles',
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
        },
      },
      {
        method: 'POST',
        path: '/jobs/enqueue',
        handler: 'job.enqueueFile',
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
        },
      },
      {
        method: 'POST',
        path: '/jobs/cancel',
        handler: 'job.cancelForFile',
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
        },
      },
      {
        method: 'GET',
        path: '/jobs/:id',
        handler: 'job.getJob',
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
        },
      },
    ],
  },
};
