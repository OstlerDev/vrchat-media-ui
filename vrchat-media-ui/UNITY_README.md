# VRChat Media UI - Unity Project Documentation

## Overview
This project implements a **server-driven UI architecture** for VRChat, allowing a Plex backend to control what users see in-world. It uses VRChat's String Loading and Image Loading APIs to fetch content dynamically and integrates with **VizVid Media Wrapper (VVMW)** for video playback.

## Architecture

### 1. Server-Driven Navigation (Backend)
The Node.js backend (`plex-server`) determines the application state. The Unity client is "dumb" and renders what the server tells it to.

- **Endpoints**:
  - `/api/ui/home`: Returns the initial "Grid" screen configuration.
  - `/api/ui/slots/:id`: Returns a screen configuration for a specific interaction (e.g., clicking a movie).
- **Slots System**:
  - To avoid VRChat URL whitelist limitations, we use a finite set of pre-registered URLs ("Slots").
  - **UI Slots**: The backend maps a dynamic Plex item to a reusable Slot ID for fetching UI data.
  - **Image Slots**: Dedicated slots for high-res posters.
  - **Stream Slots**: Dedicated slots for video stream URLs (passed to VVMW).

### 2. Unity Components (Frontend)
Located in `vrchat-media-ui/Assets/Scripts/`.

#### `APIManager.cs`
The central hub for all network requests.
- **Responsibilities**:
  - Holds references to the static sets of URLs (`slotUrls`, `imageSlotUrls`, `streamSlotUrls`).
  - Performs `VRCStringDownloader` requests.
  - Routes the JSON response to the appropriate "Screen Manager" (`MediaGridManager` or `MediaDetailManager`).
  - Resolves Slot IDs to actual URLs for images and streams.

#### `MediaGridManager.cs`
Handles the "Home" or "Library" view.
- **Responsibilities**:
  - Spawns a grid of `MediaItem` prefabs into a `contentRoot`.
  - Manages **Texture Atlases**. The server combines many movie posters into a single large texture to reduce download calls.
  - Calculates UVs to display the correct portion of the atlas on each item.
  - Assigns an `actionSlotId` to each item so clicks trigger the correct API call.

#### `MediaDetailManager.cs`
Handles the "Single Movie" view and playback.
- **Responsibilities**:
  - Displays Title, Subtitle, and Description.
  - Fetches a high-resolution poster using an `imageSlotId`.
  - Handles the **Play** button logic:
    - Resolves the `streamSlotId` via `APIManager`.
    - Passes the resolved stream URL to the **VVMW** video player.
  - Handles the "Back" button logic (calling `FetchHome`).

#### `MediaItemView.cs`
The script attached to individual grid items.
- **Responsibilities**:
  - Displays text and image content.
  - Handles the **OnClick** event via a Unity UI Button.
  - Forwards clicks to `MediaGridManager` with the assigned `actionSlotId`.

#### `MediaUIButton.cs`
A generic utility script for connecting UI Buttons to Udon events.
- **Responsibilities**:
  - acts as a bridge between a Unity UI Button's `OnClick` event and a custom event on a target UdonBehaviour (e.g., triggering `PlayMovie` on `MediaDetailManager`).

## Project Organization

### Assets/Prefabs Structure
We organize prefabs by their functional role in the application:

#### `elements/`
Reusable UI building blocks.
- `MediaItem.prefab`: The individual card for the grid. Contains `MediaItemView`.
- `PlayButton.prefab`: A reusable play button using `MediaUIButton`.

#### `managers/`
Logic-heavy prefabs that handle data processing and state.
- `APIManager.prefab`: Singleton holding URL configs.
- `MediaGridManager.prefab`: Controls Grid view logic.
- `MediaDetailManager.prefab`: Controls Details view logic.

#### `screens/`
High-level UI layouts (Canvas panels).
- `MediaUIGrid.prefab`: Layout for the Grid screen.
- `MediaUIDetail.prefab`: Layout for the Details screen (Poster, Info, Play Button).
- `MediaUIError.prefab`: Fallback screen for connection errors.

#### Root Level
- `MediaApp.prefab`: The "Master Prefab" that assembles all pieces (Screens + Managers + VVMW) into a single object.

## Data Flow Example (Play a Movie)

1. **User Clicks Item**: `MediaItemView.OnClick()` fires -> `MediaGridManager` calls `APIManager.FetchSlot(actionSlotId)`.
2. **Request**: `APIManager` requests `.../api/ui/slots/5`.
3. **Response**: Backend returns JSON:
   ```json
   {
     "screenType": "details",
     "title": "Big Buck Bunny",
     "imageSlotId": 12,
     "streamSlotId": 3
   }
   ```
4. **Routing**: `APIManager` shows Detail screen.
5. **Rendering**: `MediaDetailManager` updates text and fetches poster from Image Slot #12.
6. **User Clicks Play**: `MediaUIButton` triggers `MediaDetailManager.PlayMovie()`.
7. **Resolution**: `MediaDetailManager` asks `APIManager` for Stream Slot #3 URL.
8. **Playback**: `APIManager` returns `.../stream/slots/3.m3u8`. `MediaDetailManager` passes this to **VVMW** to start playback.

## Developer Notes
- **VVMW Integration**: The project requires `JLChnToZ.VVMW` (VizVid Media Wrapper) for video playback. Ensure the `videoPlayer` field on `MediaDetailManager` is linked to the VVMW Core component.
- **URL Generation**: Use the custom inspector on `APIManager` to batch-generate the slot URLs.
- **Debugging**: Toggle `verboseLogging` on managers to see data flow in the VRChat debug console.
