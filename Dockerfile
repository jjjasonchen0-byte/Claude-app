# Meet — small Node server plus the web app.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY lib ./lib
COPY public ./public
ENV PORT=3000 DATA_FILE=/app/data/db.json
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
