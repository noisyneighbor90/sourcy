FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
RUN rm -rf node_modules/@xmtp node_modules/uint8arrays
COPY . .
EXPOSE 4001
CMD ["npx", "tsx", "src/web-server.ts"]
