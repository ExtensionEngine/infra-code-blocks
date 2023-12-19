FROM node:20.9-bookworm-slim@sha256:c325fe5059c504933948ae6483f3402f136b96492dff640ced5dfa1f72a51716 AS base
RUN apt update && apt install -y --no-install-recommends dumb-init
ENTRYPOINT ["dumb-init", "--"]

FROM node:20.9-bookworm@sha256:3c48678afb1ae5ca5931bd154d8c1a92a4783555331b535bbd7e0822f9ca8603 AS install
WORKDIR /usr/src/app
COPY package*.json .
RUN npm ci

FROM base AS configure
WORKDIR /usr/src/app
COPY --chown=node:node --from=install /usr/src/app/node_modules ./node_modules
COPY --chown=node:node ./src ./src
COPY --chown=node:node ./package.json ./tsconfig.json ./
RUN npm run build

FROM configure AS run
USER node
CMD npm run prod
