#17 112.4 npm notice To update run: npm install -g npm@11.5.2
#17 112.4 npm notice
#17 DONE 118.1s
#19 [arielmatrix_builder  7/14] WORKDIR /app/frontend
#19 DONE 0.7s
#20 [arielmatrix_builder  8/14] RUN npm install --prefer-offline --no-audit && npm run build
#20 0.345 npm error code ENOENT
#20 0.345 npm error syscall open
#20 0.345 npm error path /app/frontend/package.json
#20 0.345 npm error errno -2
#20 0.345 npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/app/frontend/package.json'
#20 0.345 npm error enoent This is related to npm not being able to find a file.
#20 0.345 npm error enoent
#20 0.346 npm error A complete log of this run can be found in: /root/.npm/_logs/2025-08-30T16_46_34_447Z-debug-0.log
#20 ERROR: process "/bin/sh -c npm install --prefer-offline --no-audit && npm run build" did not complete successfully: exit code: 254
------
 > [arielmatrix_builder  8/14] RUN npm install --prefer-offline --no-audit && npm run build:
0.345 npm error code ENOENT
0.345 npm error syscall open
0.345 npm error path /app/frontend/package.json
0.345 npm error errno -2
0.345 npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/app/frontend/package.json'
0.345 npm error enoent This is related to npm not being able to find a file.
0.345 npm error enoent
0.346 npm error A complete log of this run can be found in: /root/.npm/_logs/2025-08-30T16_46_34_447Z-debug-0.log
------
Dockerfile:26
--------------------
  24 |     # Build frontend dependencies and assets
  25 |     WORKDIR /app/frontend
  26 | >>> RUN npm install --prefer-offline --no-audit && npm run build
  27 |     
  28 |     # Switch back to the main working directory
--------------------
error: failed to solve: process "/bin/sh -c npm install --prefer-offline --no-audit && npm run build" did not complete successfully: exit code: 254
