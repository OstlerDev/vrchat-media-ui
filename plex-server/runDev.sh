#!/bin/bash

CONTAINER_NAME="plex-server-dev"
IMAGE_NAME="plex-server-dev"

echo "Stopping existing container..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

echo "Building Docker image..."
docker build -t $IMAGE_NAME .

echo "Starting new container..."
# We explicitly set FFMPEG_PATH to /usr/bin/ffmpeg to override any local .env value
docker run -d \
  --name $CONTAINER_NAME \
  -p 4000:4000 \
  --env-file .env \
  -e FFMPEG_PATH=/usr/bin/ffmpeg \
  $IMAGE_NAME

echo "Container $CONTAINER_NAME started on port 4000"
docker logs -f $CONTAINER_NAME
