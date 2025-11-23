FROM node:22-alpine
WORKDIR /app
# Install ffmpeg and dependencies
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV PORT=4000
EXPOSE 4000
CMD ["npm", "start"]
