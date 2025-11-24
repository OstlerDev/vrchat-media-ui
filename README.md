# vrchat-media-ui

**vrchat-media-ui** is a system for browsing and playing Plex media directly inside VRChat. It uses a server-driven UI architecture to overcome VRChat's static content limitations, allowing users to browse their library and watch movies/shows dynamically.

## Architecture

The project consists of two main components:

1.  **Unity Client (`vrchat-media-ui/`)**: A VRChat world prefab that renders the UI and handles user interaction. It is "dumb" and relies on the backend for all content and state.
2.  **Plex Proxy Backend (`plex-server/`)**: A Node.js server that connects to your Plex server, generates UI configurations, processes images (atlasing), and proxies video streams for VRChat compatibility.

There is also a `mock-server` provided for testing the UI without a full Plex backend.

## Components

### 📂 vrchat-media-ui (Unity Project)
The frontend implementation using UdonSharp.
- **Features**:
  - Dynamic Grid & Detail views.
  - Texture Atlasing support (reduces download calls).
  - **Video Playback**: Integrated with [VVMW (VizVid Media Wrapper)](https://github.com/VizVid/VVMW) for playing streams.
- **Documentation**: See [vrchat-media-ui/UNITY_README.md](vrchat-media-ui/UNITY_README.md) for setup and prefab details.

### 📂 plex-server (Node.js Backend)
The intelligence of the operation.
- **Features**:
  - Connects to Plex API.
  - Generates HLS video streams (remuxing/transcoding) compatible with VRChat players.
  - Creates optimized texture atlases for the UI grid.
  - Maps dynamic content to static "Slot IDs" for VRChat's String Loading system.
- **Documentation**: See [plex-server/README.md](plex-server/README.md) for configuration and deployment.

### 📂 mock-server
A simple Express server that returns static JSON responses. Useful for developing the Unity UI when you don't have access to the full backend or Plex.

## Quick Start

### 1. Set up the Backend
Navigate to `plex-server` and configure your environment:
```bash
cd plex-server
npm install
cp .env.example .env
# Edit .env with your PLEX_TOKEN and server details
npm run dev
```

### 2. Set up the Unity Project
1. Open the `vrchat-media-ui` folder in Unity (2022.3.22f1 or compatible VRChat version).
2. Ensure you have the required dependencies installed (VRChat SDK, UdonSharp, VVMW).
3. Drag the `MediaApp.prefab` into your scene.
4. Configure the `APIManager` to point to your backend URL (e.g., via the custom inspector).

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
