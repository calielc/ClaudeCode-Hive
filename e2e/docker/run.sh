#!/bin/bash
# Runs inside the container of `npm run test:e2e:docker`. The repository is mounted read only at /src.
set -e
mkdir -p /work
cd /src
# Copy the sources without the packages and the builds of the host, which are for another system.
tar --exclude=node_modules --exclude=out --exclude=dist --exclude=.git -cf - . | tar -xf - -C /work
cd /work
npm ci --no-audit --no-fund 2>&1 | tail -2
export SHELL=/bin/bash
xvfb-run --auto-servernum npm run test:e2e
