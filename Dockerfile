# DEVELOPMENT DOCKERFILE ONLY
# THIS DOCKERFILE IS NOT INTENDED FOR PRODUCTION. IT LEVERAGES DEVELOPMENT DEPENDENCIES TO RUN.

FROM node:20-alpine AS builder

RUN mkdir /home/node/app/ && chown -R node:node /home/node/app

WORKDIR /home/node/app

COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock ./

USER node
RUN yarn install --non-interactive --dev && yarn cache clean

FROM node:20-alpine
USER node
ENV NODE_ENV production
WORKDIR /home/node/app
COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock ./
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node vite.config.ts ./
COPY --chown=node:node index.html ./
COPY --chown=node:node ./src/ ./src
COPY --chown=node:node ./public/ ./public
COPY --chown=node:node --from=builder /home/node/app/node_modules ./node_modules

CMD ["yarn", "start"]