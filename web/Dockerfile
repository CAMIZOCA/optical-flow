FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json .
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--strictPort"]
