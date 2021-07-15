#!/usr/bin/env node

const spawnCommand = require('spawn-command');

// spawn build first so dist files are ready by the time we start test script
// following startup of the build watcher is going to be really fast, thanks to TS incrememental builds
spawnCommand('npm run build', {
  stdio: 'inherit'
}).on('exit', (exitCode) => {
  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  const build = spawnCommand('npm run build -- -w');

  const test = spawnCommand('npm test -- --watch', {
    stdio: 'inherit'
  });

  test.on('exit', () => {
    build.kill('SIGTERM');
  });
});
