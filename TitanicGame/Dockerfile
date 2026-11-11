FROM node:24-bookworm-slim AS builder
WORKDIR /app/TitanicGame
COPY TitanicGame/package.json TitanicGame/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY TitanicGame/ ./
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/TitanicGame
COPY TitanicGame/package.json TitanicGame/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/TitanicGame/build ./build
COPY --from=builder /app/Titanic /app/Titanic
USER node
EXPOSE 3001/tcp 40000-40100/udp
CMD ["node", "build/server/index.js"]
