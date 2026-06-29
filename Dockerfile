FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data.sqlite

EXPOSE 3000

CMD ["npm", "start"]
