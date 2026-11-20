# A Linux box with a virtual screen, for the e2e tests. Built once by `npm run test:e2e:docker`, then cached.
FROM node:26-bookworm
RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends xvfb xauth libgtk-3-0 libnss3 libgbm1 libasound2 libxss1 libxtst6 libdrm2 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 dbus-x11 \
  && rm -rf /var/lib/apt/lists/*
