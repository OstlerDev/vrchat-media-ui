$ContainerName = "plex-server-dev"
$ImageName = "plex-server-dev"

Write-Host "Stopping existing container..."
docker stop $ContainerName 2>$null
docker rm $ContainerName 2>$null

Write-Host "Building Docker image..."
docker build -t $ImageName .

Write-Host "Starting new container..."
# We explicitly set FFMPEG_PATH to /usr/bin/ffmpeg to override any local .env value
docker run -d `
  --name $ContainerName `
  -p 4000:4000 `
  --env-file .env `
  -e FFMPEG_PATH=/usr/bin/ffmpeg `
  $ImageName

Write-Host "Container $ContainerName started on port 4000"
docker logs -f $ContainerName
