FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4001
CMD ["npx", "tsx", "src/web-server.ts"]
