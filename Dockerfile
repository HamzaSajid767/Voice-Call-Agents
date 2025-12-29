FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY tsconfig.json ./tsconfig.json

RUN npm run build:ts

COPY .env ./.env

ENV NODE_ENV=production
EXPOSE 3010

CMD ["node", "dist/server.js"]

