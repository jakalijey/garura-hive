FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY economy.mjs identity.mjs ura.mjs payout.mjs server.mjs address.mjs ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8098 DATA_DIR=/data NIMIQ_NETWORK=MainAlbatross
EXPOSE 8098
USER node
CMD ["node", "server.mjs"]
