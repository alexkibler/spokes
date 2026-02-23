# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY --from=build /app/dist ./dist
COPY server.js ./

EXPOSE 80

ENV PORT=80

CMD ["node", "server.js"]
